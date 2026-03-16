package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"home-dashboard/backend/internal/config"
	"home-dashboard/backend/internal/store"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const oauthStateCookieName = "home_dashboard_oauth_state"
const kioskHeaderName = "X-Home-Dashboard-Kiosk-Key"

type Service struct {
	config      *config.Config
	store       *store.Store
	oauthConfig *oauth2.Config
}

type StatusResponse struct {
	Configured    bool   `json:"configured"`
	Authenticated bool   `json:"authenticated"`
	Message       string `json:"message"`
}

func NewService(cfg *config.Config, tokenStore *store.Store) *Service {
	return &Service{
		config: cfg,
		store:  tokenStore,
		oauthConfig: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURI,
			Scopes:       []string{"https://www.googleapis.com/auth/calendar.readonly"},
			Endpoint:     google.Endpoint,
		},
	}
}

func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.config.GoogleConfigured() {
		http.Error(w, "calendar auth is not configured", http.StatusServiceUnavailable)
		return
	}

	state, err := randomToken(32)
	if err != nil {
		http.Error(w, "unable to generate oauth state", http.StatusInternalServerError)
		return
	}

	s.setCookie(w, oauthStateCookieName, state, time.Now().Add(10*time.Minute))

	authURL := s.oauthConfig.AuthCodeURL(
		state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.SetAuthURLParam("include_granted_scopes", "true"),
	)

	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Service) HandleCallback(w http.ResponseWriter, r *http.Request) {
	if !s.config.GoogleConfigured() {
		http.Error(w, "calendar auth is not configured", http.StatusServiceUnavailable)
		return
	}

	stateCookie, err := r.Cookie(oauthStateCookieName)
	if err != nil || stateCookie.Value == "" || r.URL.Query().Get("state") != stateCookie.Value {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing oauth code", http.StatusBadRequest)
		return
	}

	token, err := s.oauthConfig.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, "failed to exchange oauth code", http.StatusBadGateway)
		return
	}

	if err := s.store.SaveGoogleToken(r.Context(), token); err != nil {
		http.Error(w, "failed to persist oauth token", http.StatusInternalServerError)
		return
	}

	s.clearCookie(w, oauthStateCookieName)
	s.setCookie(w, s.config.SessionCookieName, s.makeAuthCookieValue(time.Now().Add(s.config.SessionTTL)), time.Now().Add(s.config.SessionTTL))

	http.Redirect(w, r, s.config.FrontendBaseURL, http.StatusFound)
}

func (s *Service) HandleStatus(w http.ResponseWriter, r *http.Request) {
	status, code := s.status(r.Context(), r)
	writeJSON(w, code, status)
}

func (s *Service) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.ClearAuthorization(r.Context()); err != nil {
		http.Error(w, "failed to clear stored token", http.StatusInternalServerError)
		return
	}

	s.clearCookie(w, s.config.SessionCookieName)
	writeJSON(w, http.StatusOK, StatusResponse{
		Configured:    s.config.GoogleConfigured(),
		Authenticated: false,
		Message:       "Calendar disconnected",
	})
}

func (s *Service) AuthorizedToken(ctx context.Context) (*oauth2.Token, error) {
	storedToken, err := s.store.GetGoogleToken(ctx)
	if err != nil {
		return nil, err
	}

	tokenSource := s.oauthConfig.TokenSource(ctx, storedToken)
	currentToken, err := tokenSource.Token()
	if err != nil {
		return nil, err
	}

	if err := s.store.SaveGoogleToken(ctx, currentToken); err != nil {
		return nil, err
	}

	return currentToken, nil
}

func (s *Service) ClearAuthorization(ctx context.Context) error {
	if err := s.store.ClearGoogleToken(ctx); err != nil {
		return err
	}

	return nil
}

func (s *Service) IsAuthenticated(r *http.Request) bool {
	if !s.config.GoogleConfigured() {
		return false
	}

	cookie, err := r.Cookie(s.config.SessionCookieName)
	if err != nil {
		return false
	}

	return s.isValidAuthCookie(cookie.Value)
}

func (s *Service) HasKioskAccess(r *http.Request) bool {
	if s.config.KioskKey == "" {
		return false
	}

	providedKey := strings.TrimSpace(r.Header.Get(kioskHeaderName))
	if providedKey == "" {
		providedKey = strings.TrimSpace(r.URL.Query().Get("kiosk"))
	}

	if providedKey == "" {
		return false
	}

	return hmac.Equal([]byte(providedKey), []byte(s.config.KioskKey))
}

func (s *Service) IsAuthorizedRequest(r *http.Request) bool {
	return s.IsAuthenticated(r) || s.HasKioskAccess(r)
}

func (s *Service) status(ctx context.Context, r *http.Request) (StatusResponse, int) {
	if !s.config.GoogleConfigured() {
		return StatusResponse{
			Configured:    false,
			Authenticated: false,
			Message:       "Calendar not configured",
		}, http.StatusOK
	}

	hasStoredToken, err := s.store.HasGoogleToken(ctx)
	if err != nil {
		return StatusResponse{
			Configured:    true,
			Authenticated: false,
			Message:       "Unable to read stored calendar auth",
		}, http.StatusInternalServerError
	}

	if !hasStoredToken {
		return StatusResponse{
			Configured:    true,
			Authenticated: false,
			Message:       "Calendar not connected",
		}, http.StatusOK
	}

	if !s.IsAuthorizedRequest(r) {
		return StatusResponse{
			Configured:    true,
			Authenticated: false,
			Message:       "Reconnect Google Calendar",
		}, http.StatusOK
	}

	return StatusResponse{
		Configured:    true,
		Authenticated: true,
		Message:       "Calendar connected",
	}, http.StatusOK
}

func (s *Service) setCookie(w http.ResponseWriter, name, value string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
		HttpOnly: true,
		Secure:   s.config.CookieSecure,
		SameSite: s.config.SameSite(),
	})
}

func (s *Service) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.config.CookieSecure,
		SameSite: s.config.SameSite(),
	})
}

func (s *Service) makeAuthCookieValue(expiresAt time.Time) string {
	payload := strconv.FormatInt(expiresAt.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(s.config.SessionSecret))
	_, _ = mac.Write([]byte(payload))
	return payload + "." + hex.EncodeToString(mac.Sum(nil))
}

func (s *Service) isValidAuthCookie(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return false
	}

	expiresAt, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}

	if time.Now().After(time.Unix(expiresAt, 0)) {
		return false
	}

	expected := s.makeAuthCookieValue(time.Unix(expiresAt, 0))
	return hmac.Equal([]byte(expected), []byte(value))
}

func randomToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func IsTokenMissing(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
