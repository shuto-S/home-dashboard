# Home Dashboard

A serverless living-room dashboard optimized for e-ink displays. Runs entirely in the browser and shows date, time, weather, and Google Calendar on a single screen.

## Features

- Always-on display of date, day of week, and current time (1-second refresh)
- Today's weather, high/low temps, and 12-hour hourly forecast from Open-Meteo
- Family Google Calendar via the Google Calendar API
- localStorage cache for instant display on reload and offline fallback
- PWA with Service Worker for offline support

## E-ink display optimization

The UI is designed for low-refresh-rate e-ink monitors commonly used for always-on home dashboards.

- **Partial DOM updates** — The clock updates every second via `textContent` replacement on two elements. Weather and calendar sections update only on data fetch (15 min / 10 min), avoiding full-page repaints.
- **High-contrast palette** — All text uses 3 tonal levels (`#111`, `#333`–`#444`, `#555`–`#666`) against a white background. No semi-transparent grays that would dither on e-ink.
- **System fonts** — No web font loading. Uses `system-ui` / `-apple-system` / `Helvetica Neue` for consistent, bold rendering without sub-pixel aliasing.
- **Unicode weather symbols** — Weather conditions are shown with basic Unicode glyphs (☀ ☁ ☂ ❄ ⚡) instead of an icon font, ensuring crisp monochrome rendering.
- **Fixed grid hourly forecast** — The 12-hour forecast uses a wrapping flex grid (6 columns on desktop, 4 on tablet, 3 on mobile) instead of horizontal scrolling.
- **No animations or transitions** — All hover effects and CSS transitions are removed to avoid ghosting artifacts.
- **Visible borders** — Structural separators use solid `#bbb` / `#ddd` instead of near-invisible rgba borders.

## Setup

1. Install dependencies.

   \`\`\`bash
   npm install
   \`\`\`

2. Create the environment file.

   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Set the following in \`.env\`:

   - \`VITE_LATITUDE\`: Your location's latitude
   - \`VITE_LONGITUDE\`: Your location's longitude
   - \`VITE_TIMEZONE\`: e.g. \`Asia/Tokyo\`
   - \`VITE_LOCATION_LABEL\`: Display label for the location, e.g. \`Home\`
   - \`VITE_CALENDAR_ID\`: Google family calendar ID
   - \`VITE_GOOGLE_CLIENT_ID\`: OAuth client ID from Google Cloud

4. Start the dev server.

   \`\`\`bash
   npm run dev
   \`\`\`

5. For always-on display on a home device, use fullscreen mode and install as a PWA.

## Google Calendar configuration

- Create an OAuth client in Google Cloud Console and add your dev URL as an authorized JavaScript origin
- Use the scope \`https://www.googleapis.com/auth/calendar.readonly\`
- Find the calendar ID in Google Calendar settings

### OAuth setup example

For local development, add these as authorized JavaScript origins:

- \`http://localhost:5173\`
- \`http://127.0.0.1:5173\`

For a fixed home device, also add its URL, e.g.:

- \`http://192.168.1.10:5173\`
- \`https://dashboard.example.local\`

### Calendar ID example

Open the target calendar in Google Calendar, go to Settings and sharing, and find the Calendar ID. Family calendars typically have the format \`xxxx@group.calendar.google.com\`.

## Deployment

- Dev: \`npm run dev\`
- Production build: \`npm run build\`
- Output goes to \`dist/\` — serve it with any static file host

Practical options for home-only use:

- Serve \`dist/\` from an always-on Mac or Raspberry Pi
- Deploy to Vercel or Netlify and set the OAuth allowed origin to match

## Verification checklist

- After setting \`.env\`, weather appears on \`npm run dev\`
- Google auth works and calendar events are displayed
- Last display is preserved when network is disconnected
- Layout fits a single screen on mobile widths
- \`npm run build\` succeeds

## Notes

- Google Calendar requires a one-time auth flow
- No server-side secrets are needed — all APIs are browser-safe
- When offline, t`he Service Worker and localStorage cache keep the last display
- For production, disable auto-sleep on the display device
- Calendar event badges show only "All Day" or "Now" (no stale relative times like "in 32m")
