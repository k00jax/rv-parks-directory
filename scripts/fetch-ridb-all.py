#!/usr/bin/env python3
"""fetch-ridb-all.py — pull ALL 50 US states' RV parks / campgrounds from RIDB.

Generalization of the proven TX-only fetch-ridb.py pipeline (same Phase A/B
filters, same anti-fabrication parsers) to the full United States:

  - Loops over every state abbreviation (AL..WY) + DC.
  - For each state: paginate GET /facilities?state=XX, Phase-A filter, enrich
    details/addresses, Phase-B verify (address state == XX, or Nominatim
    reverse-geocode, or state bounding box fallback).
  - Writes per-state files src/data/parks.<ab>.json + cities.<ab>.json plus a
    combined index src/data/parks.us.json (parks merged with state field) so
    the app can serve the whole country.
  - Same anti-fabrication rules: prices only from per-night/per-day fee text,
    uncertain values null, ratings never invented.

Usage:
  export RIDB_API_KEY=...
  python scripts/fetch-ridb-all.py            # all 50 states + DC
  python scripts/fetch-ridb-all.py --states CO,UT,WY   # subset (test first)
  python scripts/fetch-ridb-all.py --limit-states 3    # first N states (smoke)
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'scripts' / 'raw'
DATA_DIR = ROOT / 'src' / 'data'
BASE = 'https://ridb.recreation.gov/api/v1'
UA = 'rv-parks-directory/0.3 (RIDB API 50-state data refresh; contact kyle@fonger.ai)'
DELAY_MS = 0.45
FETCHED_AT = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
LAST_VERIFIED = time.strftime('%Y-%m-%d', time.gmtime())

# All 50 states + DC (the 50-state loop)
STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
    'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

# --- API key (never printed) -------------------------------------------------
API_KEY = os.environ.get('RIDB_API_KEY', '').strip()
if not API_KEY:
    env_file = ROOT / '.env'
    if env_file.exists():
        m = re.search(r'^RIDB_API_KEY=(.+)$', env_file.read_text(), re.M)
        if m:
            API_KEY = m.group(1).strip()
if not API_KEY:
    print('FATAL: RIDB_API_KEY not set (export it or add to .env)')
    sys.exit(1)


# --- HTTP --------------------------------------------------------------------
def get_json(url, params, tries=5):
    qs = urllib.parse.urlencode({**params, 'apikey': API_KEY})
    full = f'{url}?{qs}'
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(full, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = 5 * attempt
                print(f'  [retry] HTTP {e.code} on {url} — wait {wait}s (attempt {attempt}/{tries})')
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            wait = 3 * attempt
            print(f'  [retry] {e} on {url} — wait {wait}s (attempt {attempt}/{tries})')
            time.sleep(wait)
            continue
    raise RuntimeError(f'failed after {tries} tries: {url}')


# --- text helpers ------------------------------------------------------------
class _TextExtract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, d):
        self.parts.append(d)


def strip_html(s):
    if not s:
        return ''
    p = _TextExtract()
    p.feed(s)
    return re.sub(r'\s+', ' ', ' '.join(p.parts)).strip()


def slugify(name):
    s = (name or '').lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')[:90]


def norm_name(name):
    if not name:
        return ''
    n = name.strip()
    n = re.sub(r'\s*[\d\-() ]{7,}\s*$', '', n)
    n = re.sub(r'\s*\([^)]*\)\s*$', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


# --- Phase A filter (same as fetch-ridb.py) -----------------------------------
KEEP_TYPES = {
    'Campground', 'RV Park', 'Trailer Park', 'Group Campground',
    'Campground - Group', 'Horse Campground', 'Campground - Horse', 'Horse Camp',
}
CAMP_SIGNAL = re.compile(
    r'\b(campground|camping|camp\b|campers?\b|campsite|camp site|rv park|rv resort|'
    r'rv camping|trailer park|horse camp|group camp|dispersed camp|rec area|recreation area)\b',
    re.I,
)
DAY_USE_NAME = re.compile(
    r'day use|picnic|pavilion|shelter|trailhead|overlook|boat ramp|boat launch|'
    r'marina|fishing|boating site|museum|library|cemetery|hotel|hatchery|'
    r'visitor center|ranger station|interpretive|tram|parking|monument|tower\b|dam\b',
    re.I,
)
DESC_CAMP = re.compile(
    r'camping (?:is|are|opportunities?)? ?(?:available|offered)|campground|campsites?|'
    r'rv (?:park|sites?|hookups?|camping)|trailer (?:park|sites?)|dispersed camping|'
    r'offers? camping|camp sites?',
    re.I,
)


def is_campground_candidate(rec):
    name = norm_name(rec.get('FacilityName') or '')
    ftype = (rec.get('FacilityTypeDescription') or '').strip()
    keywords = rec.get('Keywords') or ''
    desc = strip_html(rec.get('FacilityDescription') or '')
    blob = f'{name} {keywords} {desc}'

    name_day_use = bool(DAY_USE_NAME.search(name))
    name_camp = bool(CAMP_SIGNAL.search(name))
    blob_camp = bool(DESC_CAMP.search(blob))

    if ftype in KEEP_TYPES:
        if name_day_use and not name_camp:
            return False, 'type-campground-but-day-use-name'
        return True, f'type:{ftype}'
    if name_camp or blob_camp:
        if name_day_use and not name_camp:
            return False, 'day-use-name-no-name-camp-signal'
        return True, f'signal:{name_camp and "name" or "desc"}'
    return False, 'no-camp-signal'


# --- Phase B: generic state verification --------------------------------------
STATE_NAMES = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
    'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
    'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
}

# State bounding boxes (lat_min, lat_max, lng_min, lng_max) — coarse but
# sufficient as a last-resort fallback for address-less facilities.
STATE_BBOX = {
    'AL': (30.2, 35.0, -88.5, -84.9), 'AK': (51.2, 71.4, -179.1, -129.9),
    'AZ': (31.3, 37.0, -114.8, -109.0), 'AR': (33.0, 36.5, -94.6, -89.6),
    'CA': (32.5, 42.0, -124.4, -114.1), 'CO': (37.0, 41.0, -109.0, -102.0),
    'CT': (41.0, 42.1, -73.7, -71.8), 'DE': (38.4, 39.8, -75.8, -75.0),
    'DC': (38.8, 39.0, -77.1, -76.9), 'FL': (24.5, 31.0, -87.6, -80.0),
    'GA': (30.4, 35.0, -85.6, -80.8), 'HI': (18.9, 22.2, -160.2, -154.8),
    'ID': (42.0, 49.0, -117.2, -111.0), 'IL': (36.9, 42.5, -91.5, -87.4),
    'IN': (37.8, 41.8, -88.1, -84.8), 'IA': (40.4, 43.5, -96.6, -90.1),
    'KS': (36.9, 40.0, -102.0, -94.6), 'KY': (36.5, 39.1, -89.5, -81.9),
    'LA': (28.9, 33.0, -94.0, -88.8), 'ME': (43.1, 47.5, -71.1, -66.9),
    'MD': (37.9, 39.7, -79.5, -75.0), 'MA': (41.2, 42.9, -73.5, -69.9),
    'MI': (41.7, 48.3, -90.4, -82.4), 'MN': (43.5, 49.4, -97.2, -89.5),
    'MS': (30.2, 35.0, -91.7, -88.1), 'MO': (36.0, 40.6, -95.8, -89.1),
    'MT': (44.4, 49.0, -116.0, -104.0), 'NE': (39.9, 43.0, -104.0, -95.3),
    'NV': (35.0, 42.0, -120.0, -114.0), 'NH': (42.7, 45.3, -72.6, -70.6),
    'NJ': (38.9, 41.4, -75.6, -73.9), 'NM': (31.3, 37.0, -109.0, -103.0),
    'NY': (40.5, 45.0, -79.8, -71.8), 'NC': (33.8, 36.6, -84.3, -75.5),
    'ND': (45.9, 49.0, -104.0, -96.6), 'OH': (38.4, 42.0, -84.8, -80.5),
    'OK': (33.6, 37.0, -103.0, -94.4), 'OR': (42.0, 46.3, -124.6, -116.5),
    'PA': (39.7, 42.3, -80.5, -74.7), 'RI': (41.1, 42.0, -71.9, -71.1),
    'SC': (32.0, 35.2, -83.4, -78.5), 'SD': (42.5, 45.9, -104.0, -96.4),
    'TN': (34.9, 36.7, -90.3, -81.6), 'TX': (25.84, 36.50, -106.65, -93.51),
    'UT': (36.9, 42.0, -114.0, -109.0), 'VT': (42.7, 45.0, -73.4, -71.5),
    'VA': (36.5, 39.5, -83.7, -75.2), 'WA': (45.5, 49.0, -124.8, -116.9),
    'WV': (37.2, 40.6, -82.6, -77.7), 'WI': (42.5, 47.1, -92.9, -86.7),
    'WY': (40.9, 45.0, -111.0, -104.0),
}

NOMINATIM_UA = 'rv-parks-directory/0.3 (data verification; contact kyle@fonger.ai)'


def has_real_address(facility_addresses):
    for a in facility_addresses or []:
        if (a.get('FacilityStreetAddress1') or '').strip() or (a.get('City') or '').strip():
            return True
    return False


def addr_state(facility_addresses):
    for a in facility_addresses or []:
        if not ((a.get('FacilityStreetAddress1') or '').strip() or (a.get('City') or '').strip()):
            continue
        st = (a.get('AddressStateCode') or '').strip().upper()
        if st:
            return st
    return None


def in_state_bbox(state, lat, lng):
    if lat is None or lng is None:
        return False
    b = STATE_BBOX.get(state)
    if not b:
        return False
    return (b[0] <= lat <= b[1] and b[2] <= lng <= b[3])


def nominatim_state(lat, lng):
    url = ('https://nominatim.openstreetmap.org/reverse?'
           + urllib.parse.urlencode({'lat': lat, 'lon': lng, 'format': 'jsonv2', 'zoom': 10}))
    req = urllib.request.Request(url, headers={'User-Agent': NOMINATIM_UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f'  [warn] nominatim failed lat={lat} lng={lng}: {e}')
        return None
    st = ((data.get('address') or {}).get('state') or '').strip()
    return STATE_NAMES.get(st.lower())


def verify_state(state, rec, addresses, use_nominatim=True):
    """Returns (keep, reason, state_evidence) for an arbitrary state."""
    lat = rec.get('FacilityLatitude')
    lng = rec.get('FacilityLongitude')
    fid = str(rec.get('FacilityID'))

    if has_real_address(addresses):
        st = addr_state(addresses)
        if st == state:
            return True, 'address', 'address'
        return False, f'address-not-{state} ({st})', st or 'unknown'

    if use_nominatim and lat is not None and lng is not None:
        st = nominatim_state(lat, lng)
        if st:
            if st == state:
                return True, 'nominatim', 'nominatim'
            return False, f'nominatim-not-{state} ({st})', st
        print(f'  [warn] {fid} {rec.get("FacilityName")}: no nominatim verdict, bbox fallback')

    if in_state_bbox(state, lat, lng):
        return True, 'coords-bbox', 'coords-bbox'
    return False, f'not-{state} (lat={lat}, lng={lng})', 'unknown'


# --- field parsers (identical to fetch-ridb.py — anti-fabrication) -------------
FEE_RANGE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$(\d+(?:\.\d{2})?)\s*(?:per\s*)?(night|day)\b', re.I)
FEE_SLASH_RANGE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$(\d+(?:\.\d{2})?)\s*/\s*(night|day)\b', re.I)
FEE_NIGHTLY_RE = re.compile(
    r'nightly (?:rate|fee|cost)[^$]*\$(\d+(?:\.\d{2})?)', re.I)
FEE_SINGLE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:per\s*|/)?(?:night|day)\b', re.I)


def parse_price(fee_html):
    if not fee_html:
        return None, None
    text = strip_html(fee_html)
    if not text:
        return None, None

    def ok(v):
        try:
            f = float(v)
            return f if f > 0 else None
        except ValueError:
            return None

    amounts = []
    for m in FEE_RANGE_RE.finditer(text):
        a, b = ok(m.group(1)), ok(m.group(2))
        if a is not None and b is not None:
            amounts.extend([a, b])
    for m in FEE_SLASH_RANGE_RE.finditer(text):
        a, b = ok(m.group(1)), ok(m.group(2))
        if a is not None and b is not None:
            amounts.extend([a, b])
    for m in FEE_NIGHTLY_RE.finditer(text):
        v = ok(m.group(1))
        if v is not None:
            amounts.append(v)
    for m in FEE_SINGLE_RE.finditer(text):
        ctx = text[max(0, m.start() - 80):m.end() + 40].lower()
        if re.search(r'per\s*(person|adult|child|vehicle|camper)', ctx):
            continue
        v = ok(m.group(1))
        if v is not None:
            amounts.append(v)
    if not amounts:
        return None, None
    lo, hi = min(amounts), max(amounts)
    if hi - lo < 0.01:
        return lo, lo
    return lo, hi


HOOKUP_RE = re.compile(r'\b(full hookups?|water and electric|water \& electric|'
                       r'50[ -]?amp|30[ -]?amp|20[ -]?amp|electric(?:al)? hookups?|'
                       r'water hookups?|sewer hookups?)\b', re.I)


def parse_hookups(text):
    t = text.lower()
    if re.search(r'full hookups?', t):
        return 'full'
    if re.search(r'water and electric|water \& electric|partial hookups?', t):
        return 'partial'
    if re.search(r'no hookups?|dry camping|boondocking', t):
        return 'none'
    if HOOKUP_RE.search(t):
        return 'partial'
    return None


AMP_RE = re.compile(r'\b(\d{2})\s*amp\b', re.I)


def parse_amps(text):
    return sorted({int(m.group(1)) for m in AMP_RE.finditer(text)})


AMENITY_RE = re.compile(
    r'\b(water|electric|sewer|showers?|restrooms?|laundry|dump station|'
    r'playground|pool|fire rings?|picnic tables?|pet friendly|pets allowed|'
    r'wifi|wi-?fi|cell service|tent sites?|pull-?through|big rig|'
    r'handicap accessible|rv dump)\b', re.I)


def parse_amenities(text):
    seen = set()
    for m in AMENITY_RE.finditer(text):
        label = m.group(1).lower()
        label = label.replace('wi-?fi', 'wifi')
        seen.add(label)
    return sorted(seen)


SITE_COUNT_RE = re.compile(r'\b(\d{2,4})\s*(?:campsites?|sites?|camp sites?)\b', re.I)


def parse_site_count(text):
    m = SITE_COUNT_RE.search(text)
    if m:
        try:
            n = int(m.group(1))
            if 1 <= n <= 5000:
                return n
        except ValueError:
            pass
    return None


def primary_image(fac):
    media = fac.get('FACILITYMEDIA') or []
    for md in media:
        if (md.get('MediaType') or '').lower() == 'image':
            return md.get('URL') or None
    return None


# --- per-state pipeline -------------------------------------------------------
def fetch_state(state, use_nominatim=True):
    print(f'\n===== {state} =====')
    all_records = []
    offset = 0
    total = None
    while True:
        data = get_json(f'{BASE}/facilities', {'state': state, 'limit': 100, 'offset': offset})
        meta = data.get('METADATA', {})
        results = data.get('RECDATA', [])
        total = meta.get('RESULTS', {}).get('TOTAL_COUNT', total)
        all_records.extend(results)
        write = RAW_DIR / f'ridb-facilities-{state.lower()}-page-{offset}.json'
        write.write_text(json.dumps(data, indent=2))
        print(f'  page offset={offset}: +{len(results)} (total={total})')
        offset += len(results)
        if not results or offset >= total:
            break
        time.sleep(DELAY_MS)

    candidates = []
    dropped_a = Counter()
    for r in all_records:
        keep, reason = is_campground_candidate(r)
        if keep:
            candidates.append(r)
        else:
            dropped_a[reason] += 1
    print(f'  list records: {len(all_records)}; phase-A candidates: {len(candidates)}')

    kept = []
    dropped_b = Counter()
    detail_failures = []
    state_evidence = Counter()
    for i, rec in enumerate(candidates, 1):
        fid = str(rec.get('FacilityID'))
        detail = None
        addresses = []
        try:
            detail = get_json(f'{BASE}/facilities/{fid}', {})
            (RAW_DIR / f'ridb-facility-{fid}.json').write_text(json.dumps(detail, indent=2))
        except Exception as e:
            detail_failures.append({'id': fid, 'error': str(e)})
        try:
            addr_data = get_json(f'{BASE}/facilities/{fid}/facilityaddresses', {})
            addresses = (addr_data or {}).get('RECDATA', [])
            (RAW_DIR / f'ridb-facility-{fid}-addresses.json').write_text(json.dumps(addr_data, indent=2))
        except Exception as e:
            detail_failures.append({'id': fid, 'error': f'addresses: {e}'})

        keep_st, st_reason, st_evidence = verify_state(state, rec, addresses, use_nominatim)
        if keep_st:
            kept.append((rec, detail, addresses, st_reason))
        else:
            dropped_b[st_reason] += 1
        state_evidence[st_evidence] += 1
        if i % 25 == 0:
            print(f'  enriched {i}/{len(candidates)}')
        time.sleep(DELAY_MS)

    parks = []
    for rec, detail, addresses, st_reason in kept:
        fid = str(rec.get('FacilityID'))
        fac = detail if detail else None
        ftype = ((fac or rec).get('FacilityTypeDescription') or '')
        name = norm_name((fac or rec).get('FacilityName') or '')
        if not name:
            name = norm_name(rec.get('FacilityName') or '')
        desc = strip_html((fac or rec).get('FacilityDescription') or '')
        keywords = (fac or rec).get('Keywords') or ''
        parse_text = f'{desc} {keywords}'
        fee_html = (fac or rec).get('FacilityUseFeeDescription') or ''

        def_addr = None
        for a in addresses:
            if (a.get('FacilityAddressType') or '').lower() == 'physical':
                def_addr = a
                break
        if def_addr is None:
            for a in addresses:
                if (a.get('FacilityAddressType') or '').lower() == 'default':
                    def_addr = a
                    break
        if def_addr is None and addresses:
            def_addr = addresses[0]

        price_min, price_max = parse_price(fee_html)
        hookups = parse_hookups(parse_text)
        amps = parse_amps(parse_text)
        amenities = parse_amenities(parse_text)
        for a in amps:
            label = f'{a} amp'
            if label not in amenities:
                amenities.append(label)
        amenities.sort()

        res_url = (fac or rec).get('FacilityReservationURL') or ''
        reservable = bool((fac or rec).get('Reservable'))
        org_arr = (fac or {}).get('ORGANIZATION') or []
        org_name = org_arr[0].get('OrgName') if org_arr else None

        parks.append({
            'facilityId': fid,
            'name': name,
            'slug': slugify(name),
            'street': (def_addr or {}).get('FacilityStreetAddress1') or None,
            'city': (def_addr or {}).get('City') or None,
            'state': state,
            'zip': (def_addr or {}).get('PostalCode') or None,
            'lat': rec.get('FacilityLatitude'),
            'lng': rec.get('FacilityLongitude'),
            'phone': (fac or rec).get('FacilityPhone') or None,
            'website': res_url or (f'https://www.recreation.gov/camping/campgrounds/{fid}' if reservable else None),
            'nightlyPriceMin': price_min,
            'nightlyPriceMax': price_max,
            'dataSource': 'ridb' if (price_min is not None or price_max is not None) else None,
            'hookups': hookups,
            'amenities': amenities,
            'siteCount': parse_site_count(parse_text),
            'rating': None,
            'reviewCount': None,
            'priceLevel': None,
            'placeId': None,
            'googleUrl': None,
            'petPolicy': None,
            'weatherCurrent': None,   # filled by scripts/fetch-weather-aqi.py enrichment
            'aqi': None,              # filled by scripts/fetch-weather-aqi.py enrichment
            'lastVerified': LAST_VERIFIED,
            'source': {
                'orgId': rec.get('OrgFacilityID') or None,
                'orgName': org_name,
                'parentId': rec.get('ParentOrgID') or None,
                'parentName': None,
                'reservable': reservable,
                'facilityType': ftype or None,
                'equipment': [],
                'maxVehicleLength': None,
                'imageUrl': primary_image(fac or rec),
                'timeZone': None,
                'description': desc[:600],
            },
        })

    # unique slugs
    seen = {}
    for p in parks:
        slug = p['slug'] or f'facility-{p["facilityId"]}'
        if slug in seen:
            n = 2
            while f'{slug}-{n}' in seen:
                n += 1
            slug = f'{slug}-{n}'
        seen[slug] = True
        p['slug'] = slug

    # cities index
    cities = {}
    for p in parks:
        city = (p['city'] or '').strip()
        if not city:
            continue
        key = city.lower()
        hub = cities.setdefault(key, {'name': city, 'slug': slugify(city), 'parkIds': []})
        if p['facilityId'] not in hub['parkIds']:
            hub['parkIds'].append(p['facilityId'])

    type_breakdown = Counter(p['source']['facilityType'] or '(none)' for p in parks)
    counts = {
        'totalRidbRecords': len(all_records),
        'phaseACandidates': len(candidates),
        'parksKept': len(parks),
        'droppedPhaseA': dict(dropped_a),
        'droppedPhaseB': dict(dropped_b),
        'stateEvidence': dict(state_evidence),
        'typeBreakdown': dict(type_breakdown),
        'parksWithAddress': sum(1 for p in parks if p['street']),
        'parksWithCity': sum(1 for p in parks if p['city']),
        'parksWithZip': sum(1 for p in parks if p['zip']),
        'parksWithPhone': sum(1 for p in parks if p['phone']),
        'parksWithLatLng': sum(1 for p in parks if p['lat'] is not None and p['lng'] is not None),
        'parksWithPrice': sum(1 for p in parks if p['nightlyPriceMin'] is not None),
        'parksWithSiteCount': sum(1 for p in parks if p['siteCount'] is not None),
        'parksWithAmenities': sum(1 for p in parks if p['amenities']),
        'parksWithHookups': sum(1 for p in parks if p['hookups'] is not None),
        'parksWithMedia': sum(1 for p in parks if p['source']['imageUrl']),
        'parksWithWebsite': sum(1 for p in parks if p['website']),
    }

    meta = {
        'fetchedAt': FETCHED_AT,
        'lastVerified': LAST_VERIFIED,
        'state': state,
        'source': 'RIDB API v1 (ridb.recreation.gov/api/v1) with registered developer apikey',
        'sourceUrls': [
            f'{BASE}/facilities?state={state}&limit=100&offset=N',
            f'{BASE}/facilities/{{facilityId}}',
            f'{BASE}/facilities/{{facilityId}}/facilityaddresses',
        ],
        'counts': counts,
        'detailFailures': detail_failures,
        'antiFabrication': 'rating/reviewCount/petPolicy always null. Prices only from per-night/per-day fee text.',
        'crawlerPacingMs': int(DELAY_MS * 1000),
    }

    (RAW_DIR / f'fetch-meta-{state.lower()}.json').write_text(json.dumps(meta, indent=2))
    (DATA_DIR / f'parks.{state.lower()}.json').write_text(json.dumps({'meta': meta, 'parks': parks}, indent=2))
    (DATA_DIR / f'cities.{state.lower()}.json').write_text(json.dumps(
        {'meta': {'state': state, 'stateAbbr': state}, 'cities': list(cities.values())}, indent=2))

    print(f'  [done] {state}: {len(parks)} parks, {len(cities)} cities')
    if detail_failures:
        print(f'  [warn] detail failures: {len(detail_failures)}')
    return parks


def write_us_index(all_parks):
    """Merge every state's parks into parks.us.json + cities.us.json.

    Loads parks.<ab>.json from disk (not just this run's all_parks) so a
    resumable run (--skip-existing) still produces a complete national index.
    """
    merged = {}
    for f in sorted(DATA_DIR.glob('parks.*.json')):
        ab = f.name.split('parks.')[1][:2].upper()
        if ab == 'US':
            continue
        try:
            d = json.loads(f.read_text(encoding='utf-8'))
            merged[ab] = d.get('parks', [])
        except Exception as e:
            print(f'  [warn] could not read {f.name}: {e}')
    # any states from this run not yet on disk (safety net)
    for state, parks in all_parks.items():
        merged[state] = parks

    flat = []
    seen_fid = {}
    dropped_dups = 0
    for state, st_parks in sorted(merged.items()):
        for p in st_parks:
            p = dict(p)
            p['state'] = state
            fid = p.get('facilityId')
            if fid in seen_fid:
                dropped_dups += 1
                continue  # same facility appeared under another state's pull
            seen_fid[fid] = True
            flat.append(p)
    if dropped_dups:
        print(f'  [us-index] dropped {dropped_dups} duplicate facilityIds (same facility '
              f'returned by multiple state queries)')
    # unique slugs nationally
    seen = {}
    for p in flat:
        slug = p['slug']
        if slug in seen:
            n = 2
            while f'{slug}-{n}' in seen:
                n += 1
            slug = f'{slug}-{n}'
        seen[slug] = True
        p['slug'] = slug

    cities = {}
    for p in flat:
        city = (p['city'] or '').strip()
        if not city:
            continue
        key = f'{city.lower()}|{p["state"].lower()}'
        hub = cities.setdefault(key, {'name': city, 'state': p['state'], 'slug': slugify(f'{city} {p["state"]}'), 'parkIds': []})
        if p['facilityId'] not in hub['parkIds']:
            hub['parkIds'].append(p['facilityId'])

    (DATA_DIR / 'parks.us.json').write_text(json.dumps(
        {'meta': {'fetchedAt': FETCHED_AT, 'lastVerified': LAST_VERIFIED,
                  'states': len(merged), 'totalParks': len(flat),
                  'source': 'RIDB API v1 — 50-state pull',
                  'sourceUrls': [
                      f'{BASE}/facilities?state={{STATE}}&limit=100&offset=N',
                      f'{BASE}/facilities/{{facilityId}}',
                      f'{BASE}/facilities/{{facilityId}}/facilityaddresses',
                  ]},
         'parks': flat}, indent=2))
    (DATA_DIR / 'cities.us.json').write_text(json.dumps(
        {'meta': {'scope': 'US', 'state': 'US', 'stateAbbr': 'US'}, 'cities': list(cities.values())}, indent=2))
    print(f'\n[us-index] {len(flat)} parks across {len(merged)} states')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--states', help='comma-separated subset, e.g. CO,UT,WY')
    ap.add_argument('--limit-states', type=int, help='first N states only (smoke test)')
    ap.add_argument('--skip-existing', action='store_true',
                    help='skip states whose parks.<ab>.json already exists (resume)')
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if args.states:
        states = [s.strip().upper() for s in args.states.split(',') if s.strip()]
    else:
        states = list(STATES)
    if args.limit_states:
        states = states[:args.limit_states]
    if args.skip_existing:
        existing = {f.name.split('parks.')[1][:2].upper() for f in DATA_DIR.glob('parks.*.json')}
        skipped = [s for s in states if s in existing]
        states = [s for s in states if s not in existing]
        print(f'[fetch] skip-existing: {len(skipped)} already done ({", ".join(sorted(skipped))}), '
              f'{len(states)} remaining')

    print(f'[fetch] RIDB 50-state pull ({len(states)} states): {", ".join(states)}')
    all_parks = {}
    for st in states:
        parks = fetch_state(st)
        all_parks[st] = parks

    if len(states) > 1:
        write_us_index(all_parks)
    print(f'\n[fetch] DONE: {sum(len(v) for v in all_parks.values())} parks total')


if __name__ == '__main__':
    main()
