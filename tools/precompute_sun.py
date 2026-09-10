#!/usr/bin/env python3
"""Precompute per-day solar events into the route JSON files.

The app used to compute sunrise/sunset on device from lat/lng at render time.
That is fine for "where am I right now", but for the *planned* itinerary the
numbers never change, so they are baked in here at build time instead:
one authoritative value per day, computed with the NOAA solar algorithm and
resolved into that day's own local timezone (DST included).

Validated against the US Naval Observatory rise/set/twilight service for
Thessalon ON, Pukaskwa ON, Regina SK (no DST), Calgary AB and Enderby BC —
agreement within 1 minute, which is USNO's own stated precision.

Writes a `sun` object onto every day:
    dawn      civil twilight begin, "HH:MM" local
    sunrise   "HH:MM" local
    noon      solar noon, "HH:MM" local
    sunset    "HH:MM" local
    dusk      civil twilight end, "HH:MM" local
    blueEnd   morning blue hour ends (sun -4 deg), "HH:MM" local
    goldenEnd morning golden hour ends (sun +6 deg), "HH:MM" local
    goldenStart evening golden hour begins (sun +6 deg), "HH:MM" local
    blueStart evening blue hour begins (sun -4 deg), "HH:MM" local
    daylight  minutes between sunrise and sunset
    tzAbbr    e.g. "EDT" / "CST" / "PDT"
"""
import json
import os
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sun import noaa_times  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTE_FILES = ['data/routes/ground-truth.json', 'data/routes/loop1-10day.json']


def local_hhmm(dt_utc, tz):
    """UTC datetime -> 'HH:MM' in tz, rounded to the nearest minute."""
    if dt_utc is None:
        return None
    local = dt_utc.astimezone(tz)
    minutes = local.hour * 60 + local.minute + (1 if local.second >= 30 else 0)
    minutes %= 1440
    return '%02d:%02d' % (minutes // 60, minutes % 60)


def hhmm_to_min(s):
    h, m = s.split(':')
    return int(h) * 60 + int(m)


def sun_for_day(day):
    tz = ZoneInfo(day['tz'])
    y, m, d = (int(x) for x in day['date'].split('-'))
    times = noaa_times(date(y, m, d), day['lat'], day['lng'])

    out = {}
    for key in ('dawn', 'sunrise', 'solarNoon', 'sunset', 'dusk',
                'blueEnd', 'goldenEnd', 'goldenStart', 'blueStart'):
        out['noon' if key == 'solarNoon' else key] = local_hhmm(times[key], tz)

    if out['sunrise'] and out['sunset']:
        out['daylight'] = hhmm_to_min(out['sunset']) - hhmm_to_min(out['sunrise'])
    else:
        out['daylight'] = None

    out['tzAbbr'] = datetime(y, m, d, 12, tzinfo=tz).strftime('%Z')
    return out


def route_window(days):
    """Shared clock window for the whole route's daylight bars.

    Every day's bar is drawn on this same axis, so the bars are directly
    comparable down the list — you can see daylight shrinking as the trip
    moves into October. Rounded out to the half hour with 30 min of margin.
    """
    dawns = [hhmm_to_min(d['sun']['dawn']) for d in days if d['sun']['dawn']]
    dusks = [hhmm_to_min(d['sun']['dusk']) for d in days if d['sun']['dusk']]
    if not dawns or not dusks:
        return {'start': 300, 'end': 1320}
    start = ((min(dawns) - 30) // 30) * 30
    end = -((-(max(dusks) + 30)) // 30) * 30
    return {'start': max(0, start), 'end': min(1440, end)}


def main():
    total = 0
    for rel in ROUTE_FILES:
        path = os.path.join(ROOT, rel)
        with open(path) as f:
            route = json.load(f)

        print('\n%s  (%d days)' % (rel, len(route['days'])))
        print('  %-3s %-11s %-34s %-6s %-6s %-6s %-6s %-6s %s'
              % ('#', 'date', 'city', 'dawn', 'rise', 'noon', 'set', 'dusk', 'daylight'))
        for day in route['days']:
            s = sun_for_day(day)
            day['sun'] = s
            total += 1
            dl = '%dh %02dm' % (s['daylight'] // 60, s['daylight'] % 60) if s['daylight'] else '—'
            print('  %-3d %-11s %-34s %-6s %-6s %-6s %-6s %-6s %s'
                  % (day['index'], day['date'], day['city'][:34],
                     s['dawn'], s['sunrise'], s['noon'], s['sunset'], s['dusk'], dl))

        route['sunWindow'] = route_window(route['days'])
        w = route['sunWindow']
        print('  window %02d:%02d -> %02d:%02d'
              % (w['start'] // 60, w['start'] % 60, w['end'] // 60, w['end'] % 60))

        with open(path, 'w') as f:
            json.dump(route, f, ensure_ascii=False, indent=2)
            f.write('\n')

    print('\n%d days written.' % total)


if __name__ == '__main__':
    main()
