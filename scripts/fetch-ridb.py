#!/usr/bin/env python3
"""fetch-ridb.py — rebuild the TX RV parks dataset from the REAL RIDB API v1.

Data source: https://ridb.recreation.gov/api/v1 (Recreation Information Database).
Requires RIDB_API_KEY (from .env or environment). The previous fetch
(scripts/fetch-ridb.mjs) used the recreation.gov SPA endpoints; this script uses
the official RIDB API with Kyle's verified developer key.

Pipeline:
  1. Paginate GET /facilities?state=TX&limit=100&offset=N until TOTAL_COUNT
     consumed (269 records at time of writing).
  2. Phase A filter (campground/RV-park types OR camping keywords in
     name/keywords/description; day-use areas excluded unless clearly a
     campground).
  3. Enrich each candidate: GET /facilities/{id} (detail: phone, reservation
     URL, fees, media, description) + GET /facilities/{id}/facilityaddresses
     (physical address -> street/city/zip/state).
  4. Phase B filter: keep only facilities whose address state == TX (fallback:
     no address but coordinates inside the Texas bounding box). RIDB's state
     parameter is unreliable — the TX query returns NM facilities, museums,
     hotels, etc., so state is verified from the authoritative address record.
  5. Map into the src/lib/types.ts data model. Every parsed value comes from
     real RIDB text; uncertain parses are null (never fabricated).
  6. Regenerate src/data/parks.tx.json + src/data/cities.tx.json + raw
     provenance + fetch-meta.json.

Anti-fabrication: prices are parsed ONLY from FacilityUseFeeDescription with an
explicit per-night/per-day context; hookups/amenities/siteCount are parsed from
FacilityDescription/Keywords; anything uncertain is null. rating/reviewCount/
petPolicy are always null (RIDB facility-level data does not publish them).
"""
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
UA = 'rv-parks-directory/0.2 (RIDB API data refresh; contact kyle@fonger.ai)'
DELAY_MS = 0.45
FETCHED_AT = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
LAST_VERIFIED = time.strftime('%Y-%m-%d', time.gmtime())
STATE = 'TX'

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
    """Mirror src/lib/parks.ts slugify: lowercase, & -> ' and ', non-alnum runs
    -> '-', strip edge dashes, cap at 90 chars."""
    s = (name or '').lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')[:90]


def norm_name(name):
    """Strip trailing phone numbers / parenthetical noise RIDB appends to names."""
    if not name:
        return ''
    n = name.strip()
    n = re.sub(r'\s*[\d\-() ]{7,}\s*$', '', n)  # trailing phone-ish
    n = re.sub(r'\s*\([^)]*\)\s*$', '', n)  # trailing (area)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


# --- Phase A filter (campground / RV park) ------------------------------------
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
    """Phase A: does this facility look like a campground/RV park?"""
    name = norm_name(rec.get('FacilityName') or '')
    ftype = (rec.get('FacilityTypeDescription') or '').strip()
    keywords = rec.get('Keywords') or ''
    desc = strip_html(rec.get('FacilityDescription') or '')
    blob = f'{name} {keywords} {desc}'

    name_day_use = bool(DAY_USE_NAME.search(name))
    name_camp = bool(CAMP_SIGNAL.search(name))
    blob_camp = bool(DESC_CAMP.search(blob))

    if ftype in KEEP_TYPES:
        # type says campground, but a day-use name marker (day use / picnic /
        # pavilion / shelter / marina / trailhead ...) means this is the day-use
        # area of a park, NOT the campground. Only a camping signal in the NAME
        # itself (e.g. "Lake Somerville Marina & Campground") overrides that.
        if name_day_use and not name_camp:
            return False, 'type-campground-but-day-use-name'
        return True, f'type:{ftype}'
    # not a campground type: keep only with a real camping signal
    if name_camp or blob_camp:
        if name_day_use and not name_camp:
            return False, 'day-use-name-no-name-camp-signal'
        return True, f'signal:{name_camp and "name" or "desc"}'
    return False, 'no-camp-signal'


# --- Phase B: Texas verification ----------------------------------------------
TX_BBOX = {'lat_min': 25.84, 'lat_max': 36.50, 'lng_min': -106.65, 'lng_max': -93.51}

