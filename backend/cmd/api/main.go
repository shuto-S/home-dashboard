package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"home-dashboard/backend/internal/auth"
	"home-dashboard/backend/internal/calendar"
	"home-dashboard/backend/internal/config"
	"home-dashboard/backend/internal/store"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()
	tokenStore, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open token store: %v", err)
	}
	defer tokenStore.Close()

	authService := auth.NewService(cfg, tokenStore)
	calendarService := calendar.NewService(cfg, authService)

	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.Logger)
	router.Use(chimiddleware.Recoverer)
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins(),
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Home-Dashboard-Kiosk-Key"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	router.Get("/auth/login", authService.HandleLogin)
	router.Get("/auth/callback", authService.HandleCallback)
	router.Get("/api/auth/status", authService.HandleStatus)
	router.Post("/api/auth/logout", authService.HandleLogout)
	router.Get("/api/calendar/events", calendarService.HandleEvents)
	registerFrontend(router, cfg)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("home-dashboard api listening on http://localhost:%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("start server: %v", err)
		}
	}()

	signalContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-signalContext.Done()

	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("shutdown server: %v", err)
	}
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		_, _ = w.Write([]byte(`{"message":"failed to encode response"}`))
	}
}

func registerFrontend(router chi.Router, cfg *config.Config) {
	distPath := filepath.Clean(cfg.FrontendDistPath)
	indexPath := filepath.Join(distPath, "index.html")

	if _, err := os.Stat(indexPath); err != nil {
		log.Printf("frontend dist not found at %s; skipping static frontend serving", distPath)
		return
	}

	router.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}

		requestPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		if requestPath == "." || requestPath == "" {
			http.ServeFile(w, r, indexPath)
			return
		}

		assetPath := filepath.Join(distPath, requestPath)
		if info, err := os.Stat(assetPath); err == nil && !info.IsDir() {
			http.ServeFile(w, r, assetPath)
			return
		}

		http.ServeFile(w, r, indexPath)
	}))
}
