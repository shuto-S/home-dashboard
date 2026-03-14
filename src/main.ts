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

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
        };
      };
    };
  }
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type TokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
};

const WEATHER_STORAGE_KEY = 'home-dashboard.weather';
const CALENDAR_STORAGE_KEY = 'home-dashboard.calendar';
const WEATHER_POLL_MS = 15 * 60 * 1000;
const CALENDAR_POLL_MS = 10 * 60 * 1000;

const config = {
  latitude: parseFloat(import.meta.env.VITE_LATITUDE ?? '35.6764'),
  longitude: parseFloat(import.meta.env.VITE_LONGITUDE ?? '139.6500'),
  timezone: import.meta.env.VITE_TIMEZONE ?? 'Asia/Tokyo',
  locationLabel: import.meta.env.VITE_LOCATION_LABEL ?? '自宅',
  calendarId: import.meta.env.VITE_CALENDAR_ID ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
};

const weatherCodeLabelMap: Record<WeatherCode, string> = {
  0: '快晴',
  1: '晴れ',
  2: '薄曇り',
  3: '曇り',
  45: '霧',
  48: '霧氷',
  51: '小雨',
  53: '雨',
  55: '強い雨',
  61: '小雨',
  63: '雨',
  65: '強い雨',
  71: '小雪',
  73: '雪',
  75: '大雪',
  80: 'にわか雨',
  81: '雨',
  82: '激しい雨',
  95: '雷雨',
  96: '雷雨と雹',
  99: '激しい雷雨'
};

const weatherCodeSymbolMap: Record<WeatherCode, string> = {
  0: '○',
  1: '◐',
  2: '◑',
  3: '●',
  45: '〰',
  48: '〰',
  51: '﹒',
  53: '︙',
  55: '⋮',
  61: '﹒',
  63: '︙',
  65: '⋮',
  71: '✳',
  73: '✳',
  75: '✳',
  80: '﹒',
  81: '︙',
  82: '⋮',
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
  weatherStatus: '天気を取得中',
  calendarStatus: config.calendarId && config.googleClientId ? 'カレンダー未接続' : 'カレンダー設定待ち',
  isCalendarConfigured: Boolean(config.calendarId && config.googleClientId),
  isCalendarAuthorized: false,
  isOffline: !window.navigator.onLine,
  lastError: null
};

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;

render();
startClock();
setupConnectivityWatcher();
registerServiceWorker();
void refreshWeather();
setupCalendar();

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
    render();
  }, 1000);
}

function setupConnectivityWatcher() {
  window.addEventListener('online', () => {
    state.isOffline = false;
    render();
    void refreshWeather();
    if (state.isCalendarAuthorized) {
      void refreshCalendar();
    }
  });

  window.addEventListener('offline', () => {
    state.isOffline = true;
    render();
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    void window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js');
    });
  }
}

function setupCalendar() {
  if (!state.isCalendarConfigured) {
    render();
    return;
  }

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    state.calendarStatus = 'Google 認証ライブラリの読み込み待ち';
    render();
    window.setTimeout(setupCalendar, 500);
    return;
  }

  tokenClient = oauth2.initTokenClient({
    client_id: config.googleClientId,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback: (response) => {
      if (response.error) {
        state.calendarStatus = 'カレンダー認証に失敗しました';
        state.lastError = response.error;
        render();
        return;
      }

      accessToken = response.access_token;
      state.isCalendarAuthorized = true;
      state.calendarStatus = 'カレンダーを同期中';
      render();
      void refreshCalendar();
    }
  });

  render();
}

async function refreshWeather() {
  state.weatherStatus = '天気を更新中';
  render();

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
    state.weatherStatus = `更新 ${formatShortTime(snapshot.updatedAt)}`;
    state.lastError = null;
    writeSnapshot(WEATHER_STORAGE_KEY, snapshot);
  } catch (error) {
    state.weatherStatus = state.weather ? `通信失敗 最終更新 ${formatShortTime(state.weather.updatedAt)}` : '天気を取得できません';
    state.lastError = error instanceof Error ? error.message : 'unknown-weather-error';
  }

  render();
}

async function refreshCalendar() {
  return refreshCalendarInternal(true);
}

