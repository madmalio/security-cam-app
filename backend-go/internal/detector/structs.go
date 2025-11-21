package detector

import (
	"os"
	"os/exec"
	"sync"
	"time"
)

// ActiveRecording tracks an ongoing event recording
type ActiveRecording struct {
	Process   *exec.Cmd
	EventID   uint
	VideoPath string
	ThumbPath string
	StartTime time.Time
	LogFile   *os.File
}

// ContinuousProcess tracks a 24/7 ffmpeg loop
type ContinuousProcess struct {
	Process *exec.Cmd
	LogFile *os.File
}

// Manager holds the state of all surveillance processes
type Manager struct {
	// Mutex to prevent race conditions
	mu sync.Mutex

	// Map of CameraID -> Continuous FFmpeg Process
	ContinuousProcs map[uint]*ContinuousProcess

	// Map of CameraID -> Active Event Recording
	ActiveRecordings map[uint]*ActiveRecording

	// Map of CameraID -> Motion Detection Process
	MotionProcs map[uint]*exec.Cmd

	// --- FIX: Cache to prevent API spam ---
	// Map of CameraID -> RTSP URL (Last successfully registered URL)
	RegisteredPaths map[uint]string
}

// NewManager initializes the manager
func NewManager() *Manager {
	return &Manager{
		ContinuousProcs:  make(map[uint]*ContinuousProcess),
		ActiveRecordings: make(map[uint]*ActiveRecording),
		MotionProcs:      make(map[uint]*exec.Cmd),
		RegisteredPaths:  make(map[uint]string), // Initialize the map
	}
}