# Home Dashboard

A serverless living-room dashboard that runs entirely in the browser. Displays date, time, weather, and Google Calendar on a single screen.

## Features

- Always-on display of date, day of week, and current time
- Fetches today's weather, high/low temps, and 12-hour hourly temperature & precipitation probability from Open-Meteo
- Reads and displays a family Google Calendar via the Google Calendar API
- Falls back to localStorage cache when fetch fails
- PWA with Service Worker for offline support
- Minimal, low-saturation black-and-white layout

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
- When offline, the Service Worker and localStorage cache keep the last display
- For production, disable auto-sleep on the display device
