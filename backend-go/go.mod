module nvr-server

go 1.24.0

require (
	github.com/docker/distribution v2.8.2+incompatible // <--- THE FIX
	github.com/docker/docker v24.0.9+incompatible
	github.com/labstack/echo/v4 v4.11.4
	gorm.io/driver/postgres v1.5.6
	gorm.io/gorm v1.25.7
)

require (
	github.com/golang-jwt/jwt/v5 v5.3.0 // indirect
	golang.org/x/crypto v0.45.0 // indirect
)
