import json

# Sample / placeholder cross-Canada itinerary (Victoria, BC -> Halifax, NS).
# Coordinates are real landmark coordinates. Times & notes are editable
# placeholders -- swap in your actual bookings/reservations.
# Edit this file, then run `python3 build_trip_data.py` to regenerate
# data/trip.json.

START_DATE = "2026-09-05"

def d(offset, city, region, lat, lng, drive, summary, agenda, local, key):
    return dict(offset=offset, city=city, region=region, lat=lat, lng=lng,
                drive=drive, summary=summary, agenda=agenda, local=local, key=key)

# IANA timezone per day, in DAYS order (Canada spans six zones coast to coast).
TZS = [
    "America/Vancouver", "America/Vancouver", "America/Vancouver",
    "America/Vancouver", "America/Vancouver",
    "America/Edmonton", "America/Edmonton", "America/Edmonton",
    "America/Regina", "America/Winnipeg",
    "America/Thunder_Bay", "America/Toronto", "America/Toronto",
    "America/Toronto", "America/Toronto", "America/Halifax",
]

DAYS = [
    d(0, "Victoria, BC", "Vancouver Island", 48.4284, -123.3656, None,
      "Trip start — harbour city on the Pacific edge.",
      [
        {"time": "09:00", "title": "Coffee at the Inner Harbour", "type": "food"},
        {"time": "10:30", "title": "Butchart Gardens", "type": "sight", "lat": 48.5610, "lng": -123.4720},
        {"time": "15:00", "title": "Fisherman's Wharf", "type": "sight", "lat": 48.4235, "lng": -123.3853},
        {"time": "19:00", "title": "Sunset — Ogden Point breakwater", "type": "photo", "lat": 48.4144, "lng": -123.3856},
      ],
      {
        "food": [{"name": "Red Fish Blue Fish", "lat": 48.4229, "lng": -123.3702, "note": "Dockside seafood shack"}],
        "gas": [{"name": "Petro-Canada — Douglas St", "lat": 48.4353, "lng": -123.3697}],
        "photo": [{"name": "Ogden Point Breakwater", "lat": 48.4144, "lng": -123.3856, "note": "Golden hour over the strait"}],
        "events": [],
      },
      [{"name": "Butchart Gardens", "lat": 48.5610, "lng": -123.4720},
       {"name": "Inner Harbour", "lat": 48.4229, "lng": -123.3707}]),

    d(1, "Vancouver, BC", "Lower Mainland", 49.2827, -123.1207, "3.5 hr incl. ferry",
      "Ferry over from the Island into the city.",
      [
        {"time": "10:00", "title": "Stanley Park seawall", "type": "sight", "lat": 49.3017, "lng": -123.1444},
        {"time": "13:00", "title": "Granville Island Public Market", "type": "food", "lat": 49.2714, "lng": -123.1348},
        {"time": "17:30", "title": "Capilano Suspension Bridge", "type": "sight", "lat": 49.3429, "lng": -123.1150},
        {"time": "20:00", "title": "Sunset Beach golden hour", "type": "photo", "lat": 49.2795, "lng": -123.1400},
      ],
      {
        "food": [{"name": "Granville Island Market", "lat": 49.2714, "lng": -123.1348}],
        "gas": [{"name": "Shell — West Georgia St", "lat": 49.2856, "lng": -123.1259}],
        "photo": [{"name": "Vancouver Lookout", "lat": 49.2856, "lng": -123.1113}],
        "events": [],
      },
      [{"name": "Stanley Park", "lat": 49.3017, "lng": -123.1444},
       {"name": "Granville Island", "lat": 49.2714, "lng": -123.1348}]),

    d(2, "Whistler, BC", "Sea to Sky", 50.1163, -122.9574, "2 hr",
      "Sea-to-Sky Highway north — one of the most scenic drives in the country.",
      [
        {"time": "09:00", "title": "Sea to Sky Gondola stop", "type": "sight", "lat": 49.6839, "lng": -123.1614},
        {"time": "13:00", "title": "Whistler Village", "type": "food", "lat": 50.1163, "lng": -122.9574},
        {"time": "15:30", "title": "Peak 2 Peak Gondola", "type": "sight", "lat": 50.0837, "lng": -122.9491},
      ],
      {
        "food": [{"name": "Whistler Village Square eats", "lat": 50.1163, "lng": -122.9574}],
        "gas": [{"name": "Petro-Canada — Whistler", "lat": 50.1150, "lng": -122.9550}],
        "photo": [{"name": "Joffre Lakes (side trip)", "lat": 50.3689, "lng": -122.4930, "note": "~1 hr detour, turquoise glacial lake"}],
        "events": [],
      },
      [{"name": "Whistler Village", "lat": 50.1163, "lng": -122.9574},
       {"name": "Peak 2 Peak Gondola", "lat": 50.0837, "lng": -122.9491}]),

    d(3, "Kamloops, BC", "Thompson-Okanagan", 50.6745, -120.3273, "3 hr",
      "Coast mountains give way to dry grassland canyon country.",
      [
        {"time": "12:00", "title": "Kamloops Lake viewpoint", "type": "photo", "lat": 50.7167, "lng": -120.7167},
        {"time": "16:00", "title": "Riverside Park walk", "type": "sight", "lat": 50.6733, "lng": -120.3242},
      ],
      {
        "food": [{"name": "Downtown Kamloops eats", "lat": 50.6760, "lng": -120.3400}],
        "gas": [{"name": "Husky — Trans-Canada Hwy", "lat": 50.6800, "lng": -120.3600}],
        "photo": [{"name": "Kamloops Lake overlook", "lat": 50.7167, "lng": -120.7167}],
        "events": [],
      },
      [{"name": "Riverside Park", "lat": 50.6733, "lng": -120.3242}]),

    d(4, "Revelstoke, BC", "Columbia Mountains", 50.9981, -118.1957, "3 hr",
      "Into the Columbia Mountains — glaciers and old-growth cedar.",
      [
        {"time": "10:00", "title": "Meadows in the Sky Parkway", "type": "sight", "lat": 51.0730, "lng": -118.1900},
        {"time": "14:00", "title": "Enchanted Forest", "type": "sight", "lat": 51.1580, "lng": -118.5450},
        {"time": "18:30", "title": "Sunset from Mt. Revelstoke summit", "type": "photo", "lat": 51.0730, "lng": -118.1900},
      ],
      {
        "food": [{"name": "Downtown Revelstoke", "lat": 50.9981, "lng": -118.1957}],
        "gas": [{"name": "Chevron — Trans-Canada Hwy", "lat": 51.0000, "lng": -118.2000}],
        "photo": [{"name": "Mount Revelstoke summit road", "lat": 51.0730, "lng": -118.1900}],
        "events": [],
      },
      [{"name": "Mount Revelstoke National Park", "lat": 51.0730, "lng": -118.1900}]),

    d(5, "Banff, AB", "Canadian Rockies", 51.1784, -115.5708, "2.5 hr",
      "Rockies proper — the postcard stretch of the trip begins.",
      [
        {"time": "09:30", "title": "Banff Gondola — Sulphur Mountain", "type": "sight", "lat": 51.1500, "lng": -115.5717},
        {"time": "13:00", "title": "Bow Falls + Surprise Corner", "type": "photo", "lat": 51.1725, "lng": -115.5650},
        {"time": "17:00", "title": "Lake Minnewanka drive", "type": "sight", "lat": 51.2333, "lng": -115.4333},
      ],
      {
        "food": [{"name": "Banff Ave eateries", "lat": 51.1784, "lng": -115.5708}],
        "gas": [{"name": "Petro-Canada — Banff Ave", "lat": 51.1770, "lng": -115.5690}],
        "photo": [{"name": "Surprise Corner (Bow Falls view)", "lat": 51.1725, "lng": -115.5650}],
        "events": [],
      },
      [{"name": "Banff Gondola", "lat": 51.1500, "lng": -115.5717},
       {"name": "Lake Minnewanka", "lat": 51.2333, "lng": -115.4333}]),

    d(6, "Lake Louise, AB", "Canadian Rockies", 51.4254, -116.1773, "1 hr",
      "Short drive, huge payoff — Moraine Lake and the Icefields Parkway gateway.",
      [
        {"time": "07:00", "title": "Moraine Lake at sunrise", "type": "photo", "lat": 51.3217, "lng": -116.1860},
        {"time": "10:00", "title": "Lake Louise shoreline walk", "type": "sight", "lat": 51.4254, "lng": -116.1773},
        {"time": "14:00", "title": "Icefields Parkway scenic drive north", "type": "sight", "lat": 52.2159, "lng": -117.2140},
      ],
      {
        "food": [{"name": "Lake Louise Village", "lat": 51.4370, "lng": -116.1770}],
        "gas": [{"name": "Petro-Canada — Lake Louise Village", "lat": 51.4370, "lng": -116.1770}],
        "photo": [{"name": "Moraine Lake Rockpile", "lat": 51.3217, "lng": -116.1860, "note": "Arrive pre-dawn — parking fills early"}],
        "events": [],
      },
      [{"name": "Moraine Lake", "lat": 51.3217, "lng": -116.1860},
       {"name": "Lake Louise", "lat": 51.4254, "lng": -116.1773}]),

    d(7, "Calgary, AB", "Prairies gateway", 51.0447, -114.0719, "2 hr",
      "Down out of the mountains onto the prairie edge.",
      [
        {"time": "11:00", "title": "Calgary Tower", "type": "sight", "lat": 51.0444, "lng": -114.0631},
        {"time": "13:30", "title": "Studio Bell (National Music Centre)", "type": "sight", "lat": 51.0472, "lng": -114.0522},
        {"time": "18:00", "title": "Peace Bridge sunset", "type": "photo", "lat": 51.0533, "lng": -114.0703},
      ],
      {
        "food": [{"name": "Inglewood strip", "lat": 51.0417, "lng": -114.0333}],
        "gas": [{"name": "Husky — Memorial Dr", "lat": 51.0500, "lng": -114.0500}],
        "photo": [{"name": "Peace Bridge", "lat": 51.0533, "lng": -114.0703}],
        "events": [],
      },
      [{"name": "Calgary Tower", "lat": 51.0444, "lng": -114.0631}]),

    d(8, "Regina, SK", "Prairies", 50.4452, -104.6189, "7 hr",
      "Long prairie push — big sky driving.",
      [
        {"time": "17:00", "title": "Wascana Centre lakeside walk", "type": "sight", "lat": 50.4333, "lng": -104.6017},
        {"time": "18:30", "title": "Saskatchewan Legislative Building", "type": "sight", "lat": 50.4297, "lng": -104.6178},
      ],
      {
        "food": [{"name": "Downtown Regina", "lat": 50.4452, "lng": -104.6189}],
        "gas": [{"name": "Co-op — Trans-Canada Hwy", "lat": 50.4600, "lng": -104.6400}],
        "photo": [{"name": "Wascana Lake at dusk", "lat": 50.4333, "lng": -104.6017}],
        "events": [],
      },
      [{"name": "Wascana Centre", "lat": 50.4333, "lng": -104.6017}]),

    d(9, "Winnipeg, MB", "Prairies", 49.8951, -97.1384, "6 hr",
      "The Forks — where two rivers and centuries of trade routes meet.",
      [
        {"time": "17:00", "title": "The Forks Market", "type": "food", "lat": 49.8917, "lng": -97.1306},
        {"time": "19:00", "title": "Canadian Museum for Human Rights", "type": "sight", "lat": 49.8917, "lng": -97.1275},
      ],
      {
        "food": [{"name": "The Forks Market", "lat": 49.8917, "lng": -97.1306}],
        "gas": [{"name": "Petro-Canada — Pembina Hwy", "lat": 49.8600, "lng": -97.1500}],
        "photo": [{"name": "The Forks riverwalk", "lat": 49.8917, "lng": -97.1306}],
        "events": [],
      },
      [{"name": "The Forks", "lat": 49.8917, "lng": -97.1306}]),

    d(10, "Thunder Bay, ON", "Northern Ontario", 48.3809, -89.2477, "7 hr",
      "Into Ontario along the north shore of Lake Superior.",
      [
        {"time": "17:00", "title": "Sleeping Giant lookout", "type": "photo", "lat": 48.3167, "lng": -88.8500},
        {"time": "19:30", "title": "Kakabeka Falls", "type": "sight", "lat": 48.4011, "lng": -89.6236},
      ],
      {
        "food": [{"name": "Downtown Thunder Bay", "lat": 48.3809, "lng": -89.2477}],
        "gas": [{"name": "Esso — Trans-Canada Hwy", "lat": 48.4000, "lng": -89.2500}],
        "photo": [{"name": "Sleeping Giant Provincial Park", "lat": 48.3167, "lng": -88.8500}],
        "events": [],
      },
      [{"name": "Kakabeka Falls", "lat": 48.4011, "lng": -89.6236}]),

    d(11, "Sault Ste. Marie, ON", "Northern Ontario", 46.5136, -84.3358, "6 hr",
      "Lake Superior's eastern shore, gateway to Algoma country.",
      [
        {"time": "16:00", "title": "Whitefish Island trail", "type": "sight", "lat": 46.5175, "lng": -84.3467},
        {"time": "19:00", "title": "St. Marys River boardwalk sunset", "type": "photo", "lat": 46.5100, "lng": -84.3350},
      ],
      {
        "food": [{"name": "Downtown Sault Ste. Marie", "lat": 46.5136, "lng": -84.3358}],
        "gas": [{"name": "Petro-Canada — Great Northern Rd", "lat": 46.5400, "lng": -84.3500}],
        "photo": [{"name": "Agawa Canyon lookout (seasonal train)", "lat": 47.0500, "lng": -84.5500}],
        "events": [],
      },
      [{"name": "Whitefish Island", "lat": 46.5175, "lng": -84.3467}]),

    d(12, "Ottawa, ON", "National Capital Region", 45.4215, -75.6972, "9 hr",
      "Long haul east into the capital.",
      [
        {"time": "18:00", "title": "Parliament Hill", "type": "sight", "lat": 45.4236, "lng": -75.7003},
        {"time": "20:00", "title": "ByWard Market dinner", "type": "food", "lat": 45.4290, "lng": -75.6919},
      ],
      {
        "food": [{"name": "ByWard Market", "lat": 45.4290, "lng": -75.6919}],
        "gas": [{"name": "Shell — Bank St", "lat": 45.4000, "lng": -75.6900}],
        "photo": [{"name": "Rideau Canal locks, Parliament backdrop", "lat": 45.4211, "lng": -75.6923}],
        "events": [],
      },
      [{"name": "Parliament Hill", "lat": 45.4236, "lng": -75.7003}]),

    d(13, "Montreal, QC", "Quebec", 45.5019, -73.5674, "2 hr",
      "Old-world streets and a mountain in the middle of the city.",
      [
        {"time": "10:00", "title": "Old Montreal + Notre-Dame Basilica", "type": "sight", "lat": 45.5045, "lng": -73.5563},
        {"time": "16:00", "title": "Mount Royal lookout", "type": "photo", "lat": 45.5048, "lng": -73.5878},
      ],
      {
        "food": [{"name": "Old Montreal bistros", "lat": 45.5045, "lng": -73.5563}],
        "gas": [{"name": "Petro-Canada — Rene-Levesque", "lat": 45.4990, "lng": -73.5700}],
        "photo": [{"name": "Mount Royal Kondiaronk lookout", "lat": 45.5048, "lng": -73.5878}],
        "events": [],
      },
      [{"name": "Notre-Dame Basilica", "lat": 45.5045, "lng": -73.5563},
       {"name": "Mount Royal", "lat": 45.5048, "lng": -73.5878}]),

    d(14, "Quebec City, QC", "Quebec", 46.8139, -71.2080, "3 hr",
      "The walled Old City and one of the tallest waterfalls in the province.",
      [
        {"time": "11:00", "title": "Old Quebec + Chateau Frontenac", "type": "sight", "lat": 46.8123, "lng": -71.2048},
        {"time": "15:00", "title": "Montmorency Falls", "type": "photo", "lat": 46.8869, "lng": -71.1444},
      ],
      {
        "food": [{"name": "Petit Champlain district", "lat": 46.8117, "lng": -71.2028}],
        "gas": [{"name": "Esso — Boulevard Charest", "lat": 46.8150, "lng": -71.2300}],
        "photo": [{"name": "Montmorency Falls suspension bridge", "lat": 46.8869, "lng": -71.1444}],
        "events": [],
      },
      [{"name": "Chateau Frontenac", "lat": 46.8123, "lng": -71.2048},
       {"name": "Montmorency Falls", "lat": 46.8869, "lng": -71.1444}]),

    d(15, "Halifax, NS", "Maritimes", 44.6488, -63.5752, "8.5 hr",
      "Coast to coast — Atlantic tidewater at last.",
      [
        {"time": "10:00", "title": "Peggy's Cove lighthouse", "type": "photo", "lat": 44.4918, "lng": -63.9168},
        {"time": "15:00", "title": "Halifax Waterfront Boardwalk", "type": "sight", "lat": 44.6474, "lng": -63.5697},
        {"time": "18:30", "title": "Citadel Hill sunset", "type": "photo", "lat": 44.6478, "lng": -63.5806},
      ],
      {
        "food": [{"name": "Halifax Waterfront eateries", "lat": 44.6474, "lng": -63.5697}],
        "gas": [{"name": "Irving — Barrington St", "lat": 44.6500, "lng": -63.5800}],
        "photo": [{"name": "Peggy's Cove", "lat": 44.4918, "lng": -63.9168, "note": "Iconic — arrive early or late to beat crowds"}],
        "events": [],
      },
      [{"name": "Peggy's Cove", "lat": 44.4918, "lng": -63.9168},
       {"name": "Citadel Hill", "lat": 44.6478, "lng": -63.5806}]),
]

