package main

import (
	"bytes"    
	"context"
	"encoding/json"  
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"nvr-server/internal/database"
	"nvr-server/internal/detector"
	"nvr-server/internal/models"
)

// --- CONFIGURATION ---
const (
	AccessTokenDuration  = 15 * time.Minute
	RefreshTokenDuration = 30 * 24 * time.Hour
)

var (
	Detector  *detector.Manager
	JwtSecret []byte
)

// --- STRUCTS ---
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

type UserUpdateRequest struct {
	DisplayName string `json:"display_name"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type BatchDeleteRequest struct {
	EventIDs []uint `json:"event_ids"`
}

type SystemSettingsRequest struct {
	RetentionDays int `json:"retention_days"`
}

// --- JWT CLAIMS ---
type JwtCustomClaims struct {
	UserID uint   `json:"uid"`
	Type   string `json:"type"` // "access" or "refresh"
	jwt.RegisteredClaims
}

func main() {
	// 1. Load Secrets
	loadSecrets()

	// 2. Initialize Database
	database.InitDB()
	ensureDefaultSettings()

	// 3. Initialize Detector
	Detector = detector.NewManager()
	Detector.Start()

	// 4. Setup Server
	e := echo.New()
	
	// --- LOGGING CONFIGURATION ---
	e.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{
		Skipper: func(c echo.Context) bool {
			return strings.HasPrefix(c.Request().URL.Path, "/api/system/health")
		},
		Format:           "${time_custom} | ${status} | ${method}\t${uri}\t(${latency_human})\n",
		CustomTimeFormat: "15:04:05",
	}))

	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// 5. Static Files
	e.Static("/recordings", "/recordings")

	// ===========================
	//       PUBLIC ROUTES
	// ===========================

	e.POST("/register", register)
	e.POST("/token", login)
	e.POST("/token/refresh", refresh)
	
	// Webhooks (Motion -> API)
	e.POST("/api/webhook/motion/start/:id", webhookStart)
	e.POST("/api/webhook/motion/end/:id", webhookEnd)
	
	// Internal (AI -> API)
	e.GET("/api/internal/cameras", getAllCameras)

	// ===========================
	//      PROTECTED ROUTES
	// ===========================
	
	authGroup := e.Group("")
	authGroup.Use(jwtMiddleware)

	// User Routes
	authGroup.GET("/users/me", getMe)
	authGroup.PUT("/api/users/me", updateMe)
	authGroup.POST("/api/users/change-password", changePassword)
	authGroup.DELETE("/api/users/delete-account", deleteAccount)
	authGroup.POST("/api/users/logout-all", logoutAll)
	
	// Session Routes
	authGroup.GET("/api/sessions", getSessions)
	authGroup.DELETE("/api/sessions/:id", deleteSession)

	// WebRTC Creds
	authGroup.GET("/api/webrtc-creds", getWebRTCCreds)

	// Cameras
	authGroup.GET("/api/cameras", getCameras)
	authGroup.POST("/api/cameras", createCamera)
	authGroup.PATCH("/api/cameras/:id", updateCamera)
	authGroup.DELETE("/api/cameras/:id", deleteCamera)
	authGroup.POST("/api/cameras/reorder", reorderCameras)
	authGroup.POST("/api/cameras/test-connection", testConnection)
	authGroup.DELETE("/api/cameras/:id/recordings", wipeCameraRecordings)

	// Events
	authGroup.GET("/api/events", getEvents)
	authGroup.GET("/api/events/summary", getEventSummary)
	authGroup.DELETE("/api/events/:id", deleteEvent)
	authGroup.POST("/api/events/batch-delete", batchDeleteEvents)

	// Recordings & System
	authGroup.GET("/api/cameras/:id/recordings", getContinuousRecordings)
	authGroup.GET("/api/cameras/:id/recordings/timeline", getContinuousTimeline)
	authGroup.DELETE("/api/cameras/:id/recordings/:filename", deleteContinuousFile)
	
	authGroup.GET("/api/system/health", getSystemHealth)
	authGroup.GET("/api/system/settings", getSystemSettings)
	authGroup.PUT("/api/system/settings", updateSystemSettings)
	authGroup.POST("/api/system/restart", restartSystem)
	authGroup.DELETE("/api/system/recordings", wipeAllRecordings)
	
	authGroup.GET("/api/download", downloadFile)

	// --- SERVER START ---
	go func() {
		if err := e.Start(":8080"); err != nil && err != http.ErrServerClosed {
			e.Logger.Fatal("shutting down the server")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	
	ctxData, cancelData := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelData()
	
	if err := e.Shutdown(ctxData); err != nil {
		e.Logger.Fatal(err)
	}
}

// --- HELPERS ---

func loadSecrets() {
	content, err := os.ReadFile("/run/secrets/jwt_secret_key")
	if err == nil {
		JwtSecret = []byte(strings.TrimSpace(string(content)))
	} else {
		JwtSecret = []byte("supersecretfallbackkey")
	}
}

func ensureDefaultSettings() {
	var s models.SystemSettings
	if err := database.DB.First(&s).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			database.DB.Create(&models.SystemSettings{RetentionDays: 30})
		}
	}
}

func jwtMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		authHeader := c.Request().Header.Get("Authorization")
		if authHeader == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "Missing token")
		}
		
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.ParseWithClaims(tokenString, &JwtCustomClaims{}, func(token *jwt.Token) (interface{}, error) {
			return JwtSecret, nil
		})

		if err != nil || !token.Valid {
			return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token")
		}

		claims := token.Claims.(*JwtCustomClaims)
		
		var user models.User
		if err := database.DB.First(&user, claims.UserID).Error; err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "User not found")
		}

		if user.TokensValidFrom.After(claims.IssuedAt.Time) {
			return echo.NewHTTPError(http.StatusUnauthorized, "Token revoked")
		}

		c.Set("user", &user)
		return next(c)
	}
}

func getUser(c echo.Context) *models.User {
	return c.Get("user").(*models.User)
}

// --- AUTH HANDLERS ---

func register(c echo.Context) error {
	req := new(RegisterRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"detail": "Invalid request"})
	}

	var count int64
	database.DB.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"detail": "Email already registered"})
	}

	hashed, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	
	user := models.User{
		Email:          req.Email,
		HashedPassword: string(hashed),
		TokensValidFrom: time.Now(),
	}
	database.DB.Create(&user)
	
	return c.JSON(http.StatusOK, user)
}

func login(c echo.Context) error {
	username := c.FormValue("username")
	password := c.FormValue("password")

	var user models.User
	if err := database.DB.Where("email = ?", username).First(&user).Error; err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "Invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(password)); err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "Invalid credentials"})
	}

	return generateTokens(c, &user)
}

func refresh(c echo.Context) error {
	authHeader := c.Request().Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	
	token, err := jwt.ParseWithClaims(tokenString, &JwtCustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return JwtSecret, nil
	})

	if err != nil || !token.Valid {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "Invalid refresh token"})
	}

	claims := token.Claims.(*JwtCustomClaims)
	if claims.Type != "refresh" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "Not a refresh token"})
	}

	var user models.User
	if err := database.DB.First(&user, claims.UserID).Error; err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "User not found"})
	}
	
	if user.TokensValidFrom.After(claims.IssuedAt.Time) {
		return c.JSON(http.StatusUnauthorized, map[string]string{"detail": "Token revoked"})
	}

	return generateTokens(c, &user)
}

func generateTokens(c echo.Context, user *models.User) error {
	now := time.Now()
	
	accessClaims := &JwtCustomClaims{
		UserID: user.ID,
		Type:   "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	accToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accStr, _ := accToken.SignedString(JwtSecret)

	jti := uuid.New().String()
	refreshClaims := &JwtCustomClaims{
		UserID: user.ID,
		Type:   "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(now.Add(RefreshTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	refToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refStr, _ := refToken.SignedString(JwtSecret)

	session := models.UserSession{
		UserID:    user.ID,
		JTI:       jti,
		UserAgent: c.Request().UserAgent(),
		IPAddress: c.RealIP(),
		CreatedAt: now,
		ExpiresAt: now.Add(RefreshTokenDuration),
	}
	database.DB.Create(&session)

	return c.JSON(http.StatusOK, LoginResponse{
		AccessToken:  accStr,
		RefreshToken: refStr,
		TokenType:    "bearer",
	})
}

func getMe(c echo.Context) error {
	return c.JSON(http.StatusOK, getUser(c))
}

func updateMe(c echo.Context) error {
	user := getUser(c)
	req := new(UserUpdateRequest)
	if err := c.Bind(req); err != nil {
		return err
	}
	user.DisplayName = req.DisplayName
	database.DB.Save(user)
	return c.JSON(http.StatusOK, user)
}

func changePassword(c echo.Context) error {
	user := getUser(c)
	req := new(ChangePasswordRequest)
	c.Bind(req)

	if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(req.CurrentPassword)); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"detail": "Incorrect password"})
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	user.HashedPassword = string(hash)
	user.TokensValidFrom = time.Now() 
	database.DB.Save(user)
	
	return c.JSON(http.StatusOK, map[string]string{"message": "Password updated"})
}

func logoutAll(c echo.Context) error {
	user := getUser(c)
	user.TokensValidFrom = time.Now()
	database.DB.Save(user)
	database.DB.Where("user_id = ?", user.ID).Delete(&models.UserSession{})
	return c.JSON(http.StatusOK, map[string]string{"message": "Logged out all sessions"})
}

func getSessions(c echo.Context) error {
	var sessions []models.UserSession
	database.DB.Where("user_id = ?", getUser(c).ID).Find(&sessions)
	return c.JSON(http.StatusOK, sessions)
}

func deleteSession(c echo.Context) error {
	id := c.Param("id")
	database.DB.Delete(&models.UserSession{}, id)
	return c.NoContent(http.StatusNoContent)
}

func deleteAccount(c echo.Context) error {
	user := getUser(c)
	database.DB.Delete(user)
	return c.JSON(http.StatusOK, map[string]string{"message": "Account deleted"})
}

func getWebRTCCreds(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"user": "viewer", "pass": "secret"})
}

// --- CAMERA HANDLERS ---

func getCameras(c echo.Context) error {
	var cameras []models.Camera
	database.DB.Where("owner_id = ?", getUser(c).ID).Order("display_order asc").Find(&cameras)
	return c.JSON(http.StatusOK, cameras)
}

// --- Internal (No Auth) ---
func getAllCameras(c echo.Context) error {
	var cameras []models.Camera
	if err := database.DB.Find(&cameras).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, cameras)
}

func createCamera(c echo.Context) error {
	cam := new(models.Camera)
	if err := c.Bind(cam); err != nil {
		return err
	}
	cam.OwnerID = getUser(c).ID
	
	safeName := strings.ReplaceAll(strings.ToLower(cam.Name), " ", "_")
	cam.Path = fmt.Sprintf("user_%d_%s", cam.OwnerID, safeName)
	
	var maxOrder int
	row := database.DB.Model(&models.Camera{}).Select("MAX(display_order)").Row()
	_ = row.Scan(&maxOrder) 
	cam.DisplayOrder = maxOrder + 1
	
	database.DB.Create(cam)
	Detector.SyncCameras() 
	
	return c.JSON(http.StatusOK, cam)
}

func updateCamera(c echo.Context) error {
	id := c.Param("id")
	var cam models.Camera
	if err := database.DB.First(&cam, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"detail": "Camera not found"})
	}
	
	c.Bind(&cam)
	database.DB.Save(&cam)
	Detector.SyncCameras()
	
	return c.JSON(http.StatusOK, cam)
}

func deleteCamera(c echo.Context) error {
	id := c.Param("id")
	database.DB.Delete(&models.Camera{}, id)
	Detector.SyncCameras()
	return c.NoContent(http.StatusNoContent)
}

func reorderCameras(c echo.Context) error {
	type ReorderReq struct {
		CameraIDs []uint `json:"camera_ids"`
	}
	req := new(ReorderReq)
	c.Bind(req)
	
	for i, id := range req.CameraIDs {
		database.DB.Model(&models.Camera{}).Where("id = ?", id).Update("display_order", i)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "Reordered"})
}

func testConnection(c echo.Context) error {
	type TestReq struct {
		RTSPUrl string `json:"rtsp_url"`
	}
	req := new(TestReq)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
	}

	pathName := fmt.Sprintf("test_%d", time.Now().UnixNano())
	
	payload := map[string]interface{}{
		"source":         req.RTSPUrl,
		"sourceOnDemand": true,
	}
	jsonData, _ := json.Marshal(payload)
	
	url := fmt.Sprintf("http://mediamtx:9997/v3/config/paths/add/%s", pathName)
	apiReq, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	apiReq.SetBasicAuth("admin", "mysecretpassword")
	apiReq.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(apiReq)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "MediaMTX unreachable"})
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		 return c.JSON(http.StatusBadRequest, map[string]string{"error": "Could not connect to camera stream"})
	}

	go func(p string) {
		time.Sleep(60 * time.Second)
		delUrl := fmt.Sprintf("http://mediamtx:9997/v3/config/paths/delete/%s", p)
		delReq, _ := http.NewRequest("DELETE", delUrl, nil)
		delReq.SetBasicAuth("admin", "mysecretpassword")
		client.Do(delReq)
	}(pathName)

	return c.JSON(http.StatusOK, map[string]string{"path": pathName})
}

func wipeCameraRecordings(c echo.Context) error {
	idParam := c.Param("id")
	camID, _ := strconv.Atoi(idParam)
	
	database.DB.Where("camera_id = ?", camID).Delete(&models.Event{})
	
	files, err := os.ReadDir("/recordings")
	if err == nil {
		prefix := fmt.Sprintf("event_%d_", camID)
		for _, f := range files {
			if strings.HasPrefix(f.Name(), prefix) {
				os.Remove(filepath.Join("/recordings", f.Name()))
			}
		}
	}
	
	contPath := filepath.Join("/recordings", "continuous", idParam)
	os.RemoveAll(contPath)
	os.MkdirAll(contPath, 0755)

	return c.JSON(http.StatusOK, map[string]string{"message": "Wiped"})
}

// --- EVENT HANDLERS ---

func getEvents(c echo.Context) error {
	var events []models.Event
	tx := database.DB.Where("user_id = ?", getUser(c).ID).Preload("Camera")
	
	if cid := c.QueryParam("camera_id"); cid != "" {
		tx = tx.Where("camera_id = ?", cid)
	}
	
	tx.Order("start_time desc").Limit(100).Find(&events)
	return c.JSON(http.StatusOK, events)
}

func getEventSummary(c echo.Context) error {
	var events []models.Event
	tx := database.DB.Select("id, start_time, end_time, camera_id").Where("user_id = ?", getUser(c).ID)
	
	if cid := c.QueryParam("camera_id"); cid != "" {
		tx = tx.Where("camera_id = ?", cid)
	}
	if start := c.QueryParam("start_ts"); start != "" {
		tx = tx.Where("start_time >= ?", start)
	}
	if end := c.QueryParam("end_ts"); end != "" {
		tx = tx.Where("start_time <= ?", end)
	}
	
	tx.Order("start_time asc").Find(&events)
	return c.JSON(http.StatusOK, events)
}

func deleteEvent(c echo.Context) error {
	id := c.Param("id")
	var event models.Event
	if err := database.DB.First(&event, id).Error; err == nil {
		if event.VideoPath != "" {
			os.Remove("/" + event.VideoPath)
		}
		if event.ThumbnailPath != "" {
			os.Remove("/" + event.ThumbnailPath)
		}
		database.DB.Delete(&event)
	}
	return c.NoContent(http.StatusNoContent)
}

func batchDeleteEvents(c echo.Context) error {
	req := new(BatchDeleteRequest)
	c.Bind(req)
	
	if len(req.EventIDs) > 0 {
		var events []models.Event
		database.DB.Where("id IN ?", req.EventIDs).Find(&events)
		for _, event := range events {
			if event.VideoPath != "" {
				os.Remove("/" + event.VideoPath)
			}
			if event.ThumbnailPath != "" {
				os.Remove("/" + event.ThumbnailPath)
			}
		}
		database.DB.Delete(&models.Event{}, req.EventIDs)
	}
	
	return c.JSON(http.StatusOK, map[string]string{"message": "Batch deleted"})
}

// --- RECORDING / SYSTEM HANDLERS ---

func getContinuousRecordings(c echo.Context) error {
	id := c.Param("id")
	dateStr := c.QueryParam("date_str") // 2023-11-20
	cleanDate := strings.ReplaceAll(dateStr, "-", "")
	
	type RecFile struct {
		Filename string `json:"filename"`
		Url      string `json:"url"`
		Time     string `json:"time"`
	}
	var results []RecFile
	
	dir := filepath.Join("/recordings", "continuous", id)
	files, _ := os.ReadDir(dir)
	for _, f := range files {
		if strings.HasPrefix(f.Name(), cleanDate) && strings.HasSuffix(f.Name(), ".mp4") {
			parts := strings.Split(f.Name(), "-")
			if len(parts) > 1 {
				timePart := strings.Split(parts[1], ".")[0]
				results = append(results, RecFile{
					Filename: f.Name(),
					Url: fmt.Sprintf("continuous/%s/%s", id, f.Name()),
					Time: timePart,
				})
			}
		}
	}
	return c.JSON(http.StatusOK, results)
}

func getContinuousTimeline(c echo.Context) error {
	return c.JSON(http.StatusOK, []map[string]string{})
}

func deleteContinuousFile(c echo.Context) error {
	id := c.Param("id")
	file := c.Param("filename")
	path := filepath.Join("/recordings", "continuous", id, file)
	os.Remove(path)
	return c.NoContent(http.StatusNoContent)
}

func getSystemHealth(c echo.Context) error {
	// 1. Get Disk Usage
	var stat syscall.Statfs_t
	syscall.Statfs("/recordings", &stat)
	
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	used := total - free
	
	var percent float64 = 0
	if total > 0 {
		percent = (float64(used) / float64(total)) * 100
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"cpu_percent":    0, 
		"memory_total":   16000000000, 
		"memory_used":    4000000000,  
		"memory_percent": 25,
		"disk_total":     total,
		"disk_free":      free,
		"disk_used":      used,
		"disk_percent":   percent,
		"uptime_seconds": 3600,
	})
}

func getSystemSettings(c echo.Context) error {
	var settings models.SystemSettings
	if err := database.DB.First(&settings).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			settings = models.SystemSettings{RetentionDays: 30}
			database.DB.Create(&settings)
		} else {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "DB Error"})
		}
	}
	return c.JSON(http.StatusOK, settings)
}

func updateSystemSettings(c echo.Context) error {
	req := new(SystemSettingsRequest)
	c.Bind(req)
	var settings models.SystemSettings
	if err := database.DB.First(&settings).Error; err != nil {
		settings = models.SystemSettings{RetentionDays: req.RetentionDays}
		database.DB.Create(&settings)
	} else {
		settings.RetentionDays = req.RetentionDays
		database.DB.Save(&settings)
	}
	return c.JSON(http.StatusOK, settings)
}

func wipeAllRecordings(c echo.Context) error {
	database.DB.Exec("DELETE FROM events")
	files, _ := os.ReadDir("/recordings")
	for _, f := range files {
		if !f.IsDir() && (strings.HasSuffix(f.Name(), ".mp4") || strings.HasSuffix(f.Name(), ".jpg")) {
			os.Remove(filepath.Join("/recordings", f.Name()))
		}
	}
	os.RemoveAll("/recordings/continuous")
	os.MkdirAll("/recordings/continuous", 0755)
	return c.JSON(http.StatusOK, map[string]string{"message": "Wiped"})
}

func restartSystem(c echo.Context) error { 
	go performSystemRestart()
	return c.JSON(http.StatusOK, map[string]string{"message": "Restarting"}) 
}

func downloadFile(c echo.Context) error {
	path := c.QueryParam("path")
	if strings.Contains(path, "..") || strings.HasPrefix(path, "/") {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid path")
	}
	return c.File("/" + path)
}

// --- WEBHOOKS ---
func webhookStart(c echo.Context) error {
	id, _ := strconv.Atoi(c.Param("id"))
	Detector.StartEventRecord(uint(id))
	return c.String(http.StatusOK, "OK")
}
func webhookEnd(c echo.Context) error {
	id, _ := strconv.Atoi(c.Param("id"))
	Detector.StopEventRecord(uint(id))
	return c.String(http.StatusOK, "OK")
}

// performSystemRestart connects to the Docker Socket
func performSystemRestart() {
	log.Println("--- SYSTEM RESTART INITIATED ---")
	
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("Error creating docker client: %v\n", err)
		return
	}

	containers, err := cli.ContainerList(context.Background(), types.ContainerListOptions{})
	if err != nil {
		log.Printf("Error listing containers: %v\n", err)
		return
	}

	myHostname, _ := os.Hostname()

	for _, c := range containers {
		if strings.HasPrefix(c.ID, myHostname) || strings.HasPrefix(myHostname, c.ID) {
			continue
		}
		match := false
		for _, name := range c.Names {
			if strings.Contains(name, "motion-detector") || strings.Contains(name, "mediamtx") {
				match = true
				break
			}
		}

		if match {
			log.Printf("Restarting container: %s\n", c.Names[0])
			timeout := 10
			cli.ContainerRestart(context.Background(), c.ID, container.StopOptions{Timeout: &timeout})
		}
	}

	log.Println("Restarting Backend (Self)...")
	time.Sleep(2 * time.Second)
	os.Exit(0) 
}