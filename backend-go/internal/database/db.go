package database

import (
	"fmt"
	"log"
	"os"
	"strings"

	"nvr-server/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB() {
	// 1. Read password from Docker Secret (preferred) or fallback
	password := "supersecret" // Default for local dev
	
	// Try reading from secret file
	content, err := os.ReadFile("/run/secrets/db_password")
	if err == nil {
		password = strings.TrimSpace(string(content))
	}

	dsn := fmt.Sprintf("host=db user=admin password=%s dbname=cameradb port=5432 sslmode=disable TimeZone=UTC", password)

	// 2. Connect
	var dbErr error
	DB, dbErr = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if dbErr != nil {
		log.Fatal("Failed to connect to database: ", dbErr)
	}

	// 3. Auto-Migrate (Updates table schema if changed)
	log.Println("--- DB: Running Auto-Migration ---")
	DB.AutoMigrate(
		&models.User{},
		&models.Camera{},
		&models.Event{},
		&models.UserSession{},
		&models.SystemSettings{},
	)
}