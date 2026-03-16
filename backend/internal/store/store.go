package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
	"golang.org/x/oauth2"
)

const googleProvider = "google"

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) HasGoogleToken(ctx context.Context) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM oauth_tokens WHERE provider = ? LIMIT 1`, googleProvider).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check token existence: %w", err)
	}

	return true, nil
}

func (s *Store) GetGoogleToken(ctx context.Context) (*oauth2.Token, error) {
	var accessToken string
	var refreshToken string
	var tokenType sql.NullString
	var expiryText sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT access_token, refresh_token, token_type, expiry
		FROM oauth_tokens
		WHERE provider = ?
	`, googleProvider).Scan(&accessToken, &refreshToken, &tokenType, &expiryText)
	if err != nil {
		return nil, err
	}

	token := &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    tokenType.String,
	}

	if expiryText.Valid && expiryText.String != "" {
		expiry, err := time.Parse(time.RFC3339, expiryText.String)
		if err != nil {
			return nil, fmt.Errorf("parse token expiry: %w", err)
		}
		token.Expiry = expiry
	}

	return token, nil
}

func (s *Store) SaveGoogleToken(ctx context.Context, token *oauth2.Token) error {
	refreshToken := token.RefreshToken
	if refreshToken == "" {
		existing, err := s.GetGoogleToken(ctx)
		if err == nil {
			refreshToken = existing.RefreshToken
		} else if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("read existing token before save: %w", err)
		}
	}

	if refreshToken == "" {
		return errors.New("missing refresh token")
	}

	expiry := ""
	if !token.Expiry.IsZero() {
		expiry = token.Expiry.UTC().Format(time.RFC3339)
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_type, expiry, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(provider) DO UPDATE SET
			access_token = excluded.access_token,
			refresh_token = excluded.refresh_token,
			token_type = excluded.token_type,
			expiry = excluded.expiry,
			updated_at = CURRENT_TIMESTAMP
	`, googleProvider, token.AccessToken, refreshToken, token.TokenType, expiry)
	if err != nil {
		return fmt.Errorf("save google token: %w", err)
	}

	return nil
}

func (s *Store) ClearGoogleToken(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM oauth_tokens WHERE provider = ?`, googleProvider)
	if err != nil {
		return fmt.Errorf("clear google token: %w", err)
	}

	return nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS oauth_tokens (
			provider TEXT PRIMARY KEY,
			access_token TEXT NOT NULL,
			refresh_token TEXT NOT NULL,
			token_type TEXT,
			expiry TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("migrate oauth_tokens: %w", err)
	}

	return nil
}
