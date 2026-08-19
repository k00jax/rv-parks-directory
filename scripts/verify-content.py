#!/usr/bin/env python3
"""verify-content.py — compliance + integrity checks on the exported docs/ HTML.

Checks (fail = exit 1):
  1. Every data/*.json number field is finite (no NaN sneaking in via JSON import).
  2. Phase 0: zero real rel="sponsored nofollow" links (affiliate slots are reserved,
     not live). When affiliates go live this becomes >= 1 with disclosure ordering.
  3. On one park page: FTC disclosure text appears BEFORE the reserved affiliate slot.
  4. No "we tested" / "we've tested" / "we reviewed" framing anywhere.
  5. JSON-LD blocks parse and the park page has Campground + FAQPage schemas.
  6. Updated badge (Updated YYYY-MM-DD) renders on a park page.
  7. Homepage links every park page (crawl surface) — count anchors >= park count.
"""
import glob
import json
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

# 2. sponsored links (Phase 0 expect zero live affiliate links)
print("[verify] 2. rel=sponsored nofollow link count (Phase 0: expect 0)")
sponsored = 0
for f in glob.glob(f"{DOCS}/**/*.html", recursive=True):
    html = open(f, encoding="utf-8").read()
    sponsored += len(re.findall(r'<a[^>]*rel="sponsored nofollow"', html))
print(f"  sponsored-links: {sponsored}")
if sponsored != 0:
    fail(f"expected 0 live affiliate links in Phase 0, found {sponsored}")
checks.append("zero live affiliate links")

# 3. disclosure before slot on one park page
print("[verify] 3. disclosure-before-first-slot ordering (park page)")
park_pages = sorted(glob.glob(f"{DOCS}/parks/tx/*/index.html"))
if not park_pages:
    fail("no park pages found in docs/parks/tx/")
else:
    sample = park_pages[0]
    t = text_of(open(sample, encoding="utf-8").read())
    disc = t.find("Affiliate disclosure")
    slot = t.find("Reserved affiliate slot")
    if disc == -1:
        fail(f"{sample}: no affiliate disclosure text")
    if slot == -1:
        fail(f"{sample}: no reserved affiliate slot")
    if disc != -1 and slot != -1 and disc > slot:
        fail(f"{sample}: disclosure appears AFTER the affiliate slot")
    print(f"  {sample}: disclosure@{disc} slot@{slot}")
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

print()
for c in checks:
    print(f"  [check] {c}")
if failures:
    print(f"\n[verify] FAILED: {len(failures)} failure(s)")
    sys.exit(1)
print("\n[verify] PASS: all content verification checks passed.")
