package models

import (
	"time"
)

type User struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	Email           string    `gorm:"uniqueIndex" json:"email"`
	HashedPassword  string    `json:"-"`
	DisplayName     string    `json:"display_name"`
	GravatarHash    string    `json:"gravatar_hash"`
	TokensValidFrom time.Time `json:"tokens_valid_from"`
}

type Camera struct {
	ID                  uint   `gorm:"primaryKey" json:"id"`
	Name                string `json:"name"`
	Path                string `gorm:"uniqueIndex" json:"path"`
	RTSPUrl             string `json:"rtsp_url"`
	RTSPSubstreamUrl    string `json:"rtsp_substream_url"`
	OwnerID             uint   `json:"owner_id"`
	DisplayOrder        int    `json:"display_order"`
	MotionType          string `json:"motion_type"`
	MotionROI           string `json:"motion_roi"`
	MotionSensitivity   int    `json:"motion_sensitivity"`
	ContinuousRecording bool   `json:"continuous_recording"`
	
	// --- REQUIRED FOR SELECTION ---
	AIClasses string `json:"ai_classes"` 
	
	// --- REQUIRED FOR CRASH FIX ---
	Events []Event `gorm:"foreignKey:CameraID;constraint:OnDelete:CASCADE;" json:"-"`
}

type Event struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	CameraID      uint      `json:"camera_id"`
	UserID        uint      `json:"user_id"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	Reason        string    `json:"reason"`
	VideoPath     string    `json:"video_path"`
	ThumbnailPath string    `json:"thumbnail_path"`

	// --- REQUIRED FOR CRASH FIX ---
	Camera Camera `gorm:"foreignKey:CameraID" json:"camera"`
}

type UserSession struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	JTI       string    `gorm:"uniqueIndex" json:"jti"`
	UserID    uint      `json:"user_id"`
	UserAgent string    `json:"user_agent"`
	IPAddress string    `json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

type SystemSettings struct {
	ID            uint `gorm:"primaryKey" json:"id"`
	RetentionDays int  `json:"retention_days"`
}