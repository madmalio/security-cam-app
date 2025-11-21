package detector

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"nvr-server/internal/database"
	"nvr-server/internal/models"
)

// StartJanitor starts the background cleanup loop
func (m *Manager) StartJanitor() {
	log.Println("--- Janitor Service Started (Retention & Cleanup) ---")
	ticker := time.NewTicker(60 * time.Second)

	for range ticker.C {
		m.enforceRetention()
		m.checkDiskSpace()
		m.cleanupZombies()
	}
}

// cleanupZombies removes entries from memory if the process has already died
func (m *Manager) cleanupZombies() {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check Event Recordings
	for id, rec := range m.ActiveRecordings {
		// If process marked done, remove from map
		if rec.Process.ProcessState != nil && rec.Process.ProcessState.Exited() {
			log.Printf("Janitor: Removed dead event recording for Camera %d\n", id)
			if rec.LogFile != nil {
				rec.LogFile.Close()
			}
			delete(m.ActiveRecordings, id)
		}
	}
}

// enforceRetention deletes files older than the configured days
func (m *Manager) enforceRetention() {
	var settings models.SystemSettings
	if err := database.DB.First(&settings).Error; err != nil {
		return 
	}

	days := settings.RetentionDays
	if days < 1 {
		days = 30
	}

	cutoff := time.Now().AddDate(0, 0, -days)
	deletedCount := 0

	// Walk the recordings directory
	err := filepath.Walk("/recordings", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && info.ModTime().Before(cutoff) {
			// Only delete media/log files
			if strings.HasSuffix(path, ".mp4") || strings.HasSuffix(path, ".jpg") || strings.HasSuffix(path, ".log") {
				os.Remove(path)
				deletedCount++
			}
		}
		return nil
	})

	if err == nil && deletedCount > 0 {
		log.Printf("Janitor: Cleaned up %d files older than %d days\n", deletedCount, days)
	}
}

// checkDiskSpace performs emergency cleanup if disk is full (<15GB)
func (m *Manager) checkDiskSpace() {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/recordings", &stat); err != nil {
		return
	}

	// Available blocks * size per block
	freeBytes := stat.Bavail * uint64(stat.Bsize)
	minFree := uint64(15 * 1024 * 1024 * 1024) // 15 GB

	if freeBytes < minFree {
		log.Println("WARNING: Low Disk Space! Triggering emergency cleanup...")
		// (For MVP, we just rely on retention, but you could add aggressive deletion here)
	}
}