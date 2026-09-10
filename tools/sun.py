"""Solar event calculation — two independent implementations for cross-checking.

noaa_times()    NOAA Solar Calculator algorithm (spreadsheet formulation).
suncalc_times() Port of the low-precision SunCalc algorithm the app's
                js/sunengine.js uses, so build output can be diffed against
                what the on-device engine would produce.

Both return timezone-aware UTC datetimes.
"""
import math
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------- NOAA -----
# Zenith angles (degrees from vertical) for each event.
ZENITH_SUNRISE = 90.833   # geometric horizon + refraction + solar semidiameter
ZENITH_CIVIL = 96.0       # sun 6 deg below horizon
ZENITH_GOLDEN = 84.0      # sun 6 deg ABOVE horizon — golden hour boundary
ZENITH_BLUE = 94.0        # sun 4 deg below horizon — blue hour boundary


def _julian_day(y, m, d):
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + b - 1524.5


def _noaa_core(jday):
    t = (jday - 2451545.0) / 36525.0
    # geometric mean longitude of the sun (deg)
    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360.0
    # geometric mean anomaly (deg)
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    # eccentricity of earth's orbit
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    mrad = math.radians(m)
    # equation of centre
    c = (math.sin(mrad) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + math.sin(2 * mrad) * (0.019993 - 0.000101 * t)
         + math.sin(3 * mrad) * 0.000289)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * t
    app_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    # mean obliquity of the ecliptic
    seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
    e0 = 23.0 + (26.0 + seconds / 60.0) / 60.0
    oblcorr = e0 + 0.00256 * math.cos(math.radians(omega))
    decl = math.degrees(math.asin(
        math.sin(math.radians(oblcorr)) * math.sin(math.radians(app_long))))
    # equation of time (minutes)
    y = math.tan(math.radians(oblcorr / 2.0)) ** 2
    l0rad = math.radians(l0)
    eq_time = math.degrees(
        y * math.sin(2 * l0rad)
        - 2 * e * math.sin(mrad)
        + 4 * e * y * math.sin(mrad) * math.cos(2 * l0rad)
        - 0.5 * y * y * math.sin(4 * l0rad)
        - 1.25 * e * e * math.sin(2 * mrad)) * 4.0
    return decl, eq_time


def _hour_angle(lat, decl, zenith):
    latr = math.radians(lat)
    dr = math.radians(decl)
    cos_ha = (math.cos(math.radians(zenith)) / (math.cos(latr) * math.cos(dr))
              - math.tan(latr) * math.tan(dr))
    if cos_ha > 1 or cos_ha < -1:
        return None  # sun never reaches this angle on this date
    return math.degrees(math.acos(cos_ha))


def noaa_times(date, lat, lng):
    """Solar events for a calendar date at lat/lng. Returns UTC datetimes."""
    jday = _julian_day(date.year, date.month, date.day)
    # iterate once from local solar noon for better accuracy
    decl, eq_time = _noaa_core(jday + 0.5 - lng / 360.0)
    noon_min = 720.0 - 4.0 * lng - eq_time  # minutes UTC of solar noon

    out = {}

    def event(zenith, rise_key, set_key):
        ha = _hour_angle(lat, decl, zenith)
        if ha is None:
            out[rise_key] = None
            out[set_key] = None
            return
        out[rise_key] = noon_min - 4.0 * ha
        out[set_key] = noon_min + 4.0 * ha

    event(ZENITH_SUNRISE, 'sunrise', 'sunset')
    event(ZENITH_CIVIL, 'dawn', 'dusk')
    event(ZENITH_GOLDEN, 'goldenEnd', 'goldenStart')
    event(ZENITH_BLUE, 'blueEnd', 'blueStart')
    out['solarNoon'] = noon_min

    midnight = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)

    def to_dt(minutes):
        return None if minutes is None else midnight + timedelta(minutes=minutes)

    return {k: to_dt(v) for k, v in out.items()}


# ------------------------------------------------------------ SunCalc ------
RAD = math.pi / 180.0
DAY_MS = 86400.0
J1970 = 2440588
J2000 = 2451545
OBLIQUITY = RAD * 23.4397
J0 = 0.0009


def _sc_days(dt):
    return dt.timestamp() / DAY_MS - 0.5 + J1970 - J2000


def _sc_mean_anomaly(d):
    return RAD * (357.5291 + 0.98560028 * d)


def _sc_ecliptic_longitude(m):
    c = RAD * (1.9148 * math.sin(m) + 0.02 * math.sin(2 * m) + 0.0003 * math.sin(3 * m))
    return m + c + RAD * 102.9372 + math.pi


def suncalc_times(date, lat, lng):
    """Port of js/sunengine.js getTimes(). Returns UTC datetimes."""
    dt = datetime(date.year, date.month, date.day, 12, 0, 0, tzinfo=timezone.utc)
    lw = RAD * -lng
    phi = RAD * lat
    d = _sc_days(dt)
    n = round(d - J0 - lw / (2 * math.pi))
    ds = J0 + (0 + lw) / (2 * math.pi) + n
    m = _sc_mean_anomaly(ds)
    l = _sc_ecliptic_longitude(m)
    dec = math.asin(math.sin(l) * math.sin(OBLIQUITY))
    jnoon = J2000 + ds + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * l)

    def from_j(j):
        return datetime.fromtimestamp((j + 0.5 - J1970) * DAY_MS, tz=timezone.utc)

    out = {'solarNoon': from_j(jnoon)}
    for angle, rise_key, set_key in ((-0.833, 'sunrise', 'sunset'), (-6.0, 'dawn', 'dusk')):
        h0 = angle * RAD
        try:
            w = math.acos((math.sin(h0) - math.sin(phi) * math.sin(dec))
                          / (math.cos(phi) * math.cos(dec)))
        except ValueError:
            out[rise_key] = out[set_key] = None
            continue
        a = J0 + (w + lw) / (2 * math.pi) + n
        jset = J2000 + a + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * l)
        out[set_key] = from_j(jset)
        out[rise_key] = from_j(jnoon - (jset - jnoon))
    return out
