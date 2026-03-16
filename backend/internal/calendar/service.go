package calendar

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"home-dashboard/backend/internal/auth"
	"home-dashboard/backend/internal/config"
)

type Service struct {
	config *config.Config
	auth   *auth.Service
	client *http.Client
}

type Snapshot struct {
	Events    []Event `json:"events"`
	UpdatedAt string  `json:"updatedAt"`
}

type Event struct {
	ID         string `json:"id"`
	Summary    string `json:"summary"`
	StartLabel string `json:"startLabel"`
	EndLabel   string `json:"endLabel"`
	StartDate  string `json:"startDate"`
	EndDate    string `json:"endDate"`
	IsAllDay   bool   `json:"isAllDay"`
}

type googleEventsResponse struct {
	Items []googleEvent `json:"items"`
}

type googleEvent struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Start   struct {
		Date     string `json:"date"`
		DateTime string `json:"dateTime"`
	} `json:"start"`
	End struct {
		Date     string `json:"date"`
		DateTime string `json:"dateTime"`
	} `json:"end"`
}

var errCalendarUnauthorized = errors.New("calendar unauthorized")

func NewService(cfg *config.Config, authService *auth.Service) *Service {
	return &Service{
		config: cfg,
		auth:   authService,
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *Service) HandleEvents(w http.ResponseWriter, r *http.Request) {
	if !s.config.GoogleConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Calendar not configured"})
		return
	}

	if !s.auth.IsAuthenticated(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Reconnect Google Calendar"})
		return
	}

	token, err := s.auth.AuthorizedToken(r.Context())
	if err != nil {
		statusCode := http.StatusBadGateway
		if auth.IsTokenMissing(err) {
			statusCode = http.StatusUnauthorized
		}
		writeJSON(w, statusCode, map[string]string{"message": "Unable to authorize calendar request"})
		return
	}

	snapshot, err := s.fetchSnapshot(token.AccessToken)
	if err != nil {
		if errors.Is(err, errCalendarUnauthorized) {
			_ = s.auth.ClearAuthorization(r.Context())
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Reconnect Google Calendar"})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"message": "Unable to fetch calendar events"})
		return
	}

	writeJSON(w, http.StatusOK, snapshot)
}

func (s *Service) fetchSnapshot(accessToken string) (*Snapshot, error) {
	rangeStart := time.Now().UTC()
	rangeEnd := rangeStart.Add(7 * 24 * time.Hour)

	endpoint := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events", url.PathEscape(s.config.CalendarID))
	requestURL, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse google calendar url: %w", err)
	}

	query := requestURL.Query()
	query.Set("singleEvents", "true")
	query.Set("orderBy", "startTime")
	query.Set("timeMin", rangeStart.Format(time.RFC3339))
	query.Set("timeMax", rangeEnd.Format(time.RFC3339))
	query.Set("maxResults", "20")
	requestURL.RawQuery = query.Encode()

	req, err := http.NewRequest(http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create google calendar request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("perform google calendar request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, errCalendarUnauthorized
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google calendar returned status %d", resp.StatusCode)
	}

	var payload googleEventsResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode google calendar response: %w", err)
	}

	events := make([]Event, 0, len(payload.Items))
	for _, item := range payload.Items {
		events = append(events, s.toEvent(item))
	}

	return &Snapshot{
		Events:    events,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) toEvent(item googleEvent) Event {
	isAllDay := item.Start.Date != ""
	startDate := item.Start.DateTime
	if isAllDay {
		startDate = item.Start.Date
	}
	if startDate == "" {
		startDate = time.Now().UTC().Format(time.RFC3339)
	}

	endDate := item.End.DateTime
	if isAllDay {
		endDate = item.End.Date
	}
	if endDate == "" {
		endDate = startDate
	}

	return Event{
		ID:         item.ID,
		Summary:    defaultSummary(item.Summary),
		StartLabel: labelForDate(startDate, isAllDay, s.config.Location()),
		EndLabel:   labelForDate(endDate, isAllDay, s.config.Location()),
		StartDate:  startDate,
		EndDate:    endDate,
		IsAllDay:   isAllDay,
	}
}

func defaultSummary(summary string) string {
	if summary == "" {
		return "Untitled"
	}
	return summary
}

func labelForDate(value string, isAllDay bool, location *time.Location) string {
	if isAllDay {
		return "All Day"
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return ""
	}

	return parsed.In(location).Format("15:04")
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
