/* icons.js — tiny hand-rolled stroke-icon set (SF-Symbols-ish), zero deps. */
(function (global) {
  'use strict';
  const s = (inner, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  const ICONS = {
    chevronLeft: s('<path d="M15 18l-6-6 6-6"/>'),
    chevronRight: s('<path d="M9 18l6-6-6-6"/>'),
    chevronRightSm: s('<path d="M9 18l6-6-6-6"/>'),
    sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    sunrise: s('<path d="M12 2v4M4.9 8.9l1.4 1.4M2 16h2M20 16h2M17.7 10.3l1.4-1.4"/><path d="M6 16a6 6 0 0112 0"/><path d="M2 20h20"/>'),
    sunset: s('<path d="M12 6V2M4.9 8.9l1.4 1.4M2 16h2M20 16h2M17.7 10.3l1.4-1.4"/><path d="M6 16a6 6 0 0112 0"/><path d="M2 20h20"/>'),
    mapPin: s('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>'),
    compass: s('<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>'),
    star: s('<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.4-.6L12 3z"/>'),
    starFilled: s('<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.4-.6L12 3z" fill="currentColor"/>'),
    heart: s('<path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.9 4.9 0 018.8-3 4.9 4.9 0 018.8 3z"/>'),
    heartFilled: s('<path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.9 4.9 0 018.8-3 4.9 4.9 0 018.8 3z" fill="currentColor"/>'),
    fuel: s('<path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M3 12h10"/><path d="M13 7l3 3v7a1.5 1.5 0 003 0v-5l-2.5-2.5"/>'),
    utensils: s('<path d="M6 2v8a2 2 0 002 2 2 2 0 002-2V2M8 12v10M17 2c-1.5 1-2 3-2 5s.5 3 2 3 2-1 2-3-.5-4-2-5zM17 12v10"/>'),
    camera: s('<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="14" r="3.5"/>'),
    calendarEvent: s('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>'),
    search: s('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'),
    filter: s('<path d="M4 5h16M7 12h10M10 19h4"/>'),
    cloud: s('<path d="M7 18a4.5 4.5 0 01-.4-9A5.5 5.5 0 0117 8.5a4 4 0 01-.5 8H7z"/>'),
    cloudSun: s('<path d="M12 3v1.5M5.6 5.6l1 1M18.4 5.6l-1 1M3 12h1.5" /><circle cx="12" cy="9" r="3"/><path d="M6.5 20a4 4 0 01-.4-8 5 5 0 019.6-1.6A3.6 3.6 0 0119 18H6.5z"/>'),
    cloudRain: s('<path d="M6.5 15.5a4 4 0 01-.4-8 5 5 0 019.6-1.6A3.6 3.6 0 0119 13.5H6.5z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>'),
    cloudSnow: s('<path d="M6.5 14.5a4 4 0 01-.4-8 5 5 0 019.6-1.6A3.6 3.6 0 0119 12.5H6.5z"/><path d="M8 18v.01M12 20v.01M16 18v.01M8 15v.01M16 15v.01"/>'),
    cloudFog: s('<path d="M6.5 13a4 4 0 01-.4-8 5 5 0 019.6-1.6A3.6 3.6 0 0119 11H6.5z"/><path d="M4 16h16M4 20h16"/>'),
    wind: s('<path d="M3 8h11a2.5 2.5 0 100-5"/><path d="M3 13h15a2.5 2.5 0 110 5"/><path d="M3 18h7"/>'),
    drop: s('<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>'),
    clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    wifiOff: s('<path d="M2 8.5c2.5-2 6-3.2 10-3.2M22 8.5a17 17 0 00-4-2.6M5.5 12.5A11 11 0 0112 11c1 0 2 .1 2.9.4M8.5 16.5a6 6 0 017 0M12 20h.01M2 2l20 20"/>'),
    refresh: s('<path d="M21 12a9 9 0 10-2.7 6.4M21 5v6h-6"/>'),
    check: s('<path d="M20 6L9 17l-5-5"/>'),
    listRepo: s('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    map: s('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
    navArrow: s('<path d="M12 2l8 18-8-4-8 4 8-18z" fill="currentColor" stroke="none"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    externalLink: s('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6"/>'),
    close: s('<path d="M18 6L6 18M6 6l12 12"/>'),
    gps: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    sparkle: s('<path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2z"/>'),
    tent: s('<path d="M12 3l9 17H3z"/><path d="M12 3l5 17M12 3L7 20M9.5 15h5"/>'),
    mountain: s('<path d="M3 19l6-10 3 4.5L15 8l6 11z"/><path d="M9.5 12.5L12 16"/>'),
    zone: s('<path d="M12 2l9 4.5v9L12 20l-9-4.5v-9z"/><path d="M12 2v18M3 6.5l9 4.5 9-4.5"/>'),
    shield: s('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    notebook: s('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M4 8h4M4 13h4M4 18h4"/>'),
    download: s('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
    crosshair: s('<circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    layers: s('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  };

  global.ICONS = ICONS;
})(typeof window !== 'undefined' ? window : globalThis);
