import './styles.css';

type WeatherCode =
  | 0
  | 1
  | 2
  | 3
  | 45
  | 48
  | 51
  | 53
  | 55
  | 61
  | 63
  | 65
  | 71
  | 73
  | 75
  | 80
  | 81
  | 82
  | 95
  | 96
  | 99;

type WeatherSnapshot = {
  currentTemp: number;
  currentCode: WeatherCode;
  maxTemp: number;
  minTemp: number;
  updatedAt: string;
  hourly: Array<{
    time: string;
    temperature: number;
    precipitationProbability: number;
    weatherCode: WeatherCode;
  }>;
};

type CalendarEvent = {
  id: string;
  summary: string;
  startLabel: string;
  endLabel: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
};

type CalendarSnapshot = {
  events: CalendarEvent[];
  updatedAt: string;
};

type CalendarGroup = {
  label: string;
  events: CalendarEvent[];
};

type AuthStatusResponse = {
  configured: boolean;
  authenticated: boolean;
  message: string;
};

type DashboardState = {
  weather: WeatherSnapshot | null;
  calendar: CalendarSnapshot | null;
  weatherStatus: string;
  calendarStatus: string;
  isCalendarConfigured: boolean;
  isCalendarAuthorized: boolean;
  isOffline: boolean;
  lastError: string | null;
};

const WEATHER_STORAGE_KEY = 'home-dashboard.weather';
const CALENDAR_STORAGE_KEY = 'home-dashboard.calendar';
const WEATHER_POLL_MS = 15 * 60 * 1000;
const CALENDAR_POLL_MS = 10 * 60 * 1000;

const config = {
  latitude: parseFloat(import.meta.env.VITE_LATITUDE ?? '35.6764'),
  longitude: parseFloat(import.meta.env.VITE_LONGITUDE ?? '139.6500'),
  timezone: import.meta.env.VITE_TIMEZONE ?? 'Asia/Tokyo',
  locationLabel: import.meta.env.VITE_LOCATION_LABEL ?? 'Home',
  apiBase: normalizeBaseUrl(import.meta.env.VITE_API_BASE ?? 'http://localhost:8080')
};

const weatherCodeLabelMap: Record<WeatherCode, string> = {
  0: 'Clear Sky',
  1: 'Mostly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  80: 'Showers',
  81: 'Rain',
  82: 'Violent Rain',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ Hail',
  99: 'Severe Thunderstorm'
};

const weatherCodeSymbolMap: Record<WeatherCode, string> = {
  0: '☀',
  1: '☀',
  2: '☁',
  3: '☁',
  45: '☁',
  48: '☁',
  51: '☂',
  53: '☂',
  55: '☂',
  61: '☂',
  63: '☂',
  65: '☂',
  71: '❄',
  73: '❄',
  75: '❄',
  80: '☂',
  81: '☂',
  82: '☂',
  95: '⚡',
  96: '⚡',
  99: '⚡'
};

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('App root was not found.');
}

const app = appRoot;

const state: DashboardState = {
  weather: readSnapshot<WeatherSnapshot>(WEATHER_STORAGE_KEY),
  calendar: readSnapshot<CalendarSnapshot>(CALENDAR_STORAGE_KEY),
  weatherStatus: 'Loading weather',
  calendarStatus: 'Checking calendar connection',
  isCalendarConfigured: true,
  isCalendarAuthorized: false,
  isOffline: !window.navigator.onLine,
  lastError: null
};

renderFull();
startClock();
setupConnectivityWatcher();
registerServiceWorker();
void refreshWeather();
void setupCalendar();

window.setInterval(() => {
  void refreshWeather();
}, WEATHER_POLL_MS);

window.setInterval(() => {
  if (state.isCalendarAuthorized) {
    void refreshCalendar();
  }
}, CALENDAR_POLL_MS);

function startClock() {
  window.setInterval(() => {
    updateClock();
  }, 1000);
}

function setupConnectivityWatcher() {
  window.addEventListener('online', () => {
    state.isOffline = false;
    void refreshWeather();
    if (state.isCalendarAuthorized) {
      void refreshCalendar();
    } else {
      void refreshCalendarAuthStatus();
    }
  });

  window.addEventListener('offline', () => {
    state.isOffline = true;
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    void window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js');
    });
  }
}

async function setupCalendar() {
  await refreshCalendarAuthStatus();
  if (state.isCalendarAuthorized) {
    await refreshCalendar();
  } else {
    updateCalendar();
  }
}

async function refreshCalendarAuthStatus() {
  try {
    const response = await fetch(buildApiUrl('/api/auth/status'), {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`calendar-status:${response.status}`);
    }

    const status = (await response.json()) as AuthStatusResponse;
    state.isCalendarConfigured = status.configured;
    state.isCalendarAuthorized = status.authenticated;
    state.calendarStatus = status.message;
    state.lastError = null;
  } catch (error) {
    state.isCalendarConfigured = true;
    state.isCalendarAuthorized = false;
    state.calendarStatus = 'Calendar service unavailable';
    state.lastError = error instanceof Error ? error.message : 'unknown-calendar-status-error';
  }

  updateCalendar();
}

