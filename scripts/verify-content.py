#!/usr/bin/env python3
"""verify-content.py — compliance + integrity checks on the exported docs/ HTML.

Checks (fail = exit 1):
  1. Every data/*.json number field is finite (no NaN sneaking in via JSON import).
  2. Phase 2: at least one real rel="sponsored nofollow" affiliate link (booking CTAs
     are live). Falls back to a hard fail if none exist.
  3. On one park page: FTC disclosure div appears BEFORE the affiliate-slot div, no
     sponsored link appears before the slot, and the dead "Reserved affiliate slot"
     placeholder text is gone.
  4. No "we tested" / "we've tested" / "we reviewed" framing anywhere.
  5. JSON-LD blocks parse and the park page has Campground + FAQPage schemas.
  6. Updated badge (Updated YYYY-MM-DD) renders on a park page.
  7. Homepage links every park page (crawl surface) — count anchors >= park count.
"""
import glob
import json
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
DOCS = f"{ROOT}/docs"

failures = []
checks = []

def fail(msg):
    failures.append(msg)
    print(f"  FAIL {msg}")

def text_of(html):
    html = re.sub(r"<script.*?</script>", "", html, flags=re.S)
    html = re.sub(r"<style.*?</style>", "", html, flags=re.S)
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()

# 1. finite numbers in datasets
print("[verify] 1. dataset numeric fields finite")
for f in sorted(glob.glob(f"{ROOT}/src/data/*.json")):
    d = json.load(open(f))
    blob = json.dumps(d)
    for m in re.finditer(r'"(lat|lng|nightlyPriceMin|nightlyPriceMax|siteCount|rating|reviewCount|priceLevel)":\s*([^,}\s]+)', blob):
        key, raw = m.group(1), m.group(2)
        if raw == "null":
            continue
        try:
            v = float(raw)
        except ValueError:
            fail(f"{f}: {key} is not numeric: {raw}")
            continue
        if key in ("lat", "lng") and not (-180 <= v <= 180):
            fail(f"{f}: {key} out of range: {v}")
checks.append("finite numbers / range in src/data/*.json")

# 2. sponsored links (Phase 2: booking + partner CTAs are live)
print("[verify] 2. rel=sponsored nofollow link count (Phase 2: expect >= 1)")
sponsored = 0
for f in glob.glob(f"{DOCS}/**/*.html", recursive=True):
    html = open(f, encoding="utf-8").read()
    sponsored += len(re.findall(r'<a[^>]*rel="sponsored nofollow', html))
print(f"  sponsored-links: {sponsored}")
if sponsored < 1:
    fail(f"expected at least 1 live affiliate link in Phase 2, found {sponsored}")
checks.append("live affiliate links (>= 1)")

# 3. disclosure before slot on one park page
print("[verify] 3. disclosure-before-first-slot ordering (park page)")
park_pages = sorted(glob.glob(f"{DOCS}/parks/tx/*/index.html"))
if not park_pages:
    fail("no park pages found in docs/parks/tx/")
else:
    sample = park_pages[0]
    raw = open(sample, encoding="utf-8").read()
    t = text_of(raw)
    disc = raw.find('data-testid="affiliate-disclosure"')
    slot = raw.find('data-testid="affiliate-slot"')
    first_sponsored = raw.find('rel="sponsored nofollow')
    if disc == -1:
        fail(f"{sample}: no affiliate disclosure marker")
    if slot == -1:
        fail(f"{sample}: no affiliate slot marker")
    if disc != -1 and slot != -1 and disc > slot:
        fail(f"{sample}: disclosure appears AFTER the affiliate slot")
    if first_sponsored != -1 and slot != -1 and first_sponsored < slot:
        fail(f"{sample}: a sponsored link appears BEFORE the disclosure slot")
    if "Reserved affiliate slot" in t:
        fail(f"{sample}: dead 'Reserved affiliate slot' placeholder text still present")
    print(
        f"  {sample}: disclosure@{disc} slot@{slot} first_sponsored@{first_sponsored}"
    )
