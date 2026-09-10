/**
 * sunengine.js — on-device solar position & event calculator.
 *
 * Pure astronomical math (Julian-day solar position, standard low-precision
 * solar coordinate formulas used across celestial-navigation & photography
 * tools). No network calls, no API keys — works fully offline from a
 * latitude/longitude/date triple, which is exactly what on-board GPS gives
 * us with the engine turned off.
 *
 * Returns times for: astronomical dawn/dusk, nautical dawn/dusk, civil
 * dawn/dusk, blue hour, sunrise/sunset, golden hour, and solar noon — plus
 * live sun altitude/azimuth for "where is the sun right now" UI.
 */
(function (global) {
  'use strict';

  const RAD = Math.PI / 180;
  const DAY_MS = 1000 * 60 * 60 * 24;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQUITY = RAD * 23.4397;

  function toJulian(date) { return date.getTime() / DAY_MS - 0.5 + J1970; }
  function fromJulian(j) { return new Date((j + 0.5 - J1970) * DAY_MS); }
  function toDays(date) { return toJulian(date) - J2000; }

  function solarMeanAnomaly(d) { return RAD * (357.5291 + 0.98560028 * d); }

  function eclipticLongitude(M) {
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = RAD * 102.9372; // perihelion of Earth
    return M + C + P + Math.PI;
  }

  function declination(l) { return Math.asin(Math.sin(l) * Math.sin(OBLIQUITY)); }
  function rightAscension(l) {
    return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));
  }

  function sunCoords(d) {
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    return { dec: declination(L), ra: rightAscension(L) };
  }

  function siderealTime(d, lw) { return RAD * (280.16 + 360.9856235 * d) - lw; }

  function azimuthOf(H, phi, dec) {
    return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  }
  function altitudeOf(H, phi, dec) {
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  }

  /** Live sun position (radians) for a date/lat/lng. */
  function getPosition(date, lat, lng) {
    const lw = RAD * -lng;
    const phi = RAD * lat;
    const d = toDays(date);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return {
      azimuth: azimuthOf(H, phi, c.dec),
      altitude: altitudeOf(H, phi, c.dec),
    };
  }

  const J0 = 0.0009;

  function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * Math.PI)); }
  function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * Math.PI) + n; }
  function solarTransitJ(ds, M, L) {
    return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  }
  function hourAngle(h, phi, d) {
    return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
  }
  function observerAngle(elevation) { return -2.076 * Math.sqrt(Math.max(0, elevation || 0)) / 60; }

  function getSetJ(h, lw, phi, dec, n, M, L) {
    const w = hourAngle(h, phi, dec);
    const a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
  }

  // angle (degrees above/below horizon), name pairs — mirrors the
  // well-known low-precision solar-event table used in photography apps.
  const ANGLE_TIMES = [
    [-0.833, 'sunrise', 'sunset'],
    [-0.3, 'sunriseEnd', 'sunsetStart'],
    [6, 'goldenHourEnd', 'goldenHour'],
    [-4, 'blueHourEnd', 'blueHourStart'],
    [-6, 'dawn', 'dusk'],
    [-12, 'nauticalDawn', 'nauticalDusk'],
    [-18, 'nightEnd', 'night'],
  ];

  /**
   * Full set of solar event times for the given calendar date at lat/lng.
   * `date` should be a Date at local noon-ish (only the calendar day matters).
   */
  function getTimes(date, lat, lng, elevation) {
    const lw = RAD * -lng;
    const phi = RAD * lat;
    const dh = observerAngle(elevation);

    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);

    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L);

    const Jnoon = solarTransitJ(ds, M, L);

    const result = {
      solarNoon: fromJulian(Jnoon),
      nadir: fromJulian(Jnoon - 0.5),
    };

    for (const [angle, riseName, setName] of ANGLE_TIMES) {
      const h0 = (angle + dh) * RAD;
      let Jset;
      try {
        Jset = getSetJ(h0, lw, phi, dec, n, M, L);
      } catch (e) {
        Jset = NaN;
      }
      const Jrise = Jnoon - (Jset - Jnoon);
      result[riseName] = isFinite(Jrise) ? fromJulian(Jrise) : null;
      result[setName] = isFinite(Jset) ? fromJulian(Jset) : null;
    }

    return result;
  }

  /** Sun altitude in degrees right now (negative = below horizon). */
  function altitudeDeg(date, lat, lng) {
    return getPosition(date, lat, lng).altitude / RAD;
  }
  function azimuthDeg(date, lat, lng) {
    return getPosition(date, lat, lng).azimuth / RAD;
  }

  /**
   * Classify "right now" into a phase for UI theming, purely from the sun's
   * current altitude (degrees) — sidesteps all midnight/wraparound edge
   * cases that plague time-range comparisons.
   *   night < -18 <= astronomicalTwilight < -12 <= nauticalTwilight
   *   < -6 <= blueHour < -4 <= civilTwilight < -0.833 <= goldenHour < 6 <= day
   */
  function phaseForAltitude(altDeg) {
    if (altDeg < -18) return 'night';
    if (altDeg < -12) return 'astronomicalTwilight';
    if (altDeg < -6) return 'nauticalTwilight';
    if (altDeg < -4) return 'blueHour';
    if (altDeg < -0.833) return 'civilTwilight';
    if (altDeg < 6) return 'goldenHour';
    return 'day';
  }

  function currentPhase(date, lat, lng) {
    return phaseForAltitude(altitudeDeg(date, lat, lng));
  }

  // ---- moon phase / illumination (for the stargazing rating) --------------
  // Same low-precision-astronomy family as the sun math above (geocentric
  // ecliptic position -> equatorial coordinates -> phase angle). Good to a
  // few percent, which is all a "how dark will it be tonight" indicator needs.
  function declinationLB(l, b) {
    return Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
  }
  function rightAscensionLB(l, b) {
    return Math.atan2(
      Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY),
      Math.cos(l)
    );
  }
  function moonCoords(d) {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.229350 * d);
    const l = L + RAD * 6.289 * Math.sin(M);
    const b = RAD * 5.128 * Math.sin(F);
    const dist = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscensionLB(l, b), dec: declinationLB(l, b), dist };
  }

  /**
   * Moon illumination for a given date (time-of-day independent — the phase
   * barely moves within one night). Returns:
   *   fraction: 0 (new moon, darkest skies) to 1 (full moon, brightest)
   *   phase: 0-1 around the lunar cycle (0/1 = new, 0.5 = full)
   */
  function getMoonIllumination(date) {
    const d = toDays(date);
    const s = sunCoords(d);
    const m = moonCoords(d);
    const sdist = 149598000;
    const phi = Math.acos(
      Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
    );
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(
      Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
    );
    return {
      fraction: (1 + Math.cos(inc)) / 2,
      phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    };
  }

  function moonPhaseName(phase) {
    if (phase < 0.03 || phase > 0.97) return 'New Moon';
    if (phase < 0.22) return 'Waxing Crescent';
    if (phase < 0.28) return 'First Quarter';
    if (phase < 0.47) return 'Waxing Gibbous';
    if (phase < 0.53) return 'Full Moon';
    if (phase < 0.72) return 'Waning Gibbous';
    if (phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  }

  global.SunEngine = {
    getTimes, getPosition, altitudeDeg, azimuthDeg, currentPhase, RAD,
    getMoonIllumination, moonPhaseName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