# One-time reverse-geocode verification of address-less facilities (OpenStreetMap
# Nominatim, 2026-08-19, zoom=10). RIDB returns many facilities with no usable
# address (only empty TX/NM/OK state-marker rows) whose coordinates fall inside
# the Texas bounding box; Nominatim resolves the actual state from real map data.
# facilityId -> ('TX'|'OK'|'NM'|...)
STATE_OVERRIDES = {
    # --- New Mexico (Cibola NF / Cimarron, dropped) ---
    '253529': 'NM',   # McGaffey Campground
    '253610': 'NM',   # Water Canyon Group Campground
    '253623': 'NM',   # Water Canyon Campground
    '253552': 'NM',   # Mills Canyon Rim Campground
    '253557': 'NM',   # Fourth of July Campground
    '253634': 'NM',   # Red Cloud Campground
    '253563': 'NM',   # New Canyon Campground
    '253603': 'NM',   # Bosque Campground
    '10023205': 'NM', # Ojo Redondo Campground
    # --- Oklahoma (Black Kettle / Spring Creek, dropped) ---
    '253589': 'OK',   # Black Kettle Campground
    '253592': 'OK',   # Spring Creek Campground
    '253642': 'OK',   # Spring Creek Dispersed Sites
    # --- Texas panhandle (kept) ---
    '253635': 'TX',   # East Bluff #1 Campground - Lake McClellan
    '253578': 'TX',   # McDowell Campground
}

NOMINATIM_UA = 'rv-parks-directory/0.2 (data verification; contact kyle@fonger.ai)'

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


def has_real_address(facility_addresses):
    for a in facility_addresses or []:
        if (a.get('FacilityStreetAddress1') or '').strip() or (a.get('City') or '').strip():
            return True
    return False


def addr_state(facility_addresses):
    """State of the first real (street or city) address record; None otherwise."""
    for a in facility_addresses or []:
        if not ((a.get('FacilityStreetAddress1') or '').strip() or (a.get('City') or '').strip()):
            continue
        st = (a.get('AddressStateCode') or '').strip().upper()
        if st:
            return st
    return None


def in_tx_bbox(lat, lng):
    if lat is None or lng is None:
        return False
    return (TX_BBOX['lat_min'] <= lat <= TX_BBOX['lat_max']
            and TX_BBOX['lng_min'] <= lng <= TX_BBOX['lng_max'])


def nominatim_state(lat, lng):
    """Reverse-geocode via OpenStreetMap Nominatim. Returns state abbrev or None."""
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


def verify_texas(rec, addresses, use_nominatim=True):
    """Returns (keep, reason, state_evidence)."""
    lat = rec.get('FacilityLatitude')
    lng = rec.get('FacilityLongitude')
    fid = str(rec.get('FacilityID'))

    if has_real_address(addresses):
        st = addr_state(addresses)
        if st == 'TX':
            return True, 'address', 'address'
        return False, f'address-not-tx ({st})', st or 'unknown'

    if fid in STATE_OVERRIDES:
        st = STATE_OVERRIDES[fid]
        if st == 'TX':
            return True, f'override:{st}', 'nominatim-override'
        return False, f'override:{st}', st

    if use_nominatim and lat is not None and lng is not None:
        st = nominatim_state(lat, lng)
        if st:
            if st == 'TX':
                return True, 'nominatim', 'nominatim'
            return False, f'nominatim-not-tx ({st})', st
        # geocoder failed; fall through to bbox
        print(f'  [warn] {fid} {rec.get("FacilityName")}: no nominatim verdict, bbox fallback')

    if in_tx_bbox(lat, lng):
        return True, 'coords-bbox', 'coords-bbox'
    return False, f'not-tx (lat={lat}, lng={lng})', 'unknown'


# --- field parsers (all from real text; uncertain -> null) ---------------------
FEE_RANGE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$(\d+(?:\.\d{2})?)\s*(?:per\s*)?(night|day)\b', re.I)
FEE_SLASH_RANGE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$(\d+(?:\.\d{2})?)\s*/\s*(night|day)\b', re.I)
FEE_NIGHTLY_RE = re.compile(
    r'nightly (?:rate|fee|cost)[^$]*\$(\d+(?:\.\d{2})?)', re.I)
FEE_SINGLE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:per\s*|/)?(?:night|day)\b', re.I)