def iso_date(offset):
    import datetime
    base = datetime.date.fromisoformat(START_DATE)
    return (base + datetime.timedelta(days=offset)).isoformat()

out_days = []
for i, day in enumerate(DAYS):
    out_days.append({
        "id": f"d{i+1:02d}",
        "index": i + 1,
        "date": iso_date(day["offset"]),
        "tz": TZS[i],
        "city": day["city"],
        "region": day["region"],
        "lat": day["lat"],
        "lng": day["lng"],
        "driveFromPrev": day["drive"],
        "summary": day["summary"],
        "agenda": day["agenda"],
        "local": day["local"],
        "keyLocations": day["key"],
    })

trip = {
    "meta": {
        "tripName": "Coast to Coast — Cross-Canada Road Trip",
        "startDate": START_DATE,
        "endDate": iso_date(DAYS[-1]["offset"]),
        "days": len(DAYS),
        "note": "Sample placeholder itinerary — edit data/trip.json (or re-run build_trip_data.py) with your real bookings, times and addresses.",
    },
    "days": out_days,
}

with open("data/trip.json", "w") as f:
    json.dump(trip, f, indent=2)

print(f"Wrote data/trip.json with {len(out_days)} days, {iso_date(0)} -> {iso_date(DAYS[-1]['offset'])}")
