#!/usr/bin/env python3
"""Probe Recreation.gov campsite availability API for nightly prices."""
import json, urllib.request, sys

def fetch(facility_id, month="2026-08-20"):
    url = f"https://www.recreation.gov/api/camps/availability/campground/{facility_id}/month?start_date={month}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Referer": f"https://www.recreation.gov/camping/campgrounds/{facility_id}",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

facility = sys.argv[1] if len(sys.argv) > 1 else "232430"
d = fetch(facility)
campsites = d.get("campsites") or {}
print(f"facility {facility}: {len(campsites)} campsites")
prices = set()
for cid, s in list(campsites.items())[:8]:
    for day, info in (s.get("availabilities") or {}).items():
        p = info.get("price")
        if p:
            prices.add(p)
        if len(prices) >= 6:
            break
    if len(prices) >= 6:
        break
print("sample prices found:", sorted(prices))
# also check per-site fee attributes
attrs = {}
for cid, s in list(campsites.items())[:3]:
    a = s.get("attributes") or {}
    attrs[cid] = {k: v for k, v in list(a.items())[:5]}
print("site attributes sample:", json.dumps(attrs)[:400])
