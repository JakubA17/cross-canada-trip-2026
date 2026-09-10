/* app.js — Coast2Coast controller. Single-page, tab-switched, fully
   client-side. Renders from data/trip.json + on-device GPS + on-device sun
   math + cached weather. No backend. */
(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  // ---- time-of-day phase -> theme color tokens ---------------------------
  const PHASE_COLORS = {
    night: { a: '#141a33', sun: '#8a93ad' },
    astronomicalTwilight: { a: '#241f4d', sun: '#8577c2' },
    nauticalTwilight: { a: '#3a2568', sun: '#9078d6' },
    blueHour: { a: '#2c4e8f', sun: '#6ea8ff' },
    civilTwilight: { a: '#8a4a6e', sun: '#ff9a73' },
    goldenHour: { a: '#c17226', sun: '#ffb648' },
    day: { a: '#3f7fc4', sun: '#ffd873' },
  };
  const PHASE_LABEL = {
    night: 'Night', astronomicalTwilight: 'Astro Twilight', nauticalTwilight: 'Nautical Twilight',
    blueHour: 'Blue Hour', civilTwilight: 'Civil Twilight', goldenHour: 'Golden Hour', day: 'Daylight',
  };

  function applyPhaseTheme(phase) {
    const c = PHASE_COLORS[phase] || PHASE_COLORS.day;
    const root = document.documentElement.style;
    root.setProperty('--phase-a', c.a);
    root.setProperty('--phase-sun', c.sun);
    root.setProperty('--phase-accent', c.sun);
  }

  // ---- small utils ---------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function localISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }
  function fmtTimeInTz(date, tz) {
    if (!date) return '—:—';
    try {
      return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(date);
    } catch (e) {
      return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
    }
  }
  function fmtRangeInTz(a, b, tz) { return `${fmtTimeInTz(a, tz)} – ${fmtTimeInTz(b, tz)}`; }
  // Compact "7:18–7:58a" style range for the narrow sun-event tiles — a
  // full "7:18 a.m. – 7:58 a.m." string doesn't fit 4-across on a phone.
  function fmtTimeCompactParts(date, tz) {
    if (!date) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).formatToParts(date);
      const h = parts.find((p) => p.type === 'hour').value;
      const m = parts.find((p) => p.type === 'minute').value;
      const dp = parts.find((p) => p.type === 'dayPeriod').value;
      return { h, m, ap: dp.charAt(0).toLowerCase() };
    } catch (e) { return null; }
  }
  function fmtRangeCompactInTz(a, b, tz) {
    const A = fmtTimeCompactParts(a, tz), B = fmtTimeCompactParts(b, tz);
    if (!A || !B) return '—';
    if (A.ap === B.ap) return `${A.h}:${A.m}–${B.h}:${B.m}${B.ap}`;
    return `${A.h}:${A.m}${A.ap}–${B.h}:${B.m}${B.ap}`;
  }
  function fmtDateShort(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  // ---- daylight indicator -------------------------------------------------
  // Every day in a route carries a precomputed `sun` block — dawn, sunrise,
  // solar noon, sunset, dusk as local clock times, plus minutes of daylight —
  // baked in at build time by tools/precompute_sun.py using the NOAA solar
  // algorithm and that day's own timezone. These are fixed facts about the
  // planned itinerary, so they are read, never recalculated. (The live "where
  // am I right now" card still uses SunEngine, because that depends on the
  // GPS fix rather than the plan.)
  //
  // The route also carries a `sunWindow` — one clock window shared by all its
  // days — so every bar is drawn against the same axis and the daylight
  // shrinking as the trip runs into October is visible straight down the list.
  const DEFAULT_SUN_WINDOW = { start: 330, end: 1260 };

  function hhmmToMin(str) {
    if (typeof str !== 'string') return null;
    const parts = str.split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }
  /** "07:18" -> "7:18a" — matches the compact style used in the sun tiles. */
  function fmtClock(hhmm) {
    const t = hhmmToMin(hhmm);
    if (t === null) return '—';
    const h24 = Math.floor(t / 60) % 24, m = t % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${pad2(m)}${h24 < 12 ? 'a' : 'p'}`;
  }
  /** "07:18" -> "7:18 a.m." — the long form used on the day card. */
  function fmtClockLong(hhmm) {
    const t = hhmmToMin(hhmm);
    if (t === null) return '—:—';
    const h24 = Math.floor(t / 60) % 24, m = t % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${pad2(m)} ${h24 < 12 ? 'a.m.' : 'p.m.'}`;
  }
  function fmtDuration(mins) {
    if (!Number.isFinite(mins) || mins < 0) return '—';
    return `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m`;
  }
  /** Minutes past local midnight, right now, in an IANA timezone. */
  function nowMinutesInTz(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date());
      const h = Number(parts.find((p) => p.type === 'hour').value);
      const m = Number(parts.find((p) => p.type === 'minute').value);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return (h % 24) * 60 + m;
    } catch (e) { return null; }
  }
  function sunWindow() {
    const w = TRIP && TRIP.sunWindow;
    return (w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
      ? w : DEFAULT_SUN_WINDOW;
  }

  /**
   * The light bar itself: night at both ends, civil twilight fading in and
   * out, daylight in the middle, hairline ticks on sunrise and sunset.
   * Purely decorative — the times are always in text beside it.
   */
  function daylightTrackHtml(sun, tz, showNow) {
    const win = sunWindow();
    const span = win.end - win.start;
    const pct = (m) => clamp(((m - win.start) / span) * 100, 0, 100);

    const dawn = hhmmToMin(sun.dawn), rise = hhmmToMin(sun.sunrise);
    const set = hhmmToMin(sun.sunset), dusk = hhmmToMin(sun.dusk);
    if (dawn === null || rise === null || set === null || dusk === null) return null;

    // Midpoints are emitted rather than derived with calc() so the gradient
    // works identically on older mobile Safari.
    const style = `--dawn:${pct(dawn).toFixed(2)}%;--rise:${pct(rise).toFixed(2)}%;`
      + `--set:${pct(set).toFixed(2)}%;--dusk:${pct(dusk).toFixed(2)}%;`
      + `--dawnmid:${((pct(dawn) + pct(rise)) / 2).toFixed(2)}%;`
      + `--duskmid:${((pct(set) + pct(dusk)) / 2).toFixed(2)}%`;

    let now = '';
    if (showNow) {
      const n = nowMinutesInTz(tz);
      if (n !== null && n >= win.start && n <= win.end) {
        now = `<i class="dl-now" style="left:${pct(n).toFixed(2)}%"></i>`;
      }
    }
    return `<div class="dl-track" style="${style}" aria-hidden="true">`
      + `<i class="dl-tick rise"></i><i class="dl-tick set"></i>${now}</div>`;
  }

  function daylightSummary(sun) {
    return `Dawn ${fmtClockLong(sun.dawn)}, sunrise ${fmtClockLong(sun.sunrise)}, `
      + `sunset ${fmtClockLong(sun.sunset)}, dusk ${fmtClockLong(sun.dusk)} — `
      + `${fmtDuration(sun.daylight)} of daylight.`;
  }

  /** Compact one-line indicator for the itinerary list rows. */
  function daylightRowHtml(day, showNow) {
    const sun = day && day.sun;
    if (!sun) return '';
    const track = daylightTrackHtml(sun, day.tz, showNow);
    if (!track) return '';
    return `<div class="daylight compact">
      <span class="sr-only">${esc(daylightSummary(sun))}</span>
      ${track}
      <div class="dl-scale" aria-hidden="true">
        <span class="dl-t faint">${fmtClock(sun.dawn)}</span>
        <span class="dl-t">${fmtClock(sun.sunrise)}</span>
        <span class="dl-t len">${fmtDuration(sun.daylight)}</span>
        <span class="dl-t">${fmtClock(sun.sunset)}</span>
        <span class="dl-t faint">${fmtClock(sun.dusk)}</span>
      </div>
    </div>`;
  }

  /** Full, labelled indicator for the Light card on the Today tab. */
  function daylightPanelHtml(day, showNow) {
    const sun = day && day.sun;
    if (!sun) return '';
    const track = daylightTrackHtml(sun, day.tz, showNow);
    if (!track) return '';
    const cell = (k, v, cls) =>
      `<div class="dl-cell ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return `<div class="daylight full">
      <span class="sr-only">${esc(daylightSummary(sun))}</span>
      ${track}
      <div class="dl-legend" aria-hidden="true">
        ${cell('Dawn', fmtClock(sun.dawn), 'faint')}
        ${cell('Sunrise', fmtClock(sun.sunrise))}
        ${cell('Daylight', fmtDuration(sun.daylight), 'mid')}
        ${cell('Sunset', fmtClock(sun.sunset))}
        ${cell('Dusk', fmtClock(sun.dusk), 'faint')}
      </div>
    </div>`;
  }

  // ---- state -----------------------------------------------------------
  let MANIFEST = null;
  let ROUTES_CACHE = {}; // routeId -> { days: [...], sunWindow }
  let selectedRouteId = null;
  let TRIP = null;
  let selectedDayIndex = 0;
  let todayRealIndex = -1;
  let currentLocalTab = 'food';
  let currentRepoCategory = 'all';
  let repoSearchTerm = '';
  let prefs = { units: 'km' };
  let REPO_INDEX = null;
  let ZONES = null; // { zoneId: { id, label, region, blurb, tips, safety, pois } }
  let repoMode = 'areas'; // 'areas' (zone database, default) | 'day'
  let repoZoneFocus = null; // zoneId when drilled into one area's directory
  let sheetSpot = null; // POI currently open in the detail sheet
  let weatherSyncBusy = false;
  let notesSaveTimer = null;

  // ---- map (Leaflet) state -----------------------------------------------
  let leafletMap = null, mapRouteLayer = null, mapDayLayer = null, mapGpsLayer = null;
  let mapDrawnForRouteId = null;

  function currentDay() { return TRIP.days[selectedDayIndex]; }
  function isViewingRealToday() { return selectedDayIndex === todayRealIndex; }
  function currentRouteMeta() { return MANIFEST.routes.find((r) => r.id === selectedRouteId) || MANIFEST.routes[0]; }

  function effectiveLocation(day) {
    const fix = Geo.GeoWatch.getLast();
    if (isViewingRealToday() && fix && (Date.now() - fix.ts) < 1000 * 60 * 30) {
      return { lat: fix.lat, lng: fix.lng, live: true, accuracy: fix.accuracy };
    }
    return { lat: day.lat, lng: day.lng, live: false };
  }

  // ---- day banner --------------------------------------------------------
  function renderBanner() {
    const day = currentDay();
    const route = currentRouteMeta();
    const dd = new Date(day.date + 'T12:00:00');
    $('#bannerPill').textContent = `Day ${day.index} of ${TRIP.days.length}`;
    $('#bannerDate').textContent = dd.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    $('#bannerWeekday').textContent = dd.toLocaleDateString('en-CA', { weekday: 'long' });
    $('#bannerCity').textContent = day.city;
    $('#btnPrevDay').disabled = selectedDayIndex === 0;
    $('#btnNextDay').disabled = selectedDayIndex === TRIP.days.length - 1;
    $('#btnPrevDay').innerHTML = ICONS.chevronLeft;
    $('#btnNextDay').innerHTML = ICONS.chevronRight;

    const chip = $('#bannerRouteChip');
    chip.className = `day-banner__route ${route.type === 'alternate' ? 'is-alternate' : ''}`;
    chip.innerHTML = `${ICONS.map}<span>${esc(route.shortLabel || route.label)}</span>`;

    $('#routeStrip').innerHTML = buildRouteSvg(TRIP.days, selectedDayIndex, { compact: true });

    const originShort = TRIP.days[0].city.split(',')[0];
    const destShort = TRIP.days[TRIP.days.length - 1].city.split(',')[0];
    const pct = TRIP.days.length > 1 ? Math.round((selectedDayIndex / (TRIP.days.length - 1)) * 100) : 100;
    $('#routeStripMeta').innerHTML = `<span>${esc(originShort)}</span><span class="pct">${pct}% complete</span><span>${esc(destShort)}</span>`;
  }

  // ---- route geography -> SVG polyline ------------------------------------
  // Projects each day's lat/lng into a small viewBox using an equirectangular
  // projection (longitude scaled by cos(avg latitude) so shapes aren't
  // stretched), then draws the full route as a muted track with a solid
  // "progress" line up to the currently-viewed day, plus a pulsing dot at
  // the active day. Used both as the compact strip under the banner and the
  // larger hero visualization on the Trip tab — this is the "route shown on
  // the map throughout the app" element.
  function projectDays(days, w, h, pad) {
    const lats = days.map((d) => d.lat), lngs = days.map((d) => d.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const avgLatRad = ((minLat + maxLat) / 2) * Math.PI / 180;
    const cosLat = Math.max(0.15, Math.cos(avgLatRad));
    const spanX = Math.max(0.0001, (maxLng - minLng) * cosLat);
    const spanY = Math.max(0.0001, (maxLat - minLat));
    // fit both axes into the box, preserving aspect ratio, centered
    const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    const drawW = spanX * scale, drawH = spanY * scale;
    const offX = pad + ((w - 2 * pad) - drawW) / 2;
    const offY = pad + ((h - 2 * pad) - drawH) / 2;
    return days.map((d) => ({
      x: offX + (d.lng - minLng) * cosLat * scale,
      y: offY + (maxLat - d.lat) * scale, // flip: higher lat (north) draws higher on screen
    }));
  }

  function buildRouteSvg(days, activeIdx, opts) {
    opts = opts || {};
    const compact = !!opts.compact;
    const w = 600, h = compact ? 46 : 150, pad = compact ? 6 : 14;
    if (!days.length) return '';
    if (days.length === 1) {
      return `<svg viewBox="0 0 ${w} ${h}"><circle cx="${w / 2}" cy="${h / 2}" r="6" class="${compact ? 'rs-dot current' : 'rh-dot current'}"/></svg>`;
    }
    const pts = projectDays(days, w, h, pad);
    const pathAll = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const pathProgress = pts.slice(0, activeIdx + 1).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // thin out dots for long routes so they don't clutter — always keep
    // start, end, and the active day.
    const showEvery = days.length > 22 ? 3 : (days.length > 12 ? 2 : 1);
    const trackCls = compact ? 'rs-track' : 'rh-track';
    const progCls = compact ? 'rs-progress' : 'rh-progress';
    const dotCls = compact ? 'rs-dot' : 'rh-dot';

    let dots = '';
    if (!compact) {
      pts.forEach((p, i) => {
        const isEdge = i === 0 || i === pts.length - 1;
        const isActive = i === activeIdx;
        if (!isActive && !isEdge && i % showEvery !== 0) return;
        const cls = isActive ? `${dotCls} current` : (i === 0 ? `${dotCls} start` : dotCls);
        const r = isActive ? 5 : (isEdge ? 3.5 : 2.5);
        dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" class="${cls}"/>`;
      });
    } else {
      const active = pts[activeIdx];
      dots = `<circle cx="${pts[0].x.toFixed(1)}" cy="${pts[0].y.toFixed(1)}" r="2.5" class="${dotCls} start"/>
        <circle cx="${active.x.toFixed(1)}" cy="${active.y.toFixed(1)}" r="4" class="${dotCls} current"/>`;
    }

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      <path d="${pathAll}" class="${trackCls}"/>
      <path d="${pathProgress}" class="${progCls}"/>
      ${dots}
    </svg>`;
  }

  // Best-effort deep link covering the WHOLE route (not just one point) —
  // Google Maps supports multi-stop directions via /dir/lat,lng/lat,lng/...;
  // Apple Maps' URL scheme doesn't reliably support many waypoints, so on
  // iOS we fall back to a straight start->end route.
  function fullRouteMapsUrl(days) {
    if (Geo.isIOS()) {
      const a = days[0], b = days[days.length - 1];
      return `https://maps.apple.com/?saddr=${a.lat},${a.lng}&daddr=${b.lat},${b.lng}`;
    }
    const MAX_STOPS = 23;
    let pts = days;
    if (days.length > MAX_STOPS) {
      const step = (days.length - 1) / (MAX_STOPS - 1);
      const picked = [];
      for (let i = 0; i < MAX_STOPS; i++) picked.push(days[Math.round(i * step)]);
      pts = picked;
    }
    const path = pts.map((d) => `${d.lat},${d.lng}`).join('/');
    return `https://www.google.com/maps/dir/${path}`;
  }

  // ---- sun / light card ---------------------------------------------------
  function drawArcSkeleton() {
    $('#arcOutlinePath').setAttribute('d', 'M10,100 Q160,15 310,100');
    $('#arcFillPath').setAttribute('d', 'M10,100 Q160,15 310,100 L310,100 Z');
  }
  function placeSunDot(t) {
    const p0 = { x: 10, y: 100 }, p1 = { x: 160, y: 15 }, p2 = { x: 310, y: 100 };
    const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x;
    const y = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y;
    const dot = $('#sunDot');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
  }

  /** SunEngine Date objects -> the same {HH:MM} shape the baked-in data uses. */
  function sunObjFromTimes(times, tz) {
    const hhmm = (d) => {
      if (!d || isNaN(d)) return null;
      try {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).format(d);
      } catch (e) { return null; }
    };
    const o = {
      dawn: hhmm(times.dawn), sunrise: hhmm(times.sunrise), noon: hhmm(times.solarNoon),
      sunset: hhmm(times.sunset), dusk: hhmm(times.dusk),
      blueEnd: hhmm(times.blueHourEnd), goldenEnd: hhmm(times.goldenHourEnd),
      goldenStart: hhmm(times.goldenHour), blueStart: hhmm(times.blueHourStart),
    };
    const a = hhmmToMin(o.sunrise), b = hhmmToMin(o.sunset);
    o.daylight = (a !== null && b !== null) ? b - a : null;
    return o;
  }

  function renderSunCard(day) {
    const loc = effectiveLocation(day);
    const tz = day.tz;

    // Planned days read the baked-in figures for their own planned location.
    // A live GPS fix means we are somewhere the plan did not predict, so that
    // case still solves the sun's position from the actual coordinates.
    let sun, live = false;
    if (loc.live) {
      const times = SunEngine.getTimes(new Date(day.date + 'T12:00:00'), loc.lat, loc.lng);
      sun = sunObjFromTimes(times, tz);
      live = true;
    } else {
      sun = day.sun || sunObjFromTimes(
        SunEngine.getTimes(new Date(day.date + 'T12:00:00'), loc.lat, loc.lng), tz);
    }

    $('#sunriseVal').textContent = fmtClockLong(sun.sunrise);
    $('#sunsetVal').textContent = fmtClockLong(sun.sunset);
    $('#solarNoonLabel').textContent = `NOON ${fmtClock(sun.noon)}`;

    let phase, t;
    const badge = $('#gpsBadge');
    if (live) {
      const now = new Date();
      phase = SunEngine.currentPhase(now, loc.lat, loc.lng);
      const rise = hhmmToMin(sun.sunrise), set = hhmmToMin(sun.sunset);
      const nowMin = nowMinutesInTz(tz);
      t = (rise !== null && set !== null && nowMin !== null && set > rise)
        ? clamp((nowMin - rise) / (set - rise), 0, 1) : 0.5;
      badge.className = 'gps-badge live';
      badge.innerHTML = `${ICONS.gps}<span>Live · ${PHASE_LABEL[phase]}</span>`;
      $('#sunCardTitle').textContent = 'Light Right Now';
      $('#nowLabel').textContent = 'NOW';
    } else {
      phase = 'day';
      t = 0.5;
      badge.className = 'gps-badge stale';
      badge.innerHTML = `${ICONS.mapPin}<span>${esc(day.city.split(',')[0])}</span>`;
      $('#sunCardTitle').textContent = 'Light — Planned';
      $('#nowLabel').textContent = '';
    }
    applyPhaseTheme(phase);
    drawArcSkeleton();
    placeSunDot(t);

    const panel = $('#daylightPanel');
    if (panel) panel.innerHTML = daylightPanelHtml({ sun, tz }, live || isViewingRealToday());

    const range = (a, b) => {
      const x = fmtClock(a), y = fmtClock(b);
      if (x === '—' || y === '—') return '—';
      const sameHalf = x.slice(-1) === y.slice(-1);
      return `${sameHalf ? x.slice(0, -1) : x}–${y}`;
    };
    const tiles = [
      ['Golden AM', range(sun.sunrise, sun.goldenEnd)],
      ['Blue AM', range(sun.dawn, sun.blueEnd)],
      ['Blue PM', range(sun.blueStart, sun.dusk)],
      ['Golden PM', range(sun.goldenStart, sun.sunset)],
    ];
    $('#sunEvents').innerHTML = tiles.map(([k, v]) =>
      `<div class="sun-event"><div class="k">${k}</div><div class="v dim">${v}</div></div>`).join('');
  }

  // ---- weather card -------------------------------------------------------
  function paintWeather(entry, day) {
    const body = $('#weatherBody');
    $('#weatherPlace').textContent = day.city;
    if (!entry) {
      body.innerHTML = '<div class="empty-note">No forecast cached yet — connect once to fetch it.</div>';
      return;
    }
    // "current conditions" only mean something for the real, actual today —
    // for any other day (future or past) we must show that day's own dated
    // forecast, and only that. Never fall back to entry.daily[0] to fill the
    // gap: daily[0] is whatever date the cache happens to start on, which can
    // silently be a completely different day than the one being viewed.
    const showCurrent = day.index === todayRealIndex && !!entry.current;
    const todayDaily = entry.daily.find((d) => d.date === day.date);
    if (!showCurrent && !todayDaily) {
      body.innerHTML = `<div class="empty-note">No forecast for ${fmtDateShort(day.date)} yet — sync when you have signal.</div>`;
      return;
    }
    const code = showCurrent ? entry.current.code : (todayDaily && todayDaily.code);
    const [label, iconKey] = Weather.describe(code);
    const temp = showCurrent ? Math.round(entry.current.temp) : (todayDaily ? todayDaily.hi : null);

    body.innerHTML = `
      <div class="weather-row">
        <span class="weather-icon">${ICONS[iconKey] || ICONS.cloud}</span>
        <div class="weather-meta">
          <div class="weather-desc">${esc(label)}</div>
          <div class="weather-range">${todayDaily ? `H:${todayDaily.hi}° L:${todayDaily.lo}°` : ''}</div>
        </div>
        <div class="weather-temp">${temp != null ? temp + '°' : '—'}</div>
      </div>
      <div class="weather-forecast">${entry.daily.slice(0, 6).map((dd) => {
        const [, ic] = Weather.describe(dd.code);
        const wd = new Date(dd.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short' });
        return `<div class="wf-day"><div class="d">${wd}</div>${ICONS[ic] || ICONS.cloud}<div class="t">${dd.hi}° <span class="lo">${dd.lo}°</span></div></div>`;
      }).join('')}</div>
      <div class="weather-updated">${ICONS.clock}<span>Updated ${timeAgo(entry.fetchedAt)}</span></div>
    `;
  }

  async function renderWeather(day) {
    const loc = effectiveLocation(day);
    const entry = await Weather.get(loc.lat, loc.lng, (fresh) => {
      if (currentDay() === day) paintWeather(fresh, day);
    });
    paintWeather(entry, day);
  }

  function forceRefreshWeather() {
    const day = currentDay();
    const loc = effectiveLocation(day);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast("You're offline — can't refresh weather right now");
      return;
    }
    toast('Refreshing weather…');
    Weather.get(loc.lat, loc.lng, (fresh) => { if (currentDay() === day) paintWeather(fresh, day); }, true, () => {
      toast("Couldn't reach the weather service — showing the last saved forecast");
    });
  }

  // ---- full-trip weather sync: pre-fetch & cache every location on every ----
  // route in the manifest, so switching routes or days offline always has a
  // forecast available, not just whatever was most recently viewed.
  async function collectAllRouteLocations() {
    const locs = [];
    for (const routeMeta of MANIFEST.routes) {
      try {
        const route = await fetchRoute(routeMeta);
        route.days.forEach((d) => locs.push({ lat: d.lat, lng: d.lng }));
      } catch (e) { /* route unavailable offline — skip it, try again next sync */ }
    }
    return locs;
  }

  async function syncAllRoutesWeather(manual) {
    if (weatherSyncBusy) { if (manual) toast('Already syncing…'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { if (manual) toast('Offline — can\'t sync weather right now'); return; }
    weatherSyncBusy = true;
    if (manual) toast('Syncing weather for all routes…');
    try {
      const locs = await collectAllRouteLocations();
      const res = await Weather.syncAll(locs);
      // Only stamp a successful sync when something actually landed — either
      // every location was already fresh (nothing needed fetching) or at
      // least one fetch succeeded. A sync where every fetch failed (online,
      // but no data — the typical northern-Ontario cell gap) must not be
      // stamped, or the 6h auto-retry timer won't try again until it's stale.
      const ok = !res.skipped && (res.attempted === 0 || res.synced > 0);
      if (ok) prefs = Store.setPrefs({ lastFullWeatherSync: Date.now() });
      if ($('#view-trip').classList.contains('active')) renderTripTab();
      if (manual) {
        if (res.skipped) toast('Offline — nothing synced');
        else if (res.attempted > 0 && res.synced === 0) toast("Couldn't reach the weather service — try again with a signal");
        else if (res.synced > 0) toast(`Weather synced for ${res.synced} of ${res.total} stops`);
        else toast('Weather already up to date for all stops');
      }
      // Currently-viewed day may have just gotten a fresher forecast.
      if ($('#view-today').classList.contains('active') && TRIP) renderWeather(currentDay());
    } finally {
      weatherSyncBusy = false;
    }
  }

  // ---- backup / export everything kept on-device -----------------------
  function exportData() {
    const data = Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coast2coast-backup-${localISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup downloaded');
  }

  // ---- agenda --------------------------------------------------------------
  const AGENDA_ICON = { sight: 'camera', food: 'utensils', photo: 'camera', event: 'calendarEvent', drive: 'compass' };
  function renderAgenda(day) {
    const list = $('#agendaList');
    if (!day.agenda.length) {
      list.innerHTML = '<div class="empty-note">Nothing scheduled yet.</div>';
      return;
    }
    list.innerHTML = day.agenda.map((item) => {
      const iconKey = AGENDA_ICON[item.type] || 'mapPin';
      const link = (item.lat != null)
        ? `<a class="agenda-link" href="${Geo.mapsUrl(item.lat, item.lng, item.title)}" target="_blank" rel="noopener">${ICONS.externalLink}Open in Maps</a>`
        : '';
      return `<div class="agenda-item">
        <div class="agenda-time">${esc(item.time || '')}</div>
        <div class="agenda-icon">${ICONS[iconKey]}</div>
        <div class="agenda-body"><div class="agenda-title">${esc(item.title)}</div>${link}</div>
      </div>`;
    }).join('');
  }

  // ---- what's local ---------------------------------------------------------
  // Short labels — this segmented control is a fixed 4-column grid at
  // 375-393px wide (see #localTabs in styles.css), and the longer versions
  // ("Eat & Drink", "Camp & Park") don't fit next to an icon in ~90px,
  // which was pushing "Nature" off-screen with no scroll affordance.
  // #localTabs is deliberately locked to exactly 4 fixed columns (see the
  // CSS) — a prior fix for silent off-screen clipping when this was a
  // scrolling row. Keep it at the original 4 "right now" categories; the
  // newer utility categories (lodging/medical/repair) live in the full
  // Repository directory instead, not this quick nearby-browse control.
  const LOCAL_CATS = [
    { key: 'food', label: 'Eat', icon: 'utensils' },
    { key: 'gas', label: 'Gas', icon: 'fuel' },
    { key: 'camp', label: 'Camp', icon: 'tent' },
    { key: 'nature', label: 'Nature', icon: 'mountain' },
  ];
  const CAT_ICON = {
    food: 'utensils', gas: 'fuel', camp: 'tent', nature: 'mountain',
    lodging: 'bed', medical: 'medical', repair: 'wrench',
  };

  function renderLocalTabs() {
    $('#localTabs').innerHTML = LOCAL_CATS.map((c) =>
      `<button class="seg-btn ${c.key === currentLocalTab ? 'active' : ''}" data-cat="${c.key}">${ICONS[c.icon]}${c.label}</button>`
    ).join('');
  }

  function poiRowHtml(poi, day, category, idx, loc) {
    // Use the same stable, name-based id as the Areas directory (zonePoiId)
    // instead of a position-based id ("4th-nearest gas stop right now") —
    // a position-based id silently migrates onto a different physical place
    // as GPS moves and the nearest-N list reorders, un-hearting whatever was
    // actually saved and hearting an unrelated stop instead. It also gave
    // the same physical POI two different ids depending on whether it was
    // saved from here or from Areas, producing duplicate Saved entries.
    const id = zonePoiId(day.zoneId, poi);
    const dist = loc ? Geo.formatDistance(Geo.haversineKm(loc.lat, loc.lng, poi.lat, poi.lng), prefs.units === 'mi') : '';
    const saved = Store.isSaved(id);
    const iconKey = CAT_ICON[category] || 'mapPin';
    const payload = encodeURIComponent(JSON.stringify({
      id, name: poi.name, lat: poi.lat, lng: poi.lng, category, dayId: day.id, city: poi.nearTown || day.city, note: poi.note || '', zoneId: day.zoneId,
      address: poi.address || '', phone: poi.phone || '', hours: poi.hours || '',
    }));
    return `<div class="poi-row" data-id="${id}" data-detail="${payload}" role="button">
      <div class="poi-icon cat-${category}">${ICONS[iconKey]}</div>
      <div class="poi-body">
        <div class="poi-name">${esc(poi.name)}</div>
        ${poi.note ? `<div class="poi-note">${esc(poi.note)}</div>` : ''}
      </div>
      <div class="poi-dist">${dist}</div>
      <div class="poi-actions">
        <button class="icon-btn ${saved ? 'saved' : ''}" data-action="save" data-poi="${payload}">${saved ? ICONS.heartFilled : ICONS.heart}</button>
        <button class="icon-btn" data-action="open" data-lat="${poi.lat}" data-lng="${poi.lng}" data-label="${esc(poi.name)}">${ICONS.mapPin}</button>
      </div>
    </div>`;
  }

  // Local POIs are no longer duplicated per-day in the route JSON — they're
  // derived on the fly from the zone directory (data/zones.json), picking the
  // nearest N per category to the day's (or live) location. This keeps route
  // files small and makes the zone directory the single source of truth.
  function nearestZonePois(day, category, limit) {
    if (!ZONES || !day.zoneId || !ZONES[day.zoneId]) return [];
    const loc = effectiveLocation(day);
    return ZONES[day.zoneId].pois
      .filter((p) => p.category === category)
      .map((p) => ({ p, d: Geo.haversineKm(loc.lat, loc.lng, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit || 4)
      .map((x) => x.p);
  }

  function renderLocalList(day) {
    const loc = effectiveLocation(day);
    const items = nearestZonePois(day, currentLocalTab, 4);
    const list = $('#localList');
    if (!items.length) {
      list.innerHTML = '<div class="empty-note">Nothing tagged for this category today.</div>';
      return;
    }
    list.innerHTML = items.map((poi, idx) => poiRowHtml(poi, day, currentLocalTab, idx, loc)).join('');
  }

  // ---- key locations / map -------------------------------------------------
  function renderKeyLocations(day) {
    const loc = effectiveLocation(day);
    const list = $('#keyLocationsList');
    if (!day.keyLocations.length) {
      list.innerHTML = '<div class="empty-note">No key locations tagged for today.</div>';
      return;
    }
    list.innerHTML = day.keyLocations.map((k) => {
      const distKm = Geo.haversineKm(loc.lat, loc.lng, k.lat, k.lng);
      const bearing = Geo.bearingDeg(loc.lat, loc.lng, k.lat, k.lng);
      return `<div class="loc-row">
        <div class="loc-compass"><span style="display:inline-flex;transform:rotate(${bearing.toFixed(0)}deg)">${ICONS.navArrow}</span></div>
        <div class="loc-body">
          <div class="loc-name">${esc(k.name)}</div>
          <div class="loc-sub">${Geo.formatDistance(distKm, prefs.units === 'mi')} away</div>
        </div>
        <button class="icon-btn" data-action="open" data-lat="${k.lat}" data-lng="${k.lng}" data-label="${esc(k.name)}">${ICONS.mapPin}</button>
      </div>`;
    }).join('');
  }

  // ---- zone guide card (blurb + tips + offline safety info) -----------------
  function renderZoneGuide(day) {
    const card = $('#zoneCard');
    const zone = ZONES && day.zoneId ? ZONES[day.zoneId] : null;
    if (!zone) { card.style.display = 'none'; return; }
    card.style.display = '';
    $('#zoneCardTitle').textContent = zone.label;
    $('#zoneCardSub').textContent = zone.region;
    $('#zoneBlurb').textContent = zone.blurb;
    $('#zoneTips').innerHTML = (zone.tips || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const safety = zone.safety || {};
    $('#zoneSafety').innerHTML = `
      ${safety.cellCoverage ? `<div class="zone-safety-row">${ICONS.shield}<div><b>Cell coverage</b> — ${esc(safety.cellCoverage)}</div></div>` : ''}
      ${safety.nearestHospital ? `<div class="zone-safety-row">${ICONS.mapPin}<div><b>Nearest medical</b> — ${esc(safety.nearestHospital)}</div></div>` : ''}
      ${safety.note ? `<div class="zone-safety-row">${ICONS.sparkle}<div>${esc(safety.note)}</div></div>` : ''}
    `;
    $('#btnBrowseZone').dataset.zoneid = day.zoneId;
  }

  // ---- day notes (offline personal journal, on-device only) -----------------
  function renderNotes(day) {
    const input = $('#dayNotesInput');
    input.dataset.dayid = day.id;
    input.value = Store.getNote(day.id);
    autoGrowNotes(input);
  }

  // resize:none replaced the desktop-style drag handle (decorative noise on
  // iOS) — grow the textarea to fit its content instead so long notes stay
  // fully visible without a scrollbar inside a fixed-height box.
  function autoGrowNotes(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(72, el.scrollHeight) + 'px';
  }

  // ---- nearby saved (surfaced on Today when close by) -----------------------
  function renderTodayNearby() {
    const slot = $('#todayNearbySlot');
    const fix = Geo.GeoWatch.getLast();
    if (!fix) { slot.innerHTML = ''; return; }
    const saved = Store.getSaved();
    let nearest = null;
    saved.forEach((s) => {
      const dist = Geo.haversineKm(fix.lat, fix.lng, s.lat, s.lng);
      if (dist <= 3 && (!nearest || dist < nearest.dist)) nearest = { ...s, dist };
    });
    slot.innerHTML = nearest ? `<div class="nearby-banner">${ICONS.sparkle}
      <div><div class="t">You're near a saved spot: ${esc(nearest.name)}</div>
      <div class="s">${Geo.formatDistance(nearest.dist, prefs.units === 'mi')} away</div></div></div>` : '';
  }

  // ---- Repository tab ---------------------------------------------------
  const REPO_CHIPS = [
    { key: 'all', label: 'All', icon: 'listRepo' },
    { key: 'food', label: 'Eat & Drink', icon: 'utensils' },
    { key: 'gas', label: 'Gas', icon: 'fuel' },
    { key: 'camp', label: 'Camp & Park', icon: 'tent' },
    { key: 'nature', label: 'Nature', icon: 'mountain' },
    { key: 'lodging', label: 'Lodging', icon: 'bed' },
    { key: 'medical', label: 'Medical', icon: 'medical' },
    { key: 'repair', label: 'Auto Repair', icon: 'wrench' },
  ];

  function buildRepoIndex() {
    const rows = [];
    const cats = ['food', 'gas', 'camp', 'nature', 'lodging', 'medical', 'repair'];
    TRIP.days.forEach((day) => {
      cats.forEach((cat) => {
        nearestZonePois(day, cat, 4).forEach((poi, idx) => rows.push({ poi, category: cat, day, idx }));
      });
    });
    return rows;
  }

  function renderRepoModeToggle() {
    const el = $('#repoModeToggle');
    if (!el) return;
    el.innerHTML = `
      <button data-repomode="areas" class="${repoMode === 'areas' ? 'active' : ''}">Areas</button>
      <button data-repomode="day" class="${repoMode === 'day' ? 'active' : ''}">By Day</button>
    `;
  }

  function renderRepoByDay() {
    if (!REPO_INDEX) REPO_INDEX = buildRepoIndex();
    const term = repoSearchTerm.trim().toLowerCase();
    const fix = Geo.GeoWatch.getLast();
    const rows = REPO_INDEX.filter((r) => currentRepoCategory === 'all' || r.category === currentRepoCategory)
      .filter((r) => !term || r.poi.name.toLowerCase().includes(term) || r.day.city.toLowerCase().includes(term));

    const byDay = {};
    rows.forEach((r) => { (byDay[r.day.id] = byDay[r.day.id] || []).push(r); });

    const container = $('#repoResults');
    const groupDays = TRIP.days.filter((d) => byDay[d.id]);
    if (!groupDays.length) { container.innerHTML = '<div class="empty-note">No matches.</div>'; return; }

    container.innerHTML = groupDays.map((day) => {
      const items = byDay[day.id];
      const loc = fix || { lat: day.lat, lng: day.lng };
      return `<div class="repo-day-group">
        <div class="repo-day-heading">Day ${day.index} · ${esc(day.city)}</div>
        <div class="card"><div class="poi-list">${items.map((r) => poiRowHtml(r.poi, r.day, r.category, r.idx, loc)).join('')}</div></div>
      </div>`;
    }).join('');
  }

  // ---- Areas database -----------------------------------------------------
  // The curated offline directory (data/zones.json): every researched stop,
  // grouped by area, then by category. Not tied to the day-by-day plan, so it
  // is the thing to open when plans change and you need "what's around here".
  const CAT_LABEL = {
    food: 'Eat & Drink', gas: 'Gas', camp: 'Camp & Park', nature: 'Nature & Photo',
    lodging: 'Lodging', medical: 'Medical', repair: 'Auto Repair',
  };
  const CAT_ORDER = ['gas', 'food', 'camp', 'nature', 'lodging', 'medical', 'repair'];

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
  function zonePoiId(zoneId, poi) { return `${zoneId}-${poi.category}-${slug(poi.name)}`; }

  function zoneSpanLabel(zid) {
    const spanDays = TRIP.days.filter((d) => d.zoneId === zid);
    if (!spanDays.length) return 'Not on this route';
    const first = spanDays[0], last = spanDays[spanDays.length - 1];
    return first === last ? `Day ${first.index}` : `Days ${first.index}–${last.index}`;
  }

  // Reference point for sorting/distances: live GPS if we have it, otherwise
  // the selected day's planned coordinates.
  function referenceLocation() {
    const fix = Geo.GeoWatch.getLast();
    if (fix) return { lat: fix.lat, lng: fix.lng, live: true };
    const d = currentDay();
    return { lat: d.lat, lng: d.lng, live: false };
  }

  function zoneCounts(zone) {
    const c = { food: 0, gas: 0, camp: 0, nature: 0 };
    zone.pois.forEach((p) => { if (c[p.category] != null) c[p.category]++; });
    return c;
  }

  function zonePoiRowHtml(poi, zoneId, loc) {
    const id = zonePoiId(zoneId, poi);
    const dist = loc ? Geo.formatDistance(Geo.haversineKm(loc.lat, loc.lng, poi.lat, poi.lng), prefs.units === 'mi') : '';
    const saved = Store.isSaved(id);
    const iconKey = CAT_ICON[poi.category] || 'mapPin';
    const payload = encodeURIComponent(JSON.stringify({
      id, name: poi.name, lat: poi.lat, lng: poi.lng, category: poi.category,
      city: poi.nearTown || '', note: poi.note || '', zoneId,
      address: poi.address || '', phone: poi.phone || '', hours: poi.hours || '',
    }));
    return `<div class="poi-row" data-id="${id}" data-detail="${payload}" role="button">
      <div class="poi-icon cat-${poi.category}">${ICONS[iconKey]}</div>
      <div class="poi-body">
        <div class="poi-name">${esc(poi.name)}</div>
        <div class="poi-note">${esc(poi.nearTown || '')}${poi.nearTown && poi.note ? ' · ' : ''}${esc(poi.note || '')}</div>
      </div>
      <div class="poi-dist">${dist}</div>
      <div class="poi-actions">
        <button class="icon-btn ${saved ? 'saved' : ''}" data-action="save" data-poi="${payload}" aria-label="${saved ? 'Remove from saved' : 'Save'}">${saved ? ICONS.heartFilled : ICONS.heart}</button>
        <button class="icon-btn" data-action="open" data-lat="${poi.lat}" data-lng="${poi.lng}" data-label="${esc(poi.name)}" aria-label="Open in Maps">${ICONS.mapPin}</button>
      </div>
    </div>`;
  }

  function tripZoneIdsInOrder() {
    const seen = new Set(), out = [];
    TRIP.days.forEach((d) => { if (d.zoneId && !seen.has(d.zoneId)) { seen.add(d.zoneId); out.push(d.zoneId); } });
    // Areas the current route doesn't touch still belong in the database.
    Object.keys(ZONES || {}).forEach((zid) => { if (!seen.has(zid)) out.push(zid); });
    return out;
  }

  function renderAreasHome() {
    const container = $('#repoResults');
    const loc = referenceLocation();
    const zoneIds = tripZoneIdsInOrder().filter((id) => ZONES[id]);
    const total = zoneIds.reduce((n, zid) => n + ZONES[zid].pois.length, 0);

    // Nearest area to where we are right now (live GPS or planned position)
    let nearestZid = null, nearestKm = Infinity;
    zoneIds.forEach((zid) => {
      ZONES[zid].pois.forEach((p) => {
        const d = Geo.haversineKm(loc.lat, loc.lng, p.lat, p.lng);
        if (d < nearestKm) { nearestKm = d; nearestZid = zid; }
      });
    });

    container.innerHTML = `
      <div class="areas-intro">${total} researched stops across ${zoneIds.length} areas · works fully offline</div>
      <div class="card areas-list">
        ${zoneIds.map((zid) => {
          const z = ZONES[zid];
          const c = zoneCounts(z);
          const isNear = zid === nearestZid;
          return `<div class="area-row" data-openzone="${zid}" role="button">
            <div class="area-icon">${ICONS.zone}</div>
            <div class="area-body">
              <div class="area-name">${esc(z.label)}${isNear ? '<span class="area-near">Nearest</span>' : ''}</div>
              <div class="area-sub">${esc(z.region)} · ${zoneSpanLabel(zid)}</div>
              <div class="area-counts">
                <span>${ICONS.fuel}${c.gas}</span>
                <span>${ICONS.utensils}${c.food}</span>
                <span>${ICONS.tent}${c.camp}</span>
                <span>${ICONS.mountain}${c.nature}</span>
              </div>
            </div>
            <div class="loc-chevron">${ICONS.chevronRightSm}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderAreasSearch(term) {
    const container = $('#repoResults');
    const loc = referenceLocation();
    const hits = [];
    tripZoneIdsInOrder().forEach((zid) => {
      const z = ZONES[zid]; if (!z) return;
      z.pois.forEach((p) => {
        if (currentRepoCategory !== 'all' && p.category !== currentRepoCategory) return;
        const hay = `${p.name} ${p.nearTown || ''} ${p.note || ''} ${z.label} ${z.region}`.toLowerCase();
        if (hay.includes(term)) hits.push({ p, zid, d: Geo.haversineKm(loc.lat, loc.lng, p.lat, p.lng) });
      });
    });
    if (!hits.length) { container.innerHTML = '<div class="empty-note">Nothing in the directory matches that. Try a town, a category, or part of a name.</div>'; return; }
    hits.sort((a, b) => a.d - b.d);
    const byZone = {};
    hits.forEach((h) => { (byZone[h.zid] = byZone[h.zid] || []).push(h); });
    container.innerHTML = `<div class="areas-intro">${hits.length} match${hits.length === 1 ? '' : 'es'} · nearest first</div>` +
      Object.keys(byZone).map((zid) => `<div class="repo-day-group">
        <div class="repo-day-heading">${esc(ZONES[zid].label)}</div>
        <div class="card"><div class="poi-list">${byZone[zid].map((h) => zonePoiRowHtml(h.p, zid, loc)).join('')}</div></div>
      </div>`).join('');
  }

  function renderZoneDetail(zid) {
    const z = ZONES[zid];
    const container = $('#repoResults');
    if (!z) { container.innerHTML = '<div class="empty-note">Area not found.</div>'; return; }
    const loc = referenceLocation();
    const term = repoSearchTerm.trim().toLowerCase();
    const c = zoneCounts(z);

    const pois = z.pois
      .filter((p) => currentRepoCategory === 'all' || p.category === currentRepoCategory)
      .filter((p) => !term || `${p.name} ${p.nearTown || ''} ${p.note || ''}`.toLowerCase().includes(term))
      .map((p) => ({ p, d: Geo.haversineKm(loc.lat, loc.lng, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d);

    const groups = currentRepoCategory === 'all'
      ? CAT_ORDER.map((cat) => ({ cat, items: pois.filter((x) => x.p.category === cat) })).filter((g) => g.items.length)
      : [{ cat: currentRepoCategory, items: pois }];

    const safety = z.safety || {};
    container.innerHTML = `
      <div class="card zone-hero">
        <div class="zone-hero-region">${esc(z.region)} · ${zoneSpanLabel(zid)}</div>
        <div class="zone-hero-name">${esc(z.label)}</div>
        <div class="zone-hero-blurb">${esc(z.blurb || '')}</div>
        <div class="zone-hero-stats">
          <span>${ICONS.fuel}${c.gas} gas</span>
          <span>${ICONS.utensils}${c.food} eat</span>
          <span>${ICONS.tent}${c.camp} camp</span>
          <span>${ICONS.mountain}${c.nature} nature</span>
        </div>
      </div>
      ${(z.tips && z.tips.length) || safety.cellCoverage || safety.nearestHospital ? `
      <div class="card">
        <div class="card-header"><div class="card-title">${ICONS.shield}Know before you go</div></div>
        ${z.tips && z.tips.length ? `<ul class="zone-tips">${z.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="zone-safety">
          ${safety.cellCoverage ? `<div class="zone-safety-row">${ICONS.wifiOff}<div><b>Cell coverage</b> — ${esc(safety.cellCoverage)}</div></div>` : ''}
          ${safety.nearestHospital ? `<div class="zone-safety-row">${ICONS.mapPin}<div><b>Nearest medical</b> — ${esc(safety.nearestHospital)}</div></div>` : ''}
          ${safety.note ? `<div class="zone-safety-row">${ICONS.sparkle}<div>${esc(safety.note)}</div></div>` : ''}
        </div>
      </div>` : ''}
      <div class="areas-intro">${pois.length} stop${pois.length === 1 ? '' : 's'} · ${loc.live ? 'nearest to you first' : `nearest to Day ${currentDay().index} first`}</div>
      ${groups.length ? groups.map((g) => `<div class="repo-day-group">
        <div class="repo-day-heading">${esc(CAT_LABEL[g.cat] || g.cat)} · ${g.items.length}</div>
        <div class="card"><div class="poi-list">${g.items.map((x) => zonePoiRowHtml(x.p, zid, loc)).join('')}</div></div>
      </div>`).join('') : '<div class="empty-note">No stops match in this area.</div>'}`;
  }

  function renderRepoHead() {
    const head = $('#repoHead');
    if (!head) return;
    if (repoMode === 'areas' && repoZoneFocus && ZONES && ZONES[repoZoneFocus]) {
      head.innerHTML = `<button class="nav-back" data-zoneback="1">${ICONS.chevronLeft}<span>Areas</span></button>`;
    } else {
      head.innerHTML = `<div class="section-title">Repository</div>`;
    }
  }

  function renderRepo() {
    const term = repoSearchTerm.trim().toLowerCase();
    renderRepoHead();
    renderRepoModeToggle();
    $('#repoModeToggle').style.display = (repoMode === 'areas' && repoZoneFocus) ? 'none' : '';
    $('#repoChips').innerHTML = REPO_CHIPS.map((c) =>
      `<button class="chip ${c.key === currentRepoCategory ? 'active' : ''}" data-repocat="${c.key}">${ICONS[c.icon]}${c.label}</button>`
    ).join('');
    // Category chips only make sense once we're looking at a list of stops.
    $('#repoChips').style.display = (repoMode === 'areas' && !repoZoneFocus && !term) ? 'none' : '';
    $('#repoSearch').placeholder = (repoMode === 'areas' && repoZoneFocus)
      ? `Search in ${ZONES[repoZoneFocus].label.split(' & ')[0]}…`
      : 'Search all stops, towns, areas…';

    if (repoMode === 'day') { renderRepoByDay(); return; }
    if (!ZONES) { $('#repoResults').innerHTML = '<div class="empty-note">Area directory not loaded yet.</div>'; return; }
    if (repoZoneFocus) renderZoneDetail(repoZoneFocus);
    else if (term) renderAreasSearch(term);
    else renderAreasHome();
  }

  function openZone(zid) {
    repoMode = 'areas'; repoZoneFocus = zid; repoSearchTerm = ''; currentRepoCategory = 'all'; $('#repoSearch').value = '';
    if (!$('#view-repo').classList.contains('active')) switchView('repo'); else renderRepo();
    window.scrollTo(0, 0);
  }

  // ---- POI detail sheet -----------------------------------------------------
  function openPoiSheet(spot) {
    sheetSpot = spot;
    const loc = referenceLocation();
    const km = Geo.haversineKm(loc.lat, loc.lng, spot.lat, spot.lng);
    const brg = Geo.bearingDeg(loc.lat, loc.lng, spot.lat, spot.lng);
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(brg / 45) % 8];
    const saved = Store.isSaved(spot.id);
    const zone = spot.zoneId && ZONES ? ZONES[spot.zoneId] : null;
    // Which planned days pass within reach of this stop
    const nearDays = TRIP.days
      .map((d) => ({ d, km: Geo.haversineKm(d.lat, d.lng, spot.lat, spot.lng) }))
      .filter((x) => x.km <= 120).sort((a, b) => a.km - b.km).slice(0, 3);

    $('#poiSheet').innerHTML = `
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <div class="poi-icon cat-${spot.category}">${ICONS[CAT_ICON[spot.category] || 'mapPin']}</div>
        <div class="sheet-title-wrap">
          <div class="sheet-title">${esc(spot.name)}</div>
          <div class="sheet-sub">${esc(CAT_LABEL[spot.category] || spot.category)}${spot.city ? ` · ${esc(spot.city)}` : ''}</div>
        </div>
        <button class="icon-btn sheet-close" data-sheetclose="1" aria-label="Close">${ICONS.close}</button>
      </div>
      ${spot.note ? `<div class="sheet-note">${esc(spot.note)}</div>` : ''}
      ${(spot.address || spot.hours || spot.phone) ? `<div class="sheet-contact">
        ${spot.address ? `<div class="sheet-contact-row">${ICONS.mapPin}<div><div class="k">Address</div><div class="v">${esc(spot.address)}</div></div></div>` : ''}
        ${spot.hours ? `<div class="sheet-contact-row">${ICONS.clock}<div><div class="k">Hours</div><div class="v">${esc(spot.hours)}</div></div></div>` : ''}
        ${spot.phone ? `<div class="sheet-contact-row">${ICONS.phone}<div><div class="k">Phone</div><div class="v"><a href="tel:${esc(spot.phone.replace(/[^0-9+]/g, ''))}">${esc(spot.phone)}</a></div></div></div>` : ''}
      </div>` : ''}
      <div class="sheet-facts">
        <div class="sheet-fact"><div class="k">Distance</div><div class="v">${Geo.formatDistance(km, prefs.units === 'mi')}</div><div class="s">${compass} of ${loc.live ? 'you' : 'planned stop'}</div></div>
        <div class="sheet-fact"><div class="k">Area</div><div class="v">${zone ? esc(zone.label.split(' & ')[0]) : '—'}</div><div class="s">${zone ? esc(zone.region) : ''}</div></div>
        <div class="sheet-fact" data-copycoords="${spot.lat},${spot.lng}" role="button"><div class="k">Coordinates</div><div class="v num">${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}</div><div class="s">Tap to copy</div></div>
      </div>
      ${nearDays.length ? `<div class="sheet-days">
        <div class="k">On the plan</div>
        ${nearDays.map((x) => `<button class="sheet-day" data-gotoday="${x.d.index - 1}">Day ${x.d.index} · ${esc(x.d.city.split(',')[0])} <span>${Geo.formatDistance(x.km, prefs.units === 'mi')}</span></button>`).join('')}
      </div>` : ''}
      <div class="sheet-actions">
        <button class="btn-primary" data-action="open" data-lat="${spot.lat}" data-lng="${spot.lng}" data-label="${esc(spot.name)}">${ICONS.navArrow}Directions</button>
        ${spot.phone ? `<a class="btn-refresh" href="tel:${esc(spot.phone.replace(/[^0-9+]/g, ''))}">${ICONS.phone}Call</a>` : ''}
        <button class="btn-refresh ${saved ? 'is-saved' : ''}" data-action="save" data-poi="${encodeURIComponent(JSON.stringify(spot))}">${saved ? ICONS.heartFilled : ICONS.heart}${saved ? 'Saved' : 'Save'}</button>
      </div>`;
    $('#sheetBackdrop').classList.add('show');
    document.body.classList.add('sheet-open');
  }

  function closePoiSheet() {
    sheetSpot = null;
    $('#sheetBackdrop').classList.remove('show');
    document.body.classList.remove('sheet-open');
  }

  // ---- Saved tab -----------------------------------------------------------
  function renderSaved() {
    const saved = Store.getSaved();
    const fix = Geo.GeoWatch.getLast();
    const nearbySlot = $('#nearbySlot');

    let nearest = null;
    if (fix) {
      saved.forEach((s) => {
        const dist = Geo.haversineKm(fix.lat, fix.lng, s.lat, s.lng);
        if (dist <= 3 && (!nearest || dist < nearest.dist)) nearest = { ...s, dist };
      });
    }
    nearbySlot.innerHTML = nearest ? `<div class="nearby-banner">${ICONS.sparkle}
      <div><div class="t">You're near ${esc(nearest.name)}</div>
      <div class="s">${Geo.formatDistance(nearest.dist, prefs.units === 'mi')} away · saved spot</div></div></div>` : '';

    const list = $('#savedList');
    if (!saved.length) {
      list.innerHTML = '<div class="card"><div class="empty-note">Nothing saved yet — tap the heart on any place to keep it here.</div></div>';
      return;
    }
    const rows = saved.slice().reverse().map((s) => {
      const dist = fix ? Geo.haversineKm(fix.lat, fix.lng, s.lat, s.lng) : null;
      const payload = encodeURIComponent(JSON.stringify(s));
      return `<div class="poi-row" data-id="${s.id}" data-detail="${payload}" role="button">
        <div class="poi-icon cat-${s.category}">${ICONS[CAT_ICON[s.category] || 'mapPin']}</div>
        <div class="poi-body"><div class="poi-name">${esc(s.name)}</div><div class="poi-note">${esc(s.city || '')}</div></div>
        <div class="poi-dist">${dist != null ? Geo.formatDistance(dist, prefs.units === 'mi') : ''}</div>
        <div class="poi-actions">
          <button class="icon-btn saved" data-action="save" data-poi="${payload}">${ICONS.heartFilled}</button>
          <button class="icon-btn" data-action="open" data-lat="${s.lat}" data-lng="${s.lng}" data-label="${esc(s.name)}">${ICONS.mapPin}</button>
        </div>
      </div>`;
    }).join('');
    list.innerHTML = `<div class="card"><div class="poi-list">${rows}</div></div>`;
  }

  // ---- Trip tab --------------------------------------------------------
  function renderRoutePicker() {
    $('#routePicker').innerHTML = MANIFEST.routes.map((r) => {
      const selected = r.id === selectedRouteId;
      return `<button class="route-option ${selected ? 'selected' : ''}" data-route="${r.id}">
        <span class="route-option-check">${ICONS.check}</span>
        <span class="route-option-body">
          <span class="route-option-top">
            <span class="route-option-label">${esc(r.shortLabel || r.label)}</span>
            <span class="route-option-type ${r.type}">${r.type === 'confirmed' ? 'Confirmed' : 'Alternate'}</span>
          </span>
          <span class="route-option-sub">${esc(r.originCity)} → ${esc(r.destCity)} · ${r.dayCount} days</span>
        </span>
      </button>`;
    }).join('');
  }

  function renderTripTab() {
    const route = currentRouteMeta();
    $('#tripName').textContent = MANIFEST.tripName;
    $('#tripTypeBadge').textContent = route.type === 'confirmed' ? 'Confirmed Itinerary' : 'Alternate Route';
    $('#tripSpan').textContent = `${fmtDateShort(TRIP.days[0].date)} – ${fmtDateShort(TRIP.days[TRIP.days.length - 1].date)} · ${TRIP.days.length} days`;
    $('#routeStartLabel').textContent = TRIP.days[0].city.split(',')[0];
    $('#routeEndLabel').textContent = TRIP.days[TRIP.days.length - 1].city.split(',')[0];
    $('#routeSvgWrap').innerHTML = buildRouteSvg(TRIP.days, selectedDayIndex, { compact: false });
    $('#openRouteIcon').innerHTML = ICONS.externalLink;

    renderRoutePicker();

    $('#dayList').innerHTML = TRIP.days.map((day, i) => {
      const isToday = i === todayRealIndex;
      const dd = new Date(day.date + 'T12:00:00');
      return `<div class="day-list-item ${isToday ? 'today' : ''}" data-gotoday="${i}">
        <div class="day-list-badge"><span>${dd.toLocaleDateString('en-CA', { month: 'short' })}</span><span>${dd.getDate()}</span></div>
        <div class="day-list-body">
          <div class="day-list-city">${esc(day.city)}</div>
          <div class="day-list-date">Day ${day.index} · ${dd.toLocaleDateString('en-CA', { weekday: 'long' })}${isToday ? ' · Today' : ''}</div>
          ${daylightRowHtml(day, isToday)}
        </div>
        <div class="day-list-chevron">${ICONS.chevronRightSm}</div>
      </div>`;
    }).join('');

    $$('#unitsToggle button').forEach((b) => b.classList.toggle('active', b.dataset.unit === prefs.units));
    const fix = Geo.GeoWatch.getLast();
    $('#gpsStatusSub').textContent = fix
      ? `Accurate to ${Math.round(fix.accuracy)} m · updated ${timeAgo(fix.ts)}`
      : "Unavailable — using each day's planned coordinates";

    // zones overview — quick jump into the Repository's "By Zone" directory
    if (ZONES) {
      const zoneIds = tripZoneIdsInOrder();
      $('#tripZoneList').innerHTML = zoneIds.map((zid) => {
        const z = ZONES[zid];
        if (!z) return '';
        const span = zoneSpanLabel(zid);
        return `<div class="loc-row" data-triptozone="${zid}" style="cursor:pointer">
          <div class="loc-compass">${ICONS.zone}</div>
          <div class="loc-body">
            <div class="loc-name">${esc(z.label)}</div>
            <div class="loc-sub">${esc(z.region)} · ${span}</div>
          </div>
          <div class="loc-chevron">${ICONS.chevronRightSm}</div>
        </div>`;
      }).join('');
    }

    // weather sync settings
    const wp = prefs;
    $$('#autoWeatherToggle button').forEach((b) => b.classList.toggle('active', (b.dataset.val === 'on') === (wp.autoSyncAllWeather !== false)));
    $('#weatherSyncSub').textContent = wp.lastFullWeatherSync
      ? `All-route forecasts last synced ${timeAgo(wp.lastFullWeatherSync)}`
      : 'Not yet synced — tap Sync Now while online';
  }

  // ---- live Map tab (Leaflet: real route + GPS blue dot, zoom/pan) ----------
  const DAY_MARKER_STYLE = { radius: 7, weight: 2, color: '#fff', fillOpacity: 1 };

  function ensureLeafletMap() {
    if (leafletMap || typeof L === 'undefined') return leafletMap;
    leafletMap = L.map('mapEl', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(leafletMap);
    mapRouteLayer = L.layerGroup().addTo(leafletMap);
    mapDayLayer = L.layerGroup().addTo(leafletMap);
    mapGpsLayer = L.layerGroup().addTo(leafletMap);
    leafletMap.setView([50, -100], 4);
    return leafletMap;
  }

  function drawMapRoute() {
    if (!leafletMap || !TRIP) return;
    mapRouteLayer.clearLayers();
    mapDayLayer.clearLayers();
    const pts = TRIP.days.map((d) => [d.lat, d.lng]);
    if (pts.length > 1) {
      const doneCount = selectedDayIndex + 1;
      L.polyline(pts, { color: 'rgba(20,17,12,0.35)', weight: 4, opacity: 0.9 }).addTo(mapRouteLayer);
      L.polyline(pts.slice(0, doneCount), { color: '#e2792f', weight: 4, opacity: 0.95 }).addTo(mapRouteLayer);
    }
    TRIP.days.forEach((d, i) => {
      const isActive = i === selectedDayIndex;
      const isDone = i < selectedDayIndex;
      const marker = L.circleMarker([d.lat, d.lng], {
        ...DAY_MARKER_STYLE,
        radius: isActive ? 9 : 6,
        fillColor: isActive ? '#e2792f' : (isDone ? '#1c9d74' : '#948d79'),
      }).addTo(mapDayLayer);
      marker.bindTooltip(`Day ${d.index} · ${d.city}`, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => { goToDay(i); switchView('today'); });
    });
    if (mapDrawnForRouteId !== selectedRouteId) {
      const bounds = L.latLngBounds(pts);
      leafletMap.fitBounds(bounds, { padding: [28, 28] });
      mapDrawnForRouteId = selectedRouteId;
    }
  }

  function drawMapGps() {
    if (!leafletMap) return;
    mapGpsLayer.clearLayers();
    const fix = Geo.GeoWatch.getLast();
    if (!fix) return;
    L.circle([fix.lat, fix.lng], { radius: fix.accuracy || 30, color: '#2f6fe0', fillColor: '#2f6fe0', fillOpacity: 0.12, weight: 1 }).addTo(mapGpsLayer);
    L.circleMarker([fix.lat, fix.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f6fe0', fillOpacity: 1 }).addTo(mapGpsLayer);
  }

  function renderMapView() {
    if (typeof L === 'undefined') {
      $('#mapEl').innerHTML = '';
      $('#mapUnavailable').style.display = '';
      return;
    }
    $('#mapUnavailable').style.display = 'none';
    const map = ensureLeafletMap();
    if (!map) return;
    // Leaflet needs a visible, sized container — invalidate on every show.
    setTimeout(() => map.invalidateSize(), 30);
    drawMapRoute();
    drawMapGps();
  }

  // ---- view switching + toast -------------------------------------------
  function switchView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    // Only the Today tab carries the full hero (route strip + progress);
    // every other tab gets a compact nav-bar-height banner.
    $('#dayBanner').classList.toggle('day-banner--compact', name !== 'today');
    // #content isn't actually the scroll container — the document/window is
    // (#app is min-height:100dvh, so it grows with content rather than
    // scrolling internally). Resetting #content.scrollTop was a no-op: tab
    // switches were silently keeping whatever scroll position the previous
    // tab was left at.
    window.scrollTo(0, 0);
    if (name === 'repo') renderRepo();
    if (name === 'saved') renderSaved();
    if (name === 'trip') renderTripTab();
    if (name === 'map') renderMapView();
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---- day navigation ------------------------------------------------------
  function goToDay(i) {
    selectedDayIndex = clamp(i, 0, TRIP.days.length - 1);
    prefs = Store.setPrefs({ selectedDayIndex });
    renderAll();
  }

  // ---- route switching -------------------------------------------------
  async function fetchRoute(routeMeta) {
    if (ROUTES_CACHE[routeMeta.id]) return ROUTES_CACHE[routeMeta.id];
    // Prefer the pre-decompressed data bundle the boot loader in index.html
    // stashed on window (keyed by the same "file" path used in manifest.json)
    // — falls back to a direct fetch so the app still works standalone.
    const bundled = (typeof window !== 'undefined' && window.__C2C_DATA__) ? window.__C2C_DATA__[routeMeta.file] : null;
    const json = bundled || (await (await fetch('/' + routeMeta.file)).json());
    ROUTES_CACHE[routeMeta.id] = { days: json.days, sunWindow: json.sunWindow || null };
    return ROUTES_CACHE[routeMeta.id];
  }

  async function selectRoute(routeId, opts) {
    opts = opts || {};
    // Tapping the already-selected route was re-fetching/re-rendering
    // everything and firing a "Switched to..." toast for a no-op change.
    if (!opts.silent && !opts.force && routeId === selectedRouteId && TRIP) return;
    const routeMeta = MANIFEST.routes.find((r) => r.id === routeId);
    if (!routeMeta) return;
    const prevDate = (TRIP && !opts.silent) ? currentDay().date : null;

    let loaded;
    try {
      loaded = await fetchRoute(routeMeta);
    } catch (e) {
      toast('Could not load that route — try again once online.');
      return;
    }

    selectedRouteId = routeId;
    const days = loaded.days;
    TRIP = { meta: { tripName: MANIFEST.tripName, ...routeMeta }, days, sunWindow: loaded.sunWindow };
    REPO_INDEX = null;

    const autoIdx = determineInitialDayIndex();
    // If switching routes mid-session, try to land on the same calendar
    // date in the new route (comparing "what would day X look like on the
    // alternate route"); otherwise fall back to today/day 0.
    let nextIndex = autoIdx;
    if (prevDate) {
      const matched = TRIP.days.findIndex((d) => d.date === prevDate);
      if (matched >= 0) nextIndex = matched;
    } else if (typeof opts.dayIndex === 'number' && todayRealIndex === -1) {
      // Boot only: restore the last-browsed day, but ONLY when today falls
      // outside the trip's date range. If today IS a trip day, always land
      // on it — otherwise someone who was browsing Day 6 out of curiosity
      // reopens the app on Day 3 (today, at Pukaskwa) and sees Day 6's
      // weather/agenda/nearby stops for a place 700km away.
      nextIndex = opts.dayIndex;
    }
    selectedDayIndex = clamp(nextIndex, 0, TRIP.days.length - 1);

    prefs = Store.setPrefs({ selectedRouteId, selectedDayIndex });
    if (!opts.silent) {
      renderAll();
      toast(`Switched to ${routeMeta.shortLabel || routeMeta.label}`);
    }
  }

  function renderAll() {
    if (!TRIP) return;
    renderBanner();
    const day = currentDay();
    renderSunCard(day);
    renderWeather(day);
    renderAgenda(day);
    renderLocalTabs();
    renderLocalList(day);
    renderKeyLocations(day);
    renderZoneGuide(day);
    renderNotes(day);
    renderTodayNearby();
    if ($('#view-repo').classList.contains('active')) renderRepo();
    if ($('#view-saved').classList.contains('active')) renderSaved();
    if ($('#view-trip').classList.contains('active')) renderTripTab();
    if ($('#view-map').classList.contains('active')) renderMapView();
  }

  function determineInitialDayIndex() {
    const todayStr = localISODate(new Date());
    const idx = TRIP.days.findIndex((d) => d.date === todayStr);
    if (idx >= 0) { todayRealIndex = idx; return idx; }
    todayRealIndex = -1;
    if (todayStr < TRIP.days[0].date) return 0;
    if (todayStr > TRIP.days[TRIP.days.length - 1].date) return TRIP.days.length - 1;
    return 0;
  }

  // ---- online/offline banner -----------------------------------------------
  function updateOnlineStatus() {
    const el = $('#offlineBanner');
    if (!navigator.onLine) {
      el.classList.add('show');
      el.innerHTML = `${ICONS.wifiOff}<span>Offline — showing saved data</span>`;
    } else {
      el.classList.remove('show');
    }
  }

  // ---- global delegated interactions ----------------------------------------
  function wireEvents() {
    document.addEventListener('click', (e) => {
      const navBtn = e.target.closest('#btnPrevDay, #btnNextDay');
      if (navBtn) { if (!navBtn.disabled) goToDay(selectedDayIndex + (navBtn.id === 'btnNextDay' ? 1 : -1)); return; }

      const tabBtn = e.target.closest('.tab-btn');
      if (tabBtn) { switchView(tabBtn.dataset.view); return; }

      const segBtn = e.target.closest('.seg-btn[data-cat]');
      if (segBtn) { currentLocalTab = segBtn.dataset.cat; renderLocalTabs(); renderLocalList(currentDay()); return; }

      const chip = e.target.closest('.chip[data-repocat]');
      if (chip) { currentRepoCategory = chip.dataset.repocat; renderRepo(); return; }

      const repoModeBtn = e.target.closest('[data-repomode]');
      if (repoModeBtn) { repoMode = repoModeBtn.dataset.repomode; repoZoneFocus = null; currentRepoCategory = 'all'; renderRepo(); return; }

      const zoneBackBtn = e.target.closest('[data-zoneback]');
      if (zoneBackBtn) {
        // Reset the category filter along with search — otherwise a chip
        // picked inside one area (Camp & Park, say) silently carries into
        // the next area you open, with the chip row scrolled off-screen so
        // there's no visible sign a filter is even on. Users just see fewer
        // results, or none, with no idea why.
        repoZoneFocus = null; repoSearchTerm = ''; currentRepoCategory = 'all'; $('#repoSearch').value = '';
        renderRepo(); window.scrollTo(0, 0); return;
      }

      const openZoneRow = e.target.closest('[data-openzone]');
      if (openZoneRow) { openZone(openZoneRow.dataset.openzone); return; }

      const browseZoneBtn = e.target.closest('#btnBrowseZone, [data-triptozone]');
      if (browseZoneBtn) { openZone(browseZoneBtn.dataset.zoneid || browseZoneBtn.dataset.triptozone || null); return; }

      const sheetClose = e.target.closest('[data-sheetclose]');
      if (sheetClose || e.target === $('#sheetBackdrop')) { closePoiSheet(); return; }

      const copyCoords = e.target.closest('[data-copycoords]');
      if (copyCoords) {
        const txt = copyCoords.dataset.copycoords;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('Coordinates copied')).catch(() => toast(txt));
        else toast(txt);
        return;
      }

      const mapRecenterBtn = e.target.closest('#btnMapRecenter');
      if (mapRecenterBtn) {
        const fix = Geo.GeoWatch.getLast();
        if (fix && leafletMap) leafletMap.setView([fix.lat, fix.lng], Math.max(leafletMap.getZoom(), 11));
        else toast('No live GPS fix yet');
        return;
      }
      const mapFitBtn = e.target.closest('#btnMapFitRoute');
      if (mapFitBtn) { mapDrawnForRouteId = null; drawMapRoute(); return; }

      const syncWeatherBtn = e.target.closest('#btnSyncAllWeather');
      if (syncWeatherBtn) { syncAllRoutesWeather(true); return; }

      const weatherAutoToggle = e.target.closest('#autoWeatherToggle button');
      if (weatherAutoToggle) {
        const on = weatherAutoToggle.dataset.val === 'on';
        prefs = Store.setPrefs({ autoSyncAllWeather: on });
        renderTripTab();
        return;
      }

      const exportBtn = e.target.closest('#btnExportData');
      if (exportBtn) { exportData(); return; }

      const dayItem = e.target.closest('[data-gotoday]');
      if (dayItem) { closePoiSheet(); goToDay(Number(dayItem.dataset.gotoday)); switchView('today'); return; }

      const routeOpt = e.target.closest('[data-route]');
      if (routeOpt) { selectRoute(routeOpt.dataset.route); return; }

      const openRouteBtn = e.target.closest('#btnOpenRoute');
      if (openRouteBtn) { window.open(fullRouteMapsUrl(TRIP.days), '_blank', 'noopener'); return; }

      const unitBtn = e.target.closest('#unitsToggle button');
      if (unitBtn) { prefs = Store.setPrefs({ units: unitBtn.dataset.unit }); renderAll(); return; }

      const refreshBtn = e.target.closest('#btnRefreshWeather');
      if (refreshBtn) { forceRefreshWeather(); return; }

      // Tapping a directory row (outside its action buttons) opens the detail sheet.
      const detailRow = e.target.closest('[data-detail]');
      if (detailRow && !e.target.closest('.poi-actions') && !e.target.closest('[data-action]')) {
        openPoiSheet(JSON.parse(decodeURIComponent(detailRow.dataset.detail)));
        return;
      }

      const saveBtn = e.target.closest('[data-action="save"]');
      if (saveBtn) {
        const spot = JSON.parse(decodeURIComponent(saveBtn.dataset.poi));
        const nowSaved = Store.toggleSaved(spot);
        toast(nowSaved ? 'Saved' : 'Removed from Saved');
        renderLocalList(currentDay());
        renderTodayNearby();
        if ($('#view-repo').classList.contains('active')) renderRepo();
        if ($('#view-saved').classList.contains('active')) renderSaved();
        if (sheetSpot && sheetSpot.id === spot.id) openPoiSheet(sheetSpot);
        return;
      }

      const openBtn = e.target.closest('[data-action="open"]');
      if (openBtn) {
        const lat = Number(openBtn.dataset.lat), lng = Number(openBtn.dataset.lng), label = openBtn.dataset.label;
        window.open(Geo.mapsUrl(lat, lng, label), '_blank', 'noopener');
        return;
      }
    });

    $('#repoSearch').addEventListener('input', (e) => { repoSearchTerm = e.target.value; renderRepo(); });

    $('#dayNotesInput').addEventListener('input', (e) => {
      autoGrowNotes(e.target);
      // Capture the day id AND the text right now, at keystroke time — not
      // when the debounce timer fires. If the user switches days inside the
      // 400ms window, renderNotes() swaps this textarea's value out from
      // under us; reading e.target.value later would silently save the NEXT
      // day's text under the day being edited, clobbering that day's note.
      const dayId = e.target.dataset.dayid;
      const value = e.target.value;
      clearTimeout(notesSaveTimer);
      notesSaveTimer = setTimeout(() => { Store.setNote(dayId, value); }, 400);
    });
    // Flush any pending debounced note save immediately when the textarea
    // loses focus or the day changes mid-edit — otherwise closing the app
    // within 400ms of the last keystroke silently drops that edit.
    $('#dayNotesInput').addEventListener('blur', (e) => {
      if (notesSaveTimer) {
        clearTimeout(notesSaveTimer);
        notesSaveTimer = null;
        Store.setNote(e.target.dataset.dayid, e.target.value);
      }
    });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  // ---- boot ------------------------------------------------------------
  async function init() {
    $('#tabIconToday').innerHTML = ICONS.sun;
    $('#tabIconRepo').innerHTML = ICONS.listRepo;
    $('#tabIconSaved').innerHTML = ICONS.heart;
    $('#tabIconMap').innerHTML = ICONS.map;
    $('#tabIconTrip').innerHTML = ICONS.compass;
    $('#repoSearchIcon').innerHTML = ICONS.search;
    $('#refreshIcon').innerHTML = ICONS.refresh;
    $('#zoneCardIcon').innerHTML = ICONS.zone;
    $('#mapRecenterIcon').innerHTML = ICONS.crosshair;
    $('#mapFitIcon').innerHTML = ICONS.layers;
    $('#syncAllIcon').innerHTML = ICONS.refresh;
    $('#exportIcon').innerHTML = ICONS.download;

    updateOnlineStatus();
    wireEvents();

    try {
      const bundledManifest = (typeof window !== 'undefined' && window.__C2C_DATA__) ? window.__C2C_DATA__['data/manifest.json'] : null;
      MANIFEST = bundledManifest || (await (await fetch('/data/manifest.json')).json());
      if (!MANIFEST) throw new Error('no manifest');
    } catch (e) {
      $('#content').innerHTML = '<div class="card"><div class="empty-note">Could not load trip data. If you\'re offline for the first time, connect once so the app can cache it.</div></div>';
      return;
    }

    try {
      const bundledZones = (typeof window !== 'undefined' && window.__C2C_DATA__) ? window.__C2C_DATA__['data/zones.json'] : null;
      const zJson = bundledZones || (await (await fetch('/data/zones.json')).json());
      ZONES = {};
      (zJson.zones || []).forEach((z) => { ZONES[z.id] = z; });
    } catch (e) { ZONES = null; /* offline directory just won't show zone info this run */ }

    // One-time migration off the old position-based saved-spot ids (see
    // zonePoiId / poiRowHtml comments) onto the stable name-based scheme.
    Store.migrateSavedIds(zonePoiId);

    prefs = Store.getPrefs();
    const wantedRouteId = (prefs.selectedRouteId && MANIFEST.routes.some((r) => r.id === prefs.selectedRouteId))
      ? prefs.selectedRouteId : MANIFEST.defaultRoute;

    const savedDayIndex = (typeof prefs.selectedDayIndex === 'number' && prefs.selectedDayIndex >= 0) ? prefs.selectedDayIndex : undefined;
    await selectRoute(wantedRouteId, { silent: true, dayIndex: savedDayIndex });
    if (!TRIP) {
      $('#content').innerHTML = '<div class="card"><div class="empty-note">Could not load route data. If you\'re offline for the first time, connect once so the app can cache it.</div></div>';
      return;
    }

    Geo.GeoWatch.onUpdate(() => {
      if ($('#view-today').classList.contains('active')) renderAll();
      if ($('#view-map').classList.contains('active')) drawMapGps();
    });
    Geo.GeoWatch.start();

    renderAll();
    switchView('today');

    setInterval(() => { if (isViewingRealToday()) renderSunCard(currentDay()); }, 30000);

    // Background full-trip weather sync: warms the cache for every day on
    // every route so forecasts are available offline no matter what's opened
    // later. Runs after first paint, only when online, and skips if a sync
    // ran recently or the user turned it off in Settings.
    prefs = Store.getPrefs();
    const staleMs = 1000 * 60 * 60 * 6;
    const dueForSync = prefs.autoSyncAllWeather !== false &&
      (!prefs.lastFullWeatherSync || (Date.now() - prefs.lastFullWeatherSync) > staleMs);
    if (dueForSync) {
      setTimeout(() => { if (navigator.onLine !== false) syncAllRoutesWeather(false); }, 2500);
    }

    if ('serviceWorker' in navigator) {
      const registerSW = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
      // Same async-boot timing issue as below: the window 'load' event has
      // almost always already fired by the time this runs, so a plain
      // addEventListener would silently never register the service worker.
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }
  }

  // app.js is executed asynchronously by index.html's boot loader (after an
  // async fetch+gunzip of the compressed bundle), so by the time we get here
  // DOMContentLoaded has almost always already fired — a plain
  // addEventListener would silently never call init(). Guard both timings.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