checks.append("FTC disclosure above first affiliate slot")

# 4. no "we tested" framing
print("[verify] 4. no 'we tested' / 'we reviewed' framing")
bad = []
for f in glob.glob(f"{DOCS}/**/*.html", recursive=True):
    t = text_of(open(f, encoding="utf-8").read()).lower()
    for pat in ["we tested", "we've tested", "we reviewed", "we've reviewed"]:
        if pat in t:
            bad.append((f, pat))
if bad:
    for f, pat in bad[:5]:
        fail(f"{f}: contains '{pat}'")
else:
    print("  clean")
checks.append("no tested/reviewed framing")

# 5. JSON-LD validity
print("[verify] 5. JSON-LD blocks parse; park page has Campground + FAQPage")
park_sample = park_pages[0] if park_pages else None
if park_sample:
    html = open(park_sample, encoding="utf-8").read()
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.S)
    parsed = []
    for b in blocks:
        try:
            parsed.append(json.loads(b))
        except Exception as e:
            fail(f"{park_sample}: invalid JSON-LD block: {e}")
    types = [p.get("@type") for p in parsed]
    print(f"  {park_sample}: JSON-LD types = {types}")
    if "Campground" not in types:
        fail("park page missing Campground JSON-LD")
    if "FAQPage" not in types:
        fail("park page missing FAQPage JSON-LD")
else:
    fail("no park page to check JSON-LD")
checks.append("JSON-LD valid + expected schemas")

# 6. updated badge
print("[verify] 6. updated badge on park page")
if park_sample:
    t = text_of(open(park_sample, encoding="utf-8").read())
    m = re.search(r"Updated \d{4}-\d{2}-\d{2}", t)
    if not m:
        fail("park page missing Updated YYYY-MM-DD badge")
    else:
        print("  badge found: " + m.group(0))
checks.append("updatedAt badge renders ISO date")

# 7. homepage links whole site (crawl surface)
print("[verify] 7. homepage links every park page")
home = f"{DOCS}/index.html"
data = json.load(open(f"{ROOT}/src/data/parks.tx.json"))
n_parks = len(data["parks"])
html = open(home, encoding="utf-8").read()
hrefs = set(re.findall(r'href="([^"]+)"', html))
park_links = [h for h in hrefs if h.startswith("/parks/tx/")]
print(f"  parks in dataset: {n_parks}; park links on homepage: {len(park_links)}")
if len(park_links) < n_parks:
    fail(f"homepage links {len(park_links)}/{n_parks} parks — crawl surface incomplete")
checks.append("homepage full-site index")

# 8. amenity pages exist for every amenityHubs slug, and each renders its parks
print("[verify] 8. amenity pages built and populated")
expected_amenity_slugs = [
    "boat-ramp", "showers", "water-hookup", "dump-station", "playground",
    "flush-toilets", "50-amp", "30-amp", "20-amp", "laundry",
    "full-hookup", "50-amp-full-hookup",
]
# combined-page expected sets (mirrors src/lib/parks.ts match functions)
def has_all(p, terms):
    am = set(p.get("amenities") or [])
    return all(t in am for t in terms)
expected_counts = {}
for slug, terms in [
    ("boat-ramp", ["boat ramp"]),
    ("showers", ["showers"]),
    ("water-hookup", ["water hookup"]),
    ("dump-station", ["dump station"]),
    ("playground", ["playground"]),
    ("flush-toilets", ["flush toilets"]),
    ("50-amp", ["50 amp"]),
    ("30-amp", ["30 amp"]),
    ("20-amp", ["20 amp"]),
    ("laundry", ["laundry"]),
    ("full-hookup", ["water hookup", "dump station"]),
    ("50-amp-full-hookup", ["50 amp", "water hookup", "dump station"]),
]:
    expected_counts[slug] = sum(1 for p in data["parks"] if has_all(p, terms))