async function refreshCalendarInternal(allowReauth: boolean) {
  if (!accessToken || !config.calendarId) {
    return;
  }

  state.calendarStatus = '予定を更新中';
  render();

  try {
    const rangeStart = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeMin', rangeStart.toISOString());
    url.searchParams.set('timeMax', rangeEnd.toISOString());
    url.searchParams.set('maxResults', '20');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status === 401 && tokenClient && allowReauth) {
      tokenClient.requestAccessToken({ prompt: '' });
      return;
    }

    if (response.status === 401 && tokenClient) {
      state.isCalendarAuthorized = false;
      state.calendarStatus = '認証の有効期限が切れました';
      render();
      return;
    }

    if (!response.ok) {
      throw new Error(`calendar:${response.status}`);
    }

    const payload = (await response.json()) as GoogleCalendarResponse;
    const snapshot: CalendarSnapshot = {
      events: payload.items.map(toCalendarEvent),
      updatedAt: new Date().toISOString()
    };

    state.calendar = snapshot;
    state.calendarStatus = `更新 ${formatShortTime(snapshot.updatedAt)}`;
    state.lastError = null;
    writeSnapshot(CALENDAR_STORAGE_KEY, snapshot);
  } catch (error) {
    state.calendarStatus = state.calendar ? `通信失敗 最終更新 ${formatShortTime(state.calendar.updatedAt)}` : '予定を取得できません';
    state.lastError = error instanceof Error ? error.message : 'unknown-calendar-error';
  }

  render();
}

function render() {
  app.innerHTML = `
    <main class="dashboard">
      <section class="hero-panel panel">
        <div>
          <p class="eyebrow">${formatDate(new Date())}</p>
          <p class="hero-date">${formatYear(new Date())}</p>
          <h1 class="clock">${formatClock(new Date())}</h1>
          <p class="hero-meta">${config.locationLabel} / ${state.isOffline ? 'オフライン' : 'オンライン'}</p>
        </div>
        <div class="today-weather">
          <p class="eyebrow">今日の天気</p>
          ${renderTodayWeather()}
          <p class="status">${state.weatherStatus}</p>
        </div>
      </section>

      <section class="grid">
        <article class="panel hourly-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Hourly Forecast</p>
              <h2>時間ごとの天気</h2>
              <p class="panel-note">今から先 12 時間</p>
            </div>
            <div class="panel-actions">
              <p class="status">${state.weather ? `${config.locationLabel} ${config.latitude.toFixed(2)}, ${config.longitude.toFixed(2)}` : '取得待ち'}</p>
              <button class="action-button" data-action="refresh-weather">天気更新</button>
            </div>
          </div>
          <div class="hourly-list">
            ${renderHourlyRows()}
          </div>
        </article>

        <article class="panel calendar-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Family Calendar</p>
              <h2>家族カレンダー</h2>
              <p class="panel-note">今日から 7 日分</p>
            </div>
            ${renderCalendarAction()}
          </div>
          <div class="calendar-list">
            ${renderCalendarRows()}
          </div>
          <p class="status">${state.calendarStatus}</p>
        </article>
      </section>

      <footer class="footer-bar">
        <span>自動更新: 天気 ${Math.floor(WEATHER_POLL_MS / 60000)}分 / カレンダー ${Math.floor(CALENDAR_POLL_MS / 60000)}分</span>
        <span>${state.isOffline ? 'オフライン: 保存済みデータを表示中' : state.lastError ? `状態 ${escapeHtml(state.lastError)}` : 'オンライン待機中'}</span>
      </footer>
    </main>
  `;

  const weatherButton = app.querySelector<HTMLButtonElement>('[data-action="refresh-weather"]');
  weatherButton?.addEventListener('click', () => {
    void refreshWeather();
  });

  const connectButton = app.querySelector<HTMLButtonElement>('[data-action="connect-calendar"]');
  connectButton?.addEventListener('click', () => {
    tokenClient?.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });

  const refreshButton = app.querySelector<HTMLButtonElement>('[data-action="refresh-calendar"]');
  refreshButton?.addEventListener('click', () => {
    void refreshCalendar();
  });
}

function renderTodayWeather() {
  if (!state.weather) {
    return '<p class="weather-summary">読み込み中</p>';
  }

  const symbol = weatherCodeSymbolMap[state.weather.currentCode];
  const label = weatherCodeLabelMap[state.weather.currentCode];

  return `
    <div class="weather-summary">
      <span class="weather-symbol">${symbol}</span>
      <div>
        <p class="temp-now">${Math.round(state.weather.currentTemp)}°</p>
        <p>${label} / H ${Math.round(state.weather.maxTemp)}° / L ${Math.round(state.weather.minTemp)}°</p>
      </div>
    </div>
  `;
}

