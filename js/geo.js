/* geo.js — GPS wrapper, distance/bearing math, map deep links. Offline-safe:
   geolocation works with no network at all (GPS hardware only). */
(function (global) {
  'use strict';

  const R_KM = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function formatDistance(km, useMiles) {
    if (km == null || isNaN(km)) return '—';
    const v = useMiles ? km * 0.621371 : km;
    const unit = useMiles ? 'mi' : 'km';
    // v is already in the target unit (miles or km) here — a sub-mile
    // distance needs *5280 to become feet, not *1000 relabeled (that's the
    // km->m conversion, which under-reported imperial short distances ~5x).
    if (v < 1) return useMiles ? `${Math.round(v * 5280)} ft` : `${Math.round(v * 1000)} m`;
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unit}`;
  }

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function mapsUrl(lat, lng, label) {
    const q = encodeURIComponent(label || `${lat},${lng}`);
    if (isIOS()) {
      return `https://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const GeoWatch = {
    _watchId: null,
    _lastFix: null,
    _listeners: new Set(),

    getLast() { return this._lastFix; },

    onUpdate(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },

    _emit() { this._listeners.forEach((fn) => { try { fn(this._lastFix); } catch (e) {} }); },

    start() {
      if (!('geolocation' in navigator)) return;
      if (this._watchId != null) return;
      try {
        const cached = localStorage.getItem('c2c_last_fix');
        if (cached) this._lastFix = JSON.parse(cached);
      } catch (e) {}
      this._watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this._lastFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            ts: Date.now(),
          };
          try { localStorage.setItem('c2c_last_fix', JSON.stringify(this._lastFix)); } catch (e) {}
          this._emit();
        },
        () => { this._emit(); },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
    },

    stop() {
      if (this._watchId != null) navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    },
  };

  global.Geo = { haversineKm, bearingDeg, formatDistance, mapsUrl, isIOS, GeoWatch };
})(typeof window !== 'undefined' ? window : globalThis);
