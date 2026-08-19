#!/usr/bin/env python3
"""fetch-google-ratings.py — enrich TX parks with Google Places ratings.

Data source: Google Places API Text Search
  https://maps.googleapis.com/maps/api/place/textsearch/json?query=<name+city+state>&key=KEY

Requires GOOGLE_API_KEY (from .env or environment). If the key is missing/empty
the script SKIPS cleanly (exit 0) — no API calls, no fabricated data. The key
value is filled in .env by the Director; this repo never commits it.

For each park with an address (street or city), query "<name> <city> TX", then:
  - keep results whose NAME overlaps the query on >= 1 significant token
    (stopwords like park/campground/recreation/area/lake do NOT count)
  - when the park has coordinates, require the result to be within 40 km
    (kills wrong-city false positives, e.g. Bear Creek Fort Worth vs the
    Bear Creek State Park in Concan)
  - take the best match = highest user_ratings_total among the survivors
  - store {rating, reviewCount, priceLevel, placeId, googleUrl} or null

Results are cached to scripts/raw/google-ratings.json (facilityId -> record,
null = queried but no confident match) so re-runs don't re-bill the API.
Rate limit: 1 s between calls.

Anti-fabrication: never guess. No confident match -> null fields.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'scripts' / 'raw'
DATA_DIR = ROOT / 'src' / 'data'
CACHE = RAW_DIR / 'google-ratings.json'
DATASET = DATA_DIR / 'parks.tx.json'
UA = 'rv-parks-directory/0.3 (Google Places ratings enrichment; contact kyle@fonger.ai)'
DELAY_S = 1.0
MAX_DIST_KM = 40.0
TRIES = 3

# --- API key (never printed) -------------------------------------------------
API_KEY = os.environ.get('GOOGLE_API_KEY', '').strip()
if not API_KEY:
    env_file = ROOT / '.env'
    if env_file.exists():
        m = re.search(r'^GOOGLE_API_KEY=(.*)$', env_file.read_text(), re.M)
        if m:
            API_KEY = m.group(1).strip()
if not API_KEY:
    print('[google] GOOGLE_API_KEY not set (add GOOGLE_API_KEY= to .env) — skipping ratings enrichment. exit 0')
    sys.exit(0)

# --- text matching helpers ---------------------------------------------------
# Generic words that never prove identity. Kept short on purpose: names like
# "MOTT" or "PLOWMAN CREEK" carry most of their signal in 1-2 tokens, so we only
# strip words that would match anything.
STOP = set('''
park campground camping camp recreation area state national forest lake rv resort
texas tx county usace us co cg rec trailway natural historic site group unit
east west north south big little old new upper lower and the of
'''.split())


def tokens(name):
    if not name:
        return []
    t = name.lower()
    t = re.sub(r'&', ' and ', t)
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    return [w for w in t.split() if len(w) >= 3 and w not in STOP]


def shared_tokens(a, b):
    sa, sb = set(a), set(b)
    return sa & sb


def haversine_km(lat1, lng1, lat2, lng2):
    import math
    R = 6371.0
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (math.sin(dLat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


# --- HTTP --------------------------------------------------------------------
def get_json(url, data=None, headers=None):
    for attempt in range(1, TRIES + 1):
        hdr = {'User-Agent': UA, 'Accept': 'application/json'}
        if headers:
            hdr.update(headers)
        req = urllib.request.Request(url, data=data, headers=hdr)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = 4 * attempt
                print(f'  [retry] HTTP {e.code} — wait {wait}s (attempt {attempt}/{TRIES})')
                time.sleep(wait)
                continue
            print(f'  [warn] HTTP {e.code} on {url[:120]}')
            return None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            wait = 3 * attempt
            print(f'  [retry] {e} — wait {wait}s (attempt {attempt}/{TRIES})')
            time.sleep(wait)
            continue
    print(f'  [warn] failed after {TRIES} tries: {url[:120]}')
    return None


def textsearch(query):
    # Places API (New) — v1 searchText. The legacy textsearch/json endpoint is
    # disabled on this project (REQUEST_DENIED "legacy API not enabled").
    url = 'https://places.googleapis.com/v1/places:searchText'
    payload = json.dumps({'textQuery': query}).encode()
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.id,places.location',
    }
    data = get_json(url, data=payload, headers=headers)
    if data is None:
        return None, None
    if 'error' in data:
        err = data['error']
        status = err.get('status') or 'ERROR'
        print(f'  [warn] Places status={status} ({err.get("message", "")[:120]})')
        return None, status
    results = []
    for pl in data.get('places', []):
        dn = (pl.get('displayName') or {}).get('text') or ''
        loc = pl.get('location') or {}
        results.append({
            'place_id': pl.get('id'),
            'name': dn,
            'rating': pl.get('rating'),
            'user_ratings_total': pl.get('userRatingCount'),
            'price_level': pl.get('priceLevel'),  # string enum e.g. PRICE_LEVEL_MODERATE
            'geometry': {'location': {'lat': loc.get('latitude'), 'lng': loc.get('longitude')}} if loc else None,
        })
    return results, 'OK'


# --- main --------------------------------------------------------------------
def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dataset = json.loads(DATASET.read_text())
    parks = dataset['parks']

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text())

    queried = 0
    matched = 0
    for p in parks:
        fid = p['facilityId']
        # only parks with an address we can build a query from
        if not (p.get('street') or p.get('city')):
            continue
        if fid in cache:
            continue

        query = f"{p['name']} {p['city'] or ''} {p['state']}".strip()
        results, status = textsearch(query)
        if results is None:
            # transient failure: leave uncached so the next run retries
            print(f'  [skip] {fid} {p["name"]}: API failure ({status})')
            continue
        time.sleep(DELAY_S)
        queried += 1

        query_toks = tokens(p['name'])
        best = None
        for r in results:
            rname = r.get('name') or ''
            shared = shared_tokens(query_toks, tokens(rname))
            if not shared:
                continue
            # geo sanity when we have park coordinates
            loc = ((r.get('geometry') or {}).get('location') or {})
            if p.get('lat') is not None and p.get('lng') is not None and loc:
                if haversine_km(p['lat'], p['lng'], loc.get('lat'), loc.get('lng')) > MAX_DIST_KM:
                    continue
            n = r.get('user_ratings_total') or 0
            if best is None or n > (best.get('user_ratings_total') or 0):
                best = r

        if best is None:
            cache[fid] = None
            print(f'  [no-match] {fid} {p["name"]} — no confident Google result')
            continue

        place_id = best.get('place_id')
        # New Places API returns priceLevel as string enum; map to legacy 0-4
        # numeric (0=free,1=inexpensive,2=moderate,3=expensive,4=very expensive)
        _pl_map = {
            'PRICE_LEVEL_FREE': 0, 'PRICE_LEVEL_INEXPENSIVE': 1,
            'PRICE_LEVEL_MODERATE': 2, 'PRICE_LEVEL_EXPENSIVE': 3,
            'PRICE_LEVEL_VERY_EXPENSIVE': 4,
        }
        pl_raw = best.get('price_level')
        price_level = _pl_map.get(pl_raw) if isinstance(pl_raw, str) else pl_raw
        record = {
            'rating': best.get('rating'),
            'reviewCount': best.get('user_ratings_total') or 0,
            'priceLevel': price_level,  # 0-4, absent for many listings
            'placeId': place_id,
            'googleUrl': f'https://www.google.com/maps/place/?q=place_id:{place_id}' if place_id else None,
            'matchedName': best.get('name'),
            'queriedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
        cache[fid] = record
        matched += 1
        print(f'  [match] {fid} {p["name"]} -> {record["matchedName"]} '
              f'({record["rating"]}★ x{record["reviewCount"]})')

    CACHE.write_text(json.dumps(cache, indent=2))

    # apply to dataset
    applied = 0
    for p in parks:
        fid = p['facilityId']
        rec = cache.get(fid)
        if rec is None:
            p['rating'] = None
            p['reviewCount'] = None
            p['priceLevel'] = None
            p['placeId'] = None
            p['googleUrl'] = None
        else:
            p['rating'] = rec['rating']
            p['reviewCount'] = rec['reviewCount']
            p['priceLevel'] = rec['priceLevel']
            p['placeId'] = rec['placeId']
            p['googleUrl'] = rec['googleUrl']
            applied += 1

    counts = dataset['meta'].setdefault('counts', {})
    counts['parksWithRating'] = sum(1 for p in parks if p.get('rating') is not None)
    counts['parksWithReviewCount'] = sum(1 for p in parks if (p.get('reviewCount') or 0) > 0)
    counts['parksWithPriceLevel'] = sum(1 for p in parks if p.get('priceLevel') is not None)
    counts['parksWithGoogleReviews'] = applied

    DATASET.write_text(json.dumps(dataset, indent=2))
    print(f'\n[google] DONE: {queried} queried this run, {applied} parks with Google ratings '
          f'({counts["parksWithRating"]} total in dataset). Cache: {CACHE}')


if __name__ == '__main__':
    main()