for slug, want in expected_counts.items():
    page = f"{DOCS}/rv-parks/{slug}/index.html"
    if not os.path.exists(page):
        fail(f"amenity page missing: {page}")
        continue
    t = text_of(open(page, encoding="utf-8").read())
    if want > 0 and str(want) not in t:
        fail(f"{page}: expected count {want} not found on page")
    # every matching park must be linked from the page (hrefs live in raw HTML)
    raw_html = open(page, encoding="utf-8").read()
    hrefs = set(re.findall(r'href="([^"]+)"', raw_html))
    for p in data["parks"]:
        if has_all(p, [x for x in [
            "boat ramp" if slug == "boat-ramp" else None,
            "showers" if slug == "showers" else None,
            "water hookup" if slug in ("water-hookup", "full-hookup", "50-amp-full-hookup") else None,
            "dump station" if slug in ("dump-station", "full-hookup", "50-amp-full-hookup") else None,
            "playground" if slug == "playground" else None,
            "flush toilets" if slug == "flush-toilets" else None,
            "50 amp" if slug in ("50-amp", "50-amp-full-hookup") else None,
            "30 amp" if slug == "30-amp" else None,
            "20 amp" if slug == "20-amp" else None,
            "laundry" if slug == "laundry" else None,
        ] if x]):
            if f"/parks/tx/{p['slug']}/" not in hrefs:
                fail(f"{page}: park {p['slug']} ({p['name']}) not linked on its amenity page")
checks.append("amenity pages built + park lists render")

# 9. amenities index page exists and links every amenity page
print("[verify] 9. /rv-parks/amenities/ index links all amenity pages")
idx = f"{DOCS}/rv-parks/amenities/index.html"
if not os.path.exists(idx):
    fail("amenities index page missing")
else:
    t = open(idx, encoding="utf-8").read()
    for slug in expected_amenity_slugs:
        if f"/rv-parks/{slug}/" not in t:
            fail(f"amenities index missing link to /rv-parks/{slug}/")
checks.append("amenities index links all amenity pages")

# 10. real weather + AQI values from the API render in built HTML (gate 6)
print("[verify] 10. real weather temp + real AQI value in built HTML")
parks_list = data["parks"]
wpark = next((p for p in parks_list if (p.get("weatherCurrent") or {}).get("tempF") is not None), None)
apark = next((p for p in parks_list if (p.get("aqi") or {}).get("aqi") is not None), None)
if wpark is None:
    fail("no park has weatherCurrent.tempF — cannot verify live weather rendered")
else:
    wt = text_of(open(f"{DOCS}/parks/tx/{wpark['slug']}/index.html", encoding="utf-8").read())
    want_temp = f"{round(wpark['weatherCurrent']['tempF'])}°F"
    print(f"  weather sample: {wpark['name']} -> {want_temp}")
    if want_temp not in wt:
        fail(f"{wpark['slug']}: weather temp {want_temp} not found in built HTML")
    if not wpark["weatherCurrent"].get("conditions"):
        fail(f"{wpark['slug']}: weather conditions missing (must render real API text)")
    else:
        print(f"  weather conditions: {wpark['weatherCurrent']['conditions']}")
if apark is None:
    fail("no park has aqi.aqi — cannot verify live AQI rendered")
else:
    at = text_of(open(f"{DOCS}/parks/tx/{apark['slug']}/index.html", encoding="utf-8").read())
    want_aqi = str(apark["aqi"]["aqi"])
    print(f"  aqi sample: {apark['name']} -> AQI {want_aqi} ({apark['aqi'].get('category')})")
    if want_aqi not in at:
        fail(f"{apark['slug']}: AQI value {want_aqi} not found in built HTML")
    if not apark["aqi"].get("category"):
        fail(f"{apark['slug']}: AQI category missing")
checks.append("live weather + AQI values render in built HTML")

print()
for c in checks:
    print(f"  [check] {c}")
if failures:
    print(f"\n[verify] FAILED: {len(failures)} failure(s)")
    sys.exit(1)
print("\n[verify] PASS: all content verification checks passed.")
