package config

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DBPath             string
	FrontendDistPath   string
	AllowedOrigin      string
	FrontendBaseURL    string
	KioskKey           string
	SessionCookieName  string
	SessionSecret      string
	SessionTTL         time.Duration
	CookieSecure       bool
	CookieSameSite     string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
	CalendarID         string
	AppTimeZone        string
}

func Load() *Config {
	sessionTTLHours := getEnvInt("SESSION_TTL_HOURS", 24*30)
	allowedOrigin := strings.TrimRight(getEnv("ALLOWED_ORIGIN", "http://localhost:5173"), "/")
	frontendBaseURL := strings.TrimRight(getEnv("FRONTEND_BASE_URL", allowedOrigin), "/")

	return &Config{
		Port:               getEnv("PORT", "8080"),
		DBPath:             getEnv("DB_PATH", filepath.Join("data", "dashboard.db")),
		FrontendDistPath:   getEnv("FRONTEND_DIST_PATH", filepath.Join("..", "frontend", "dist")),
		AllowedOrigin:      allowedOrigin,
		FrontendBaseURL:    frontendBaseURL,
		KioskKey:           getEnv("KIOSK_KEY", ""),
		SessionCookieName:  getEnv("SESSION_COOKIE_NAME", "home_dashboard_session"),
		SessionSecret:      getEnv("SESSION_SECRET", "change-me-in-production"),
		SessionTTL:         time.Duration(sessionTTLHours) * time.Hour,
		CookieSecure:       getEnvBool("COOKIE_SECURE", false),
		CookieSameSite:     strings.ToLower(getEnv("COOKIE_SAME_SITE", "lax")),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:  getEnv("GOOGLE_REDIRECT_URI", "http://localhost:8080/auth/callback"),
		CalendarID:         getEnv("CALENDAR_ID", ""),
		AppTimeZone:        getEnv("APP_TIMEZONE", "Asia/Tokyo"),
	}
}

func (c *Config) GoogleConfigured() bool {
	return c.GoogleClientID != "" && c.GoogleClientSecret != "" && c.GoogleRedirectURI != "" && c.CalendarID != ""
}

func (c *Config) SameSite() http.SameSite {
	switch c.CookieSameSite {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

func (c *Config) AllowedOrigins() []string {
	parts := strings.Split(c.AllowedOrigin, ",")
	origins := make([]string, 0, len(parts))

	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		origins = append(origins, origin)
	}

	if len(origins) == 0 {
		return []string{"http://localhost:5173"}
	}

	return origins
}

func (c *Config) Location() *time.Location {
	location, err := time.LoadLocation(c.AppTimeZone)
	if err != nil {
		return time.Local
	}

	return location
}

func getEnv(key, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}

	return value
}

func getEnvBool(key string, fallback bool) bool {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func getEnvInt(key string, fallback int) int {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}