def parse_price(fee_html):
    """Parse nightly price from FacilityUseFeeDescription. Returns (min, max).

    Collects every dollar amount with an explicit per-night/per-day context and
    returns the min/max across them (so \"$16 per night for a 50 amp site; $14
    per night for a 30 amp site\" -> (14.0, 16.0)). Amounts tied to per-person /
    per-vehicle bases are rejected (uncertain nightly basis)."""
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
        # reject per-person / per-vehicle-only amounts (uncertain nightly basis)
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


def parse_hookups(text):
    t = (text or '').lower()
    if re.search(r'no full hookup', t):
        return 'none'
    if re.search(r'full hookups?|full-hookups?|full service hookup|full service sites?', t):
        return 'full'
    if re.search(r'water\s*(,|&|and)?\s*sewer\s*(,|&|and)?\s*electric', t):
        return 'full'
    if re.search(r'water\s*(&|and|,)?\s*electric|w/e\b|water hookup|electric hookup|sewer hookup|partial hookup', t):
        return 'partial'
    if re.search(r'no hookups?|dry camping|tent only|primitive camping|no water|no electricity|no electric|no sewer', t):
        return 'none'
    return None


def parse_amps(text):
    amps = []
    for m in re.finditer(r'(\d{2})\s*[- ]?amp', (text or ''), re.I):
        n = int(m.group(1))
        if n not in amps:
            amps.append(n)
    return sorted(amps)


def parse_amenities(text):
    t = (text or '').lower()
    am = []
    if re.search(r'\bshower', t):
        am.append('showers')
    if re.search(r'flush toilet', t):
        am.append('flush toilets')
    if re.search(r'dump station|sanitary (?:dump|disposal)|sewage disposal', t):
        am.append('dump station')
    if re.search(r'boat ramp|boat launch|boat landing', t):
        am.append('boat ramp')
    if re.search(r'playground', t):
        am.append('playground')
    if re.search(r'wi-?fi|wireless internet', t):
        am.append('wifi')
    if not re.search(r'no pets|pets not allowed|no dogs|pets? (?:are )?not', t) and re.search(
            r'pet(?:s)? (?:allowed|friendly|welcome)|dogs (?:allowed|welcome|leashed)|pets welcome', t):
        am.append('pets')
    if re.search(r'laundr', t):
        am.append('laundry')
    if re.search(r'swimming pool|wading pool|\bpool\b', t):
        am.append('pool')
    if re.search(r'water hookup|water and electric', t):
        am.append('water hookup')
    return am


def parse_site_count(text):
    m = re.search(r'\b(\d{1,4})\s+(?:campsites|camp sites|rv sites|camping sites|sites|spaces)\b', (text or ''), re.I)
    if m:
        n = int(m.group(1))
        return n if 1 <= n <= 9999 else None
    return None


def primary_image(facility):
    media = facility.get('MEDIA') or []
    for m in media:
        if m.get('IsPrimary') and (m.get('MediaType') or '').lower() == 'image':
            return m.get('URL')
    for m in media:
        if (m.get('MediaType') or '').lower() == 'image':
            return m.get('URL')
    return None


