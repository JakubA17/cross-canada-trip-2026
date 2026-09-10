/* weather.js — free, keyless weather via Open-Meteo. Fetches opportunistically
   when online, caches the result (+ timestamp) to localStorage so the last
   known forecast is always available offline, clearly marked with when it
   was last updated. */
(function (global) {
  'use strict';

  const CACHE_KEY = 'c2c_weather_cache_v2';
  const STALE_MS = 1000 * 60 * 60 * 3; // refetch if older than 3h and online

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function keyFor(lat, lng) {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  }

  // WMO weather code -> { label, icon }
  const WMO = {
    0: ['Clear sky', 'sun'], 1: ['Mostly clear', 'cloudSun'], 2: ['Partly cloudy', 'cloudSun'],
    3: ['Overcast', 'cloud'],
    45: ['Fog', 'cloudFog'], 48: ['Fog', 'cloudFog'],
    51: ['Light drizzle', 'cloudRain'], 53: ['Drizzle', 'cloudRain'], 55: ['Dense drizzle', 'cloudRain'],
    56: ['Freezing drizzle', 'cloudRain'], 57: ['Freezing drizzle', 'cloudRain'],
    61: ['Light rain', 'cloudRain'], 63: ['Rain', 'cloudRain'], 65: ['Heavy rain', 'cloudRain'],
    66: ['Freezing rain', 'cloudRain'], 67: ['Freezing rain', 'cloudRain'],
    71: ['Light snow', 'cloudSnow'], 73: ['Snow', 'cloudSnow'], 75: ['Heavy snow', 'cloudSnow'],
    77: ['Snow grains', 'cloudSnow'],
    80: ['Rain showers', 'cloudRain'], 81: ['Rain showers', 'cloudRain'], 82: ['Violent showers', 'cloudRain'],
    85: ['Snow showers', 'cloudSnow'], 86: ['Snow showers', 'cloudSnow'],
    95: ['Thunderstorm', 'cloudRain'], 96: ['Thunderstorm, hail', 'cloudRain'], 99: ['Thunderstorm, hail', 'cloudRain'],
  };
  function describe(code) { return WMO[code] || ['—', 'cloud']; }

  async function fetchLive(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,cloud_cover,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset` +
      `&timezone=auto&forecast_days=16`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('weather http ' + res.status);
      const json = await res.json();
      const c = json.current || {};
      return {
        fetchedAt: Date.now(),
        current: json.current ? {
          temp: c.temperature_2m,
          code: c.weather_code,
          feelsLike: c.apparent_temperature,
          humidity: c.relative_humidity_2m,
          precip: c.precipitation,
          windSpeed: c.wind_speed_10m,
          windDir: c.wind_direction_10m,
          windGusts: c.wind_gusts_10m,
          pressure: c.surface_pressure,
          visibility: c.visibility,
        } : null,
        daily: (json.daily?.time || []).map((date, i) => ({
          date,
          code: json.daily.weather_code[i],
          hi: Math.round(json.daily.temperature_2m_max[i]),
          lo: Math.round(json.daily.temperature_2m_min[i]),
          precipProb: json.daily.precipitation_probability_max ? json.daily.precipitation_probability_max[i] : null,
          uvMax: json.daily.uv_index_max ? json.daily.uv_index_max[i] : null,
          sunrise: json.daily.sunrise ? json.daily.sunrise[i] : null,
          sunset: json.daily.sunset ? json.daily.sunset[i] : null,
        })),
        hourly: (json.hourly?.time || []).map((time, i) => ({
          time,
          temp: json.hourly.temperature_2m[i],
          code: json.hourly.weather_code[i],
          precipProb: json.hourly.precipitation_probability[i],
          uv: json.hourly.uv_index[i],
          cloudCover: json.hourly.cloud_cover[i],
          windSpeed: json.hourly.wind_speed_10m[i],
        })),
      };
    } catch (e) {
      clearTimeout(t);
      return null;
    }
  }

  /**
   * Get weather for a location, cache-first with background refresh.
   * onUpdate(entry) is called again if a live fetch later succeeds.
   */
  async function get(lat, lng, onUpdate, force, onFail) {
    const k = keyFor(lat, lng);
    const cache = readCache();
    const cached = cache[k] || null;

    const isStale = force || !cached || (Date.now() - cached.fetchedAt) > STALE_MS;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;

    if (!online) {
      if (onFail) onFail('offline');
    } else if (isStale) {
      fetchLive(lat, lng).then((fresh) => {
        if (fresh) {
          const c2 = readCache();
          c2[k] = fresh;
          writeCache(c2);
          if (onUpdate) onUpdate(fresh);
        } else if (onFail) {
          onFail('fetch-failed');
        }
      });
    }
    return cached;
  }

  /**
   * Warm the cache for a whole list of {lat,lng} locations (used to pre-sync
   * weather for every day across every route in the trip, so forecasts are
   * available offline no matter which route/day is later opened). Requests
   * are deduped by rounded coordinate and staggered lightly to be polite to
   * the free API. Calls onProgress(done, total) as it goes and resolves with
   * a summary when finished. No-ops (resolves immediately) when offline.
   */
  async function syncAll(locations, onProgress) {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const seen = new Set();
    const unique = [];
    locations.forEach((loc) => {
      const k = keyFor(loc.lat, loc.lng);
      if (!seen.has(k)) { seen.add(k); unique.push(loc); }
    });
    if (!online) return { synced: 0, attempted: 0, total: unique.length, skipped: true };

    let synced = 0, attempted = 0;
    for (let i = 0; i < unique.length; i++) {
      const loc = unique[i];
      const k = keyFor(loc.lat, loc.lng);
      const cache = readCache();
      const cached = cache[k];
      const isStale = !cached || (Date.now() - cached.fetchedAt) > STALE_MS;
      if (isStale) {
        attempted++;
        const fresh = await fetchLive(loc.lat, loc.lng);
        if (fresh) {
          const c2 = readCache();
          c2[k] = fresh;
          writeCache(c2);
          synced++;
        }
        // small stagger so a big trip (dozens of stops) doesn't hammer the API
        await new Promise((r) => setTimeout(r, 180));
      }
      if (onProgress) onProgress(i + 1, unique.length);
    }
    // "successful sync" means either everything was already fresh (nothing to
    // attempt) or at least one attempted fetch actually landed data — not
    // simply "we finished the loop", which is true even when every fetch fails.
    return { synced, attempted, total: unique.length, skipped: false };
  }

  // Hourly entries for a given local calendar date (YYYY-MM-DD), or the next
  // ~24h from now if no date given.
  function hourlyForDate(entry, dateStr) {
    if (!entry || !entry.hourly) return [];
    if (!dateStr) {
      const now = Date.now();
      return entry.hourly.filter((h) => {
        const t = new Date(h.time).getTime();
        return t >= now - 1000 * 60 * 60 && t <= now + 1000 * 60 * 60 * 24;
      });
    }
    return entry.hourly.filter((h) => h.time.slice(0, 10) === dateStr);
  }

  // Average cloud cover (%) across a night window (21:00 through 05:00 the
  // next day) for stargazing scoring. Returns null if no hourly data covers it.
  function nightCloudCover(entry, dateStr) {
    if (!entry || !entry.hourly || !dateStr) return null;
    const vals = entry.hourly.filter((h) => {
      const hour = Number(h.time.slice(11, 13));
      const day = h.time.slice(0, 10);
      const isEveningOf = day === dateStr && hour >= 21;
      const nextDate = new Date(dateStr + 'T00:00:00');
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().slice(0, 10);
      const isMorningAfter = day === nextDateStr && hour <= 5;
      return isEveningOf || isMorningAfter;
    }).map((h) => h.cloudCover).filter((v) => v != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  global.Weather = { get, describe, keyFor, syncAll, hourlyForDate, nightCloudCover };
})(typeof window !== 'undefined' ? window : globalThis);