async function refreshWeather() {
  state.weatherStatus = 'Updating weather';

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(config.latitude));
    url.searchParams.set('longitude', String(config.longitude));
    url.searchParams.set('timezone', config.timezone);
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
    url.searchParams.set('forecast_days', '2');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`weather:${response.status}`);
    }

    const payload = (await response.json()) as OpenMeteoResponse;
    const snapshot = toWeatherSnapshot(payload);
    state.weather = snapshot;
    state.weatherStatus = `Updated ${formatShortTime(snapshot.updatedAt)}`;
    state.lastError = null;
    writeSnapshot(WEATHER_STORAGE_KEY, snapshot);
  } catch (error) {
    state.weatherStatus = state.weather ? `Offline - last updated ${formatShortTime(state.weather.updatedAt)}` : 'Unable to fetch weather';
    state.lastError = error instanceof Error ? error.message : 'unknown-weather-error';
  }

  updateWeather();
}

async function refreshCalendar() {
  if (!state.isCalendarConfigured || !state.isCalendarAuthorized) {
    return;
  }

  state.calendarStatus = 'Updating events';

  try {
    const response = await fetch(buildApiUrl('/api/calendar/events'), {
      credentials: 'include'
    });

    if (response.status === 401) {
      state.isCalendarAuthorized = false;
      state.calendarStatus = 'Reconnect Google Calendar';
      updateCalendar();
      return;
    }

    if (response.status === 503) {
      state.isCalendarConfigured = false;
      state.isCalendarAuthorized = false;
      state.calendarStatus = 'Calendar not configured';
      updateCalendar();
      return;
    }

    if (!response.ok) {
      throw new Error(`calendar:${response.status}`);
    }

    const snapshot = (await response.json()) as CalendarSnapshot;
    state.calendar = snapshot;
    state.calendarStatus = `Updated ${formatShortTime(snapshot.updatedAt)}`;
    state.lastError = null;
    writeSnapshot(CALENDAR_STORAGE_KEY, snapshot);
  } catch (error) {
    state.calendarStatus = state.calendar ? `Offline - last updated ${formatShortTime(state.calendar.updatedAt)}` : 'Unable to fetch events';
    state.lastError = error instanceof Error ? error.message : 'unknown-calendar-error';
  }

  updateCalendar();
}

function renderFull() {
  const now = new Date();

  app.innerHTML = `
    <main class="dashboard">
      <section class="hero">
        <div>
          <p class="date" id="date-display">${formatDate(now)}</p>
          <h1 class="clock" id="clock-display">${formatClock(now)}</h1>
        </div>
        <div id="weather-display">${renderTodayWeather()}</div>
      </section>

      <section class="hourly" id="hourly-display">
        ${renderHourlyCards()}
      </section>

      <section class="calendar" id="calendar-display">
        ${renderCalendarContent()}
      </section>
    </main>
  `;

  attachCalendarListeners();
}

function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById('date-display');
  const clockEl = document.getElementById('clock-display');
  if (dateEl) dateEl.textContent = formatDate(now);
  if (clockEl) clockEl.textContent = formatClock(now);
}

function updateWeather() {
  const weatherEl = document.getElementById('weather-display');
  const hourlyEl = document.getElementById('hourly-display');
  if (weatherEl) weatherEl.innerHTML = renderTodayWeather();
  if (hourlyEl) hourlyEl.innerHTML = renderHourlyCards();
}

function updateCalendar() {
  const calendarEl = document.getElementById('calendar-display');
  if (calendarEl) {
    calendarEl.innerHTML = renderCalendarContent();
    attachCalendarListeners();
  }
}

function attachCalendarListeners() {
  const connectButton = app.querySelector<HTMLButtonElement>('[data-action="connect-calendar"]');
  connectButton?.addEventListener('click', () => {
    window.location.href = buildApiUrl('/auth/login');
  });

  const refreshButton = app.querySelector<HTMLButtonElement>('[data-action="refresh-calendar"]');
  refreshButton?.addEventListener('click', () => {
    void refreshCalendar();
  });
}

function renderTodayWeather() {
  if (!state.weather) {
    return '<div class="hero-weather"><p class="weather-loading">-</p></div>';
  }

  const icon = weatherCodeSymbolMap[state.weather.currentCode];
  const label = weatherCodeLabelMap[state.weather.currentCode];

  return `
    <div class="hero-weather">
      <div class="weather-main">
        <span class="weather-icon">${icon}</span>
        <span class="current-temp">${Math.round(state.weather.currentTemp)}°</span>
      </div>
      <p class="weather-detail">${label} / ${Math.round(state.weather.maxTemp)}° / ${Math.round(state.weather.minTemp)}°</p>
      <p class="weather-location">${escapeHtml(config.locationLabel)}</p>
    </div>
  `;
}