# --- main ---------------------------------------------------------------------
def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f'[fetch] RIDB TX facilities pull (fetchedAt={FETCHED_AT})')

    # 1. paginate the list endpoint
    all_records = []
    offset = 0
    total = None
    while True:
        data = get_json(f'{BASE}/facilities', {'state': STATE, 'limit': 100, 'offset': offset})
        meta = data.get('METADATA', {})
        results = data.get('RECDATA', [])
        total = meta.get('RESULTS', {}).get('TOTAL_COUNT', total)
        all_records.extend(results)
        write = RAW_DIR / f'ridb-facilities-tx-page-{offset}.json'
        write.write_text(json.dumps(data, indent=2))
        print(f'[fetch] page offset={offset}: +{len(results)} (total={total})')
        offset += len(results)
        if not results or offset >= total:
            break
        time.sleep(DELAY_MS)

    # 2. phase A filter
    candidates = []
    dropped_a = Counter()
    for r in all_records:
        keep, reason = is_campground_candidate(r)
        if keep:
            candidates.append(r)
        else:
            dropped_a[reason] += 1
    print(f'[fetch] list records: {len(all_records)}; phase-A candidates: {len(candidates)}')
    for reason, n in dropped_a.most_common():
        print(f'  dropped (phase A): {n} {reason}')

    # 3+4. enrich + phase B (TX) filter
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
            print(f'  [warn] detail FAILED {fid} {rec.get("FacilityName")}: {e}')
        try:
            addr_data = get_json(f'{BASE}/facilities/{fid}/facilityaddresses', {})
            addresses = (addr_data or {}).get('RECDATA', [])
            (RAW_DIR / f'ridb-facility-{fid}-addresses.json').write_text(json.dumps(addr_data, indent=2))
        except Exception as e:
            detail_failures.append({'id': fid, 'error': f'addresses: {e}'})
            print(f'  [warn] addresses FAILED {fid} {rec.get("FacilityName")}: {e}')

        keep_tx, tx_reason, tx_evidence = verify_texas(rec, addresses)
        if keep_tx:
            kept.append((rec, detail, addresses, tx_reason))
        else:
            dropped_b[tx_reason] += 1
        state_evidence[tx_evidence] += 1
        if i % 25 == 0:
            print(f'[fetch] enriched {i}/{len(candidates)}')
        time.sleep(DELAY_MS)

    # 5. map into the data model
    parks = []
    for rec, detail, addresses, tx_reason in kept:
        fid = str(rec.get('FacilityID'))
        fac = detail if detail else None  # detail endpoint returns the facility object directly
        ftype = ((fac or rec).get('FacilityTypeDescription') or '')
        name = norm_name((fac or rec).get('FacilityName') or '')
        if not name:
            name = norm_name(rec.get('FacilityName') or '')
        desc = strip_html((fac or rec).get('FacilityDescription') or '')
        keywords = (fac or rec).get('Keywords') or ''
        parse_text = f'{desc} {keywords}'
        fee_html = (fac or rec).get('FacilityUseFeeDescription') or ''

        # address: prefer Physical, fall back to Default
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
            'state': STATE,
            'zip': (def_addr or {}).get('PostalCode') or None,
            'lat': rec.get('FacilityLatitude'),
            'lng': rec.get('FacilityLongitude'),
            'phone': (fac or rec).get('FacilityPhone') or None,
            'website': res_url or (f'https://www.recreation.gov/camping/campgrounds/{fid}' if reservable else None),
            'nightlyPriceMin': price_min,
            'nightlyPriceMax': price_max,
            'hookups': hookups,
            'amenities': amenities,
            'siteCount': parse_site_count(parse_text),
            'rating': None,
            'reviewCount': None,
            'petPolicy': None,
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

    # unique slugs (append -2/-3 on collision)
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
        'totalRidbTxRecords': len(all_records),
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
        'source': 'RIDB API v1 (ridb.recreation.gov/api/v1) with registered developer apikey',
        'sourceUrls': [
            f'{BASE}/facilities?state=TX&limit=100&offset=N',
            f'{BASE}/facilities/{{facilityId}}',
            f'{BASE}/facilities/{{facilityId}}/facilityaddresses',
        ],
        'counts': counts,
        'detailFailures': detail_failures,
        'websiteDerivation':
            'FacilityReservationURL when present; otherwise canonical Recreation.gov listing URL '
            '(https://www.recreation.gov/camping/campgrounds/{facilityId}) only when Reservable=true.',
        'stateVerification':
            'RIDB state=TX filter is unreliable (returns NM facilities, museums, hotels). Kept only '
            'facilities whose facilityaddresses AddressStateCode == TX, or (no address) coordinates '
            'inside the Texas bounding box. See droppedPhaseB.',
        'antiFabrication':
            'rating/reviewCount/petPolicy always null (not published at RIDB facility level). '
            'Prices parsed only from FacilityUseFeeDescription with per-night/per-day context. '
            'Hookups/amenities/siteCount parsed from FacilityDescription/Keywords.',
        'crawlerPacingMs': int(DELAY_MS * 1000),
    }

    (RAW_DIR / 'fetch-meta.json').write_text(json.dumps(meta, indent=2))
    (DATA_DIR / 'parks.tx.json').write_text(json.dumps({'meta': meta, 'parks': parks}, indent=2))
    (DATA_DIR / 'cities.tx.json').write_text(json.dumps(
        {'meta': {'state': 'Texas', 'stateAbbr': 'TX'}, 'cities': list(cities.values())}, indent=2))

    print(f'\n[fetch] DONE: {len(parks)} parks, {len(cities)} cities')
    print(f'[fetch] type breakdown: {dict(type_breakdown)}')
    if detail_failures:
        print(f'[fetch] detail failures: {len(detail_failures)}')
        for f in detail_failures:
            print('  ', f)


if __name__ == '__main__':
    main()
