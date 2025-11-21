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
	os.MkdirAll("/var/log/motion", 0755)
	os.MkdirAll("/app/motion_confs", 0755) 
	os.MkdirAll("/recordings", 0755)

	log.Println("--- Detector Manager Started ---")

	// Initial sync
	m.SyncCameras()

	// Start background loops
	go m.StartJanitor()
	go m.monitorLoop()
}

func (m *Manager) monitorLoop() {
	ticker := time.NewTicker(10 * time.Second)
	for range ticker.C {
		m.SyncCameras()
	}
}

// SyncCameras ensures processes match desired state AND MediaMTX is configured
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
				if proc.LogFile != nil {
					proc.LogFile.Close()
				}
				delete(m.ContinuousProcs, cam.ID)
			}
		}
		
		// 2. Handle Motion Detection
		if cam.MotionType == "active" {
			if _, exists := m.MotionProcs[cam.ID]; !exists {
				m.spawnMotion(cam)
			}
		} else {
			if cmd, exists := m.MotionProcs[cam.ID]; exists {
				m.killProcess(cmd)
				delete(m.MotionProcs, cam.ID)
			}
		}
	}
}

// registerMediaMTX talks to the MediaMTX API to configure the stream path
func (m *Manager) registerMediaMTX(cam models.Camera) {
	if cam.RTSPUrl == "" {
		return
	}

	// --- FIX: CACHE CHECK ---
	// If we already registered this camera with this exact URL, skip the API call.
	// This stops the log spam and high CPU usage.
	if lastURL, ok := m.RegisteredPaths[cam.ID]; ok && lastURL == cam.RTSPUrl {
		return
	}

	// Payload for MediaMTX: sourceOnDemand=false for INSTANT loading
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

	// If 404, it means path doesn't exist, so we create it with POST
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

	// --- FIX: Update Cache on success ---
	m.RegisteredPaths[cam.ID] = cam.RTSPUrl
	log.Printf("[%s] Registered with MediaMTX (Cached)", cam.Name)
}

func (m *Manager) spawnMotion(cam models.Camera) {
	log.Printf("[%s] Starting Motion Detection...\n", cam.Name)

	confPath := filepath.Join("/app/motion_confs", fmt.Sprintf("cam_%d.conf", cam.ID))
	
	// --- FIX: Generate Mask File ---
	maskPath := filepath.Join("/app/motion_confs", fmt.Sprintf("cam_%d_mask.pgm", cam.ID))
	generateMaskFile(cam.MotionROI, maskPath)
	// -------------------------------

	streamUrl := cam.RTSPUrl
	if cam.RTSPSubstreamUrl != "" {
		streamUrl = cam.RTSPSubstreamUrl
	}

	threshold := 5000 - (cam.MotionSensitivity * 47) 
	if threshold < 300 { threshold = 300 }

	// --- FIX: Add mask_file line to config ---
	configContent := fmt.Sprintf(`
daemon off
setup_mode off
log_level 6
log_type file
log_file /var/log/motion/motion_%d.log

netcam_url %s
rtsp_transport tcp

on_event_start curl -X POST http://localhost:8080/api/webhook/motion/start/%d
on_event_end curl -X POST http://localhost:8080/api/webhook/motion/end/%d

mask_file %s

threshold %d
despeckle Eedl
minimum_motion_frames 1
event_gap 30
pre_capture 0
post_capture 0

output_pictures off
output_debug_pictures off
ffmpeg_output_movies off
`, cam.ID, streamUrl, cam.ID, cam.ID, maskPath, threshold)

	if err := os.WriteFile(confPath, []byte(configContent), 0644); err != nil {
		log.Printf("Error writing motion conf: %v\n", err)
		return
	}

	cmd := exec.Command("motion", "-c", confPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if err := cmd.Start(); err != nil {
		log.Printf("[%s] Failed to start motion: %v\n", cam.Name, err)
		return
	}

	m.MotionProcs[cam.ID] = cmd
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

	logFile, _ := os.Create(fmt.Sprintf("/var/log/motion/continuous_%d.log", cam.ID))
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		log.Printf("[%s] Failed to start continuous: %v\n", cam.Name, err)
		return
	}

	m.ContinuousProcs[cam.ID] = &ContinuousProcess{
		Process: cmd,
		LogFile: logFile,
	}
}

func (m *Manager) StartEventRecord(camID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.ActiveRecordings[camID]; exists {
		return nil
	}

	var cam models.Camera
	if err := database.DB.First(&cam, camID).Error; err != nil {
		return err
	}

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
	
	if err := cmd.Start(); err != nil {
		return err
	}

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
	defer m.mu.Unlock()

	rec, exists := m.ActiveRecordings[camID]
	if !exists {
		return nil
	}

	m.killProcess(rec.Process)

	var event models.Event
	if err := database.DB.First(&event, rec.EventID).Error; err == nil {
		event.EndTime = time.Now()
		go m.generateThumbnail(rec.VideoPath, event.ID)
		database.DB.Save(&event)
	}

	delete(m.ActiveRecordings, camID)
	return nil
}

func (m *Manager) killProcess(cmd *exec.Cmd) {
	if cmd != nil && cmd.Process != nil {
		syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	}
}

func (m *Manager) generateThumbnail(videoPath string, eventID uint) {
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