function renderHourlyCards() {
  if (!state.weather) {
    return '<p class="hourly-empty">-</p>';
  }

  const cards = state.weather.hourly
    .map(
      (entry) => `
        <div class="hour-card">
          <span class="hc-time">${formatHour(entry.time)}</span>
          <span class="hc-icon">${weatherCodeSymbolMap[entry.weatherCode]}</span>
          <span class="hc-temp">${Math.round(entry.temperature)}°</span>
          <span class="hc-precip">${Math.round(entry.precipitationProbability)}%</span>
        </div>
      `
    )
    .join('');

  return `<div class="hourly-track">${cards}</div>`;
}

function renderCalendarContent() {
  if (!state.isCalendarConfigured) {
    return '<p class="cal-empty">Calendar not configured</p>';
  }

  if (!state.isCalendarAuthorized) {
    return `
      <div class="calendar-head">
        <button class="cal-btn" data-action="connect-calendar">Connect Google Calendar</button>
      </div>
      <p class="cal-empty">${escapeHtml(state.calendarStatus)}</p>
    `;
  }

  const header = `
    <div class="calendar-head">
      <button class="cal-btn" data-action="refresh-calendar">Refresh</button>
    </div>
  `;

  if (!state.calendar || state.calendar.events.length === 0) {
    return `${header}<p class="cal-empty">No upcoming events</p>`;
  }

  const groups = groupCalendarEvents(state.calendar.events)
    .map(
      (group) => `
        <div class="cal-group">
          <p class="cal-group-label">${group.label}</p>
          ${group.events
            .map(
              (event) => `
                <div class="cal-event${event.isAllDay ? ' cal-event--allday' : ''}">
                  <span class="cal-event-time">${event.isAllDay ? 'All Day' : `${event.startLabel} - ${event.endLabel}`}</span>
                  <span class="cal-event-summary">${escapeHtml(event.summary)}</span>
                  <span class="cal-event-badge">${describeCalendarEvent(event)}</span>
                </div>
              `
            )
            .join('')}
        </div>
      `
    )
    .join('');

  return `${header}<div class="calendar-body">${groups}</div>`;
}

function toWeatherSnapshot(payload: OpenMeteoResponse): WeatherSnapshot {
  const currentCode = toWeatherCode(payload.current.weather_code);
  const startIndex = findNextHourlyIndex(payload.hourly.time);
  const hourly = payload.hourly.time.slice(startIndex, startIndex + 6).map((time, offset) => {
    const index = startIndex + offset;

    return {
      time,
      temperature: payload.hourly.temperature_2m[index],
      precipitationProbability: payload.hourly.precipitation_probability[index],
      weatherCode: toWeatherCode(payload.hourly.weather_code[index])
    };
  });

  return {
    currentTemp: payload.current.temperature_2m,
    currentCode,
    maxTemp: payload.daily.temperature_2m_max[0],
    minTemp: payload.daily.temperature_2m_min[0],
    updatedAt: new Date().toISOString(),
    hourly
  };
}

function findNextHourlyIndex(times: string[]) {
  const now = Date.now();
  const foundIndex = times.findIndex((entry) => new Date(entry).getTime() >= now - 60 * 60 * 1000);

  return foundIndex === -1 ? 0 : foundIndex;
}

function groupCalendarEvents(events: CalendarEvent[]): CalendarGroup[] {
  const grouped = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const key = new Date(event.startDate).toDateString();
    const existing = grouped.get(key);
    if (existing) {
      existing.push(event);
    } else {
      grouped.set(key, [event]);
    }
  }

  return Array.from(grouped.entries()).map(([key, groupedEvents]) => ({
    label: formatCalendarGroupLabel(key),
    events: groupedEvents.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return 0;
    })
  }));
}

function readSnapshot<T>(key: string): T | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function writeSnapshot<T>(key: string, snapshot: T) {
  window.localStorage.setItem(key, JSON.stringify(snapshot));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function formatHour(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function formatCalendarGroupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function describeCalendarEvent(event: CalendarEvent) {
  if (event.isAllDay) {
    return 'All Day';
  }

  const now = Date.now();
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime();

  if (start <= now && now <= end) {
    return 'Now';
  }

  return '';
}

function toWeatherCode(value: number): WeatherCode {
  if (value in weatherCodeLabelMap) {
    return value as WeatherCode;
  }

  return 3;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, '');
}

function buildApiUrl(path: string) {
  return `${config.apiBase}${path}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type OpenMeteoResponse = {
  current: {
    temperature_2m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};