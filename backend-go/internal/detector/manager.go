package detector

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"nvr-server/internal/database"
	"nvr-server/internal/models"
)

// Start kicks off the loops
func (m *Manager) Start() {
	// Ensure directories exist
	os.MkdirAll("/recordings", 0755)
	os.MkdirAll("/var/log/nvr", 0755)

	log.Println("--- Detector Manager Started ---")
	m.SyncCameras()
	go m.StartJanitor()
	go m.monitorLoop()
}

func (m *Manager) monitorLoop() {
	ticker := time.NewTicker(10 * time.Second)
	for range ticker.C {
		m.SyncCameras()
	}
}

func (m *Manager) SyncCameras() {
	var cameras []models.Camera
	if err := database.DB.Find(&cameras).Error; err != nil {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, cam := range cameras {
		// 0. Register with MediaMTX
		m.registerMediaMTX(cam)

		// 1. Handle Continuous Recording
		if cam.ContinuousRecording {
			if _, exists := m.ContinuousProcs[cam.ID]; !exists {
				m.spawnContinuous(cam)
			}
		} else {
			if proc, exists := m.ContinuousProcs[cam.ID]; exists {
				m.killProcess(proc.Process)
				if proc.LogFile != nil { proc.LogFile.Close() }
				delete(m.ContinuousProcs, cam.ID)
			}
		}
		
		// NOTE: "Active" Motion Detection is now handled purely by external AI (webhook)
		// We no longer spawn 'motion' daemon processes here.
	}
}

func (m *Manager) registerMediaMTX(cam models.Camera) {
	if cam.RTSPUrl == "" { return }

	if lastURL, ok := m.RegisteredPaths[cam.ID]; ok && lastURL == cam.RTSPUrl {
		return
	}

	payload := map[string]interface{}{
		"source":         cam.RTSPUrl,
		"sourceOnDemand": false, 
	}
	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("http://mediamtx:9997/v3/config/paths/patch/%s", cam.Path)
	
	req, _ := http.NewRequest("PATCH", url, bytes.NewBuffer(jsonData))
	req.SetBasicAuth("admin", "mysecretpassword")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	
	if err != nil {
		log.Printf("[%s] MediaMTX API Error: %v", cam.Name, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		postUrl := fmt.Sprintf("http://mediamtx:9997/v3/config/paths/add/%s", cam.Path)
		reqPost, _ := http.NewRequest("POST", postUrl, bytes.NewBuffer(jsonData))
		reqPost.SetBasicAuth("admin", "mysecretpassword")
		reqPost.Header.Set("Content-Type", "application/json")
		
		respPost, errPost := client.Do(reqPost)
		if errPost == nil {
			defer respPost.Body.Close()
		}
	}
	m.RegisteredPaths[cam.ID] = cam.RTSPUrl
	log.Printf("[%s] Registered with MediaMTX (Cached)", cam.Name)
}

func (m *Manager) spawnContinuous(cam models.Camera) {
	log.Printf("[%s] Starting 24/7 Recording...\n", cam.Name)
	outDir := filepath.Join("/recordings", "continuous", strconv.Itoa(int(cam.ID)))
	os.MkdirAll(outDir, 0755)
	outPattern := filepath.Join(outDir, "%Y%m%d-%H%M%S.mp4")

	cmd := exec.Command("ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", cam.RTSPUrl,
		"-c:v", "copy",
		"-c:a", "copy",
		"-f", "segment",
		"-segment_time", "900",
		"-strftime", "1",
		"-reset_timestamps", "1",
		outPattern,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	logFile, _ := os.Create(fmt.Sprintf("/var/log/nvr/continuous_%d.log", cam.ID))
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil { return }
	m.ContinuousProcs[cam.ID] = &ContinuousProcess{Process: cmd, LogFile: logFile}
}

func (m *Manager) StartEventRecord(camID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.ActiveRecordings[camID]; exists { return nil }

	var cam models.Camera
	if err := database.DB.First(&cam, camID).Error; err != nil { return err }

	now := time.Now()
	filename := fmt.Sprintf("event_%d_%s.mp4", camID, now.Format("20060102-150405"))
	relPath := filepath.Join("recordings", filename)
	absPath := filepath.Join("/", relPath)

	event := models.Event{
		CameraID:  cam.ID,
		UserID:    cam.OwnerID,
		StartTime: now,
		VideoPath: relPath,
		Reason:    "motion",
	}
	database.DB.Create(&event)

	cmd := exec.Command("ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", cam.RTSPUrl,
		"-c:v", "copy",
		"-c:a", "copy",
		"-f", "mp4",
		"-movflags", "frag_keyframe+empty_moov",
		absPath,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	
	if err := cmd.Start(); err != nil { return err }

	m.ActiveRecordings[camID] = &ActiveRecording{
		Process:   cmd,
		EventID:   event.ID,
		VideoPath: absPath,
		StartTime: now,
	}
	
	log.Printf("Started Event %d for Camera %d\n", event.ID, camID)
	return nil
}

func (m *Manager) StopEventRecord(camID uint) error {
	m.mu.Lock()

	rec, exists := m.ActiveRecordings[camID]
	if !exists {
		m.mu.Unlock()
		return nil
	}

	duration := time.Since(rec.StartTime)
	if duration < 5*time.Second {
		m.mu.Unlock()
		go func(id uint, delay time.Duration) {
			time.Sleep(delay)
			m.delayedStop(id)
		}(camID, 5*time.Second - duration)
		return nil
	}

	if rec.Process.Process != nil {
		rec.Process.Process.Signal(syscall.SIGTERM)
	}

	done := make(chan error, 1)
	go func() { done <- rec.Process.Wait() }()

	m.mu.Unlock()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		if rec.Process.Process != nil {
			rec.Process.Process.Kill()
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Validate File
	info, err := os.Stat(rec.VideoPath)
	isValid := false
	if err == nil && info.Size() > 50000 { 
		isValid = true
	}

	if !isValid {
		log.Printf("Event %d discarded (too small).", rec.EventID)
		os.Remove(rec.VideoPath)
		database.DB.Delete(&models.Event{}, rec.EventID)
	} else {
		var event models.Event
		if err := database.DB.First(&event, rec.EventID).Error; err == nil {
			event.EndTime = time.Now()
			go m.generateThumbnail(rec.VideoPath, event.ID)
			database.DB.Save(&event)
		}
	}

	delete(m.ActiveRecordings, camID)
	return nil
}

func (m *Manager) delayedStop(camID uint) {
	m.mu.Lock()
	_, exists := m.ActiveRecordings[camID]
	if !exists {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock() 
	m.StopEventRecord(camID)
}

func (m *Manager) killProcess(cmd *exec.Cmd) {
	if cmd != nil && cmd.Process != nil {
		syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	}
}

func (m *Manager) generateThumbnail(videoPath string, eventID uint) {
	time.Sleep(500 * time.Millisecond)
	thumbPath := strings.Replace(videoPath, ".mp4", ".jpg", 1)
	cmd := exec.Command("ffmpeg", 
		"-i", videoPath, 
		"-ss", "00:00:01", 
		"-vframes", "1", 
		"-q:v", "2", 
		thumbPath,
	)
	if err := cmd.Run(); err == nil {
		relThumb := strings.TrimPrefix(thumbPath, "/")
		database.DB.Model(&models.Event{}).Where("id = ?", eventID).Update("thumbnail_path", relThumb)
	}
}