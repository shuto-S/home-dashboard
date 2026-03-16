# Home Dashboard

An e-ink optimized home dashboard built with a Vite + TypeScript frontend and a Go + chi backend. It shows date, time, weather, and Google Calendar on a single screen, while the backend owns OAuth, refresh-token persistence, and Calendar API access.

## Features

- Always-on display of date, day of week, and current time with 1-second clock refresh
- Current weather, high/low temperatures, and a 6-hour forecast from Open-Meteo
- Google Calendar events fetched through a Go API instead of direct browser OAuth
- SQLite-backed refresh-token persistence for long-lived Calendar access
- localStorage cache for weather and calendar snapshots during reloads and offline periods
- PWA support with Service Worker for static asset caching

## Architecture

- **Frontend**: Vite + TypeScript in `frontend/`
- **Backend**: Go + chi in `backend/`
- **Calendar auth**: Google OAuth authorization-code flow handled by the backend
- **Calendar token storage**: SQLite database at `backend/data/dashboard.db` by default
- **Browser auth state**: HttpOnly session cookie issued by the Go API

The frontend never stores Google access tokens. It calls the backend with `credentials: 'include'`, and the backend refreshes tokens as needed before calling the Google Calendar API.

## E-ink display optimization

- **Partial DOM updates** — The clock updates every second via `textContent` replacement on two elements. Weather and calendar sections update only when data changes.
- **High-contrast palette** — Text uses a small set of solid grayscale values instead of low-opacity grays.
- **System-first typography** — The main UI uses system fonts, with a monospaced display font for the date and clock.
- **Simple monochrome weather glyphs** — Weather conditions are rendered with Unicode symbols instead of icon fonts.
- **Fixed hourly forecast grid** — The forecast is presented as a 6-hour grid with no horizontal scrolling.
- **No motion effects** — Animations and transitions are removed to reduce ghosting on e-ink panels.

## Frontend setup

1. Install frontend dependencies.

   \`\`\`bash
   make frontend-install
   \`\`\`

2. Create the frontend environment file.

   \`\`\`bash
   cp frontend/.env.example frontend/.env
   \`\`\`

3. Configure these frontend values in `frontend/.env`:

   - `VITE_LATITUDE`: location latitude
   - `VITE_LONGITUDE`: location longitude
   - `VITE_TIMEZONE`: e.g. `Asia/Tokyo`
   - `VITE_LOCATION_LABEL`: display label such as `Home`
   - `VITE_API_BASE`: backend base URL, e.g. `http://localhost:8080`

## Backend setup

1. Create the backend environment file.

   \`\`\`bash
   cp backend/.env.example backend/.env
   \`\`\`

2. Configure these backend values in `backend/.env`:

   - `GOOGLE_CLIENT_ID`: Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
   - `GOOGLE_REDIRECT_URI`: callback URL handled by the Go server
   - `CALENDAR_ID`: target Google Calendar ID
   - `ALLOWED_ORIGIN`: frontend origin allowed by CORS, e.g. `http://localhost:5173`
   - `FRONTEND_BASE_URL`: URL to redirect back to after successful login
   - `KIOSK_KEY`: optional shared secret for read-only kiosk devices that should bypass browser-side Google login
   - `SESSION_SECRET`: long random string used to sign the session cookie
   - `DB_PATH`: optional SQLite file path override

## Local development

Run the frontend and backend either together from the repo root or separately.

Together:

\`\`\`bash
make dev
\`\`\`

`make dev` prints both local and LAN URLs, then starts both processes. The frontend is pinned to port `5173` with Vite `--strictPort`, so startup fails instead of silently changing ports.

For Kindle Fire or other older browsers, prefer a production preview instead of the Vite dev server:

```bash
make device-preview
```

`make device-preview` builds the frontend with legacy browser support enabled and serves it on port `4173`.

For the most reliable Kindle setup, serve the built frontend from the Go backend on the same origin:

```bash
make device-serve
```

That removes the separate frontend port entirely. The device only needs to open the backend URL on port `8080`.

Separate terminals:

Frontend:

\`\`\`bash
make dev-client
\`\`\`

Backend:

\`\`\`bash
make dev-server
\`\`\`

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`

For Kindle or other devices on the same Wi-Fi, open the printed LAN frontend URL, for example:

- `http://192.168.4.42:5173`

If the device shows a blank page with the dev server, use the preview URL instead:

- `http://192.168.4.42:4173`

If the device reports resource-load errors such as `Error Code: -102`, use the single-origin backend URL instead:

- `http://192.168.4.42:8080`

## Google Calendar configuration

Create a Google OAuth client and register the backend callback URL as an authorized redirect URI.

Local development example:

- `http://localhost:8080/auth/callback`

Production example:

- `https://api.example.com/auth/callback`

The backend requests `https://www.googleapis.com/auth/calendar.readonly` and stores the returned refresh token in SQLite. That allows the dashboard to keep reconnecting to Calendar without repeating the full browser-side token flow.

To find the calendar ID, open the target Google Calendar, go to **Settings and sharing**, and copy the **Calendar ID**. Family calendars usually look like `xxxx@group.calendar.google.com`.

## Kindle / kiosk mode

If Google login inside the device browser is unreliable, use the dashboard in kiosk mode.

1. On a normal browser, authenticate once through `Connect Google Calendar` so the backend stores the refresh token.
2. Set `KIOSK_KEY` in `backend/.env` to a long random value and restart the backend.
3. Open the dashboard on the kiosk device with a URL like:

   \`\`\`text
   http://192.168.4.42:8080/?kiosk=your-shared-secret
   \`\`\`

4. The frontend stores that key locally and starts calling the backend with a read-only kiosk header.

In kiosk mode the device never goes through the Google OAuth browser flow. It only reads calendar data that the backend can already access.

## Build

- Frontend only: `make build-client`
- Backend only: `make build-server`
- Full build: `make build`

The frontend output is written to `frontend/dist/`. The backend compiles from `backend/`.

## Deployment notes

- The backend should run over HTTPS in production if the frontend and API are on separate origins and you want robust cookie-based auth.
- The frontend must call the backend with credentials included.
- The backend is intentionally minimal and assumes a single Google account for a household dashboard.
- Weather remains client-side; only Google Calendar auth and event fetching are moved server-side.

## Verification checklist

- Frontend shows weather after `make dev` or `make dev-client`
- `GET /health` on the backend returns OK
- Google login succeeds and redirects back to the frontend
- Calendar events appear after authentication
- Restarting the Go server preserves Calendar access through SQLite token storage
- Restarting the browser preserves access while the backend session cookie remains valid
- `make build` succeeds