function renderHourlyRows() {
  if (!state.weather) {
    return '<p class="empty-state">天気データを取得中です。</p>';
  }

  return state.weather.hourly
    .map(
      (entry) => `
        <div class="hour-row">
          <span class="hour-time">${formatHour(entry.time)}</span>
          <span class="hour-symbol">${weatherCodeSymbolMap[entry.weatherCode]}</span>
          <span class="hour-temp">${Math.round(entry.temperature)}°</span>
          <span class="hour-rain">降水 ${Math.round(entry.precipitationProbability)}%</span>
          <span class="hour-label">${weatherCodeLabelMap[entry.weatherCode]}</span>
        </div>
      `
    )
    .join('');
}

function renderCalendarAction() {
  if (!state.isCalendarConfigured) {
    return '<p class="status">.env の設定が必要です</p>';
  }

  if (!state.isCalendarAuthorized) {
    return '<button class="action-button" data-action="connect-calendar">Google 連携</button>';
  }

  return `
    <div class="panel-actions">
      <p class="status">${state.calendar ? `${state.calendar.events.length} 件` : '取得待ち'}</p>
      <button class="action-button" data-action="refresh-calendar">今すぐ更新</button>
    </div>
  `;
}

function renderCalendarRows() {
  if (!state.isCalendarConfigured) {
    return `
      <div class="empty-state">
        <p>Google カレンダー ID と OAuth クライアント ID を設定すると予定を表示します。</p>
      </div>
    `;
  }

  if (!state.isCalendarAuthorized) {
    return `
      <div class="empty-state">
        <p>初回のみ Google 連携が必要です。</p>
        <p>読み取り専用で家族カレンダーを表示します。</p>
      </div>
    `;
  }

  if (!state.calendar || state.calendar.events.length === 0) {
    return '<p class="empty-state">直近 7 日に予定はありません。</p>';
  }

  return groupCalendarEvents(state.calendar.events)
    .map(
      (group) => `
        <section class="calendar-group">
          <p class="calendar-group-label">${group.label}</p>
          ${group.events
            .map(
              (event) => `
                <div class="calendar-row">
                  <div>
                    <p class="calendar-date">${formatCalendarDate(event.startDate)}</p>
                    <p class="calendar-time">${event.isAllDay ? '終日' : `${event.startLabel} - ${event.endLabel}`}</p>
                  </div>
                  <div class="calendar-copy">
                    <p class="calendar-summary">${escapeHtml(event.summary)}</p>
                    <p class="calendar-badge">${describeCalendarEvent(event)}</p>
                  </div>
                </div>
              `
            )
            .join('')}
        </section>
      `
    )
    .join('');
}

function toWeatherSnapshot(payload: OpenMeteoResponse): WeatherSnapshot {
  const currentCode = toWeatherCode(payload.current.weather_code);
  const startIndex = findNextHourlyIndex(payload.hourly.time);
  const hourly = payload.hourly.time.slice(startIndex, startIndex + 12).map((time, offset) => {
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

function toCalendarEvent(item: GoogleCalendarEvent): CalendarEvent {
  const allDay = Boolean(item.start.date);
  const startDate = item.start.dateTime ?? item.start.date ?? new Date().toISOString();
  const endDate = item.end.dateTime ?? item.end.date ?? startDate;

  return {
    id: item.id,
    summary: item.summary || 'タイトル未設定',
    startLabel: allDay ? '終日' : formatShortTime(startDate),
    endLabel: allDay ? '終日' : formatShortTime(endDate),
    startDate,
    endDate,
    isAllDay: allDay
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
    events: groupedEvents
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
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function formatYear(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric'
  }).format(date);
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatHour(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit'
  }).format(new Date(value));
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(value));
}

function formatCalendarGroupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return '今日';
  }

  if (date.toDateString() === tomorrow.toDateString()) {
    return '明日';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function describeCalendarEvent(event: CalendarEvent) {
  if (event.isAllDay) {
    return '終日';
  }

  const now = Date.now();
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime();

  if (start <= now && now <= end) {
    return '進行中';
  }

  const deltaMinutes = Math.round((start - now) / (60 * 1000));
  if (deltaMinutes >= 0 && deltaMinutes < 60) {
    return `${deltaMinutes}分後`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours >= 0 && deltaHours <= 6) {
    return `${deltaHours}時間後`;
  }

  return '予定';
}

function toWeatherCode(value: number): WeatherCode {
  if (value in weatherCodeLabelMap) {
    return value as WeatherCode;
  }

  return 3;
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

type GoogleCalendarResponse = {
  items: GoogleCalendarEvent[];
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  start: {
    date?: string;
    dateTime?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
  };
};