# Coast2Coast — Road Trip & Light

An offline-first, installable (Add to Home Screen) day-by-day itinerary app
for a cross-Canada road trip: sunrise/sunset/golden-hour/blue-hour computed
**on-device from GPS** (no API), a cached weather forecast, a daily agenda,
a "What's Local" tabbed POI browser, an offline repository of every stop on
the trip, a saved-spots list with proximity awareness, a trip overview, and
a **route selector** for comparing the confirmed itinerary against alternate
proposed routes — the chosen route drives sun/weather/map data everywhere
in the app.

No backend, no accounts, no build step — plain HTML/CSS/JS, deployed as a
static site.

## Editing your itinerary(s)

Trip content is **multi-route**: `data/manifest.json` lists every route
(id, label, confirmed/alternate badge, date span, day count, and which file
holds its days), and each route's actual days live in their own file under
`data/routes/`:

- `data/routes/ground-truth.json` — the real, confirmed itinerary
- `data/routes/loop3-28day.json`, `loop2-21day.json`, `loop1-10day.json` —
  alternate AI-proposed routes, included for side-by-side comparison

Hand-edit any of these — they're plain JSON. Each day has:

```jsonc
{
  "id": "gt-d01",
  "index": 1,
  "date": "2026-09-19",
  "tz": "America/Vancouver",     // IANA zone — Canada spans 6 of them
  "city": "Victoria, BC",
  "lat": 48.4284, "lng": -123.3656,
  "driveFromPrev": "312 km",
  "summary": "…",
  "agenda": [ { "time": "09:00", "title": "…", "type": "sight", "lat": .., "lng": .. } ],
  "local": { "food": [...], "gas": [...], "photo": [...], "events": [...] },
  "keyLocations": [ { "name": "…", "lat": .., "lng": .. } ]
}
```

Add a route by dropping a new `data/routes/<id>.json` file (same shape —
just a top-level `{ "days": [...] }`) and adding an entry for it to
`data/manifest.json`. `build_trip_data.py` is a leftover generator for the
old single-route placeholder data and is no longer used — safe to ignore
or delete.

## Running locally

```bash
cd coast2coast   # this folder
python3 -m http.server 8080
# open http://localhost:8080
```

(Any static file server works — the app has no server-side code.)

## Installing on iPhone / iPad (offline use)

1. Open the deployed URL in Safari.
2. Share → **Add to Home Screen**.
3. Launch it once while online so the service worker can cache everything
   (app shell, icons, and your itinerary data).
4. After that first load, it works fully offline — GPS still works with
   no signal, and sun/light calculations run entirely on-device.

## Weather

Uses [Open-Meteo](https://open-meteo.com) — free, no API key. The app
fetches fresh data opportunistically whenever it's online and caches the
result locally with a "last updated" timestamp, so the most recent
forecast is always available even with no connection.

## Deploying

Static site — deploys as-is to Vercel, Netlify, GitHub Pages, or any
static host. No build command needed.
