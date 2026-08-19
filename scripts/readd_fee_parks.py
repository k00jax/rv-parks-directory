#!/usr/bin/env python3
"""Re-add dropped TX campgrounds that carry real fee descriptions.

The earlier Phase-A filter over-pruned: parks whose name hinted "day use"
were dropped even when they ARE campgrounds with published nightly fees
(HIGH VIEW, Holiday TX, Caney Creek, Big Bend Backcountry, etc). This script
re-adds them to parks.tx.json with the fee-derived price.

Rules (honest):
- Only TX facilities (address state == TX or name says Texas).
- Must have a camping/nightly fee ($ + night/camping/RV/site/amp context) —
  day-use-only parks (MUSTANG, TEMPLES LAKE) stay excluded.
- Must have lat/lng. Keep reservation URL, phone, description when present.
- Parsed price via the SAME parse_fee_text used for existing parks.
"""
import json, glob, re, html as html_mod, sys
sys.path.insert(0, 'scripts')
from parse_fee_prices import parse_fee_text

def strip_html(s):
    return html_mod.unescape(re.sub(r'<[^>]+>', ' ', s or ''))

def norm_name(n):
    n = re.sub(r'\(.*?\)', '', n or '')
    return re.sub(r'[^a-z0-9]+', ' ', n.lower()).strip()

def slugify(n):
    s = re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
    return s

def is_tx(cg):
    st = (cg.get('state') or '').strip().lower()
    if st in ('tx', 'texas'):
        return True
    if re.search(r'\btexas\b', (cg.get('facility_name') or ''), re.I):
        return True
    addr = cg.get('facility_address') or {}
    if (addr.get('addressstate') or '').strip().lower() in ('tx', 'texas'):
        return True
    # Empty state field: infer from TX bounding box (the RIDB TX pull used the
    # same box; ~26.0-36.5N, -106.6 to -93.5W). Keeps NM/OK outliers out.
    try:
        lat = float(cg.get('facility_latitude') or 0)
        lng = float(cg.get('facility_longitude') or 0)
    except (TypeError, ValueError):
        return False
    if lat == 0 or lng == 0:
        return False
    return (25.5 <= lat <= 37.0) and (-107.0 <= lng <= -93.0)

data = json.load(open('src/data/parks.tx.json'))
parks = data['parks']
existing = {norm_name(p.get('name', '')) for p in parks}
existing_slugs = {p.get('slug') for p in parks}
meta = data.get('meta') or {}

added = 0
for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if not fee or '$' not in fee:
        continue
    if not is_tx(cg):
        continue
    name = (cg.get('facility_name') or '').strip()
    if not name or norm_name(name) in existing:
        continue
    res = parse_fee_text(fee)
    if not res:
        continue  # day-use-only or unparseable

    lat = cg.get('facility_latitude')
    lng = cg.get('facility_longitude')
    try:
        lat = float(lat) if lat is not None else None
        lng = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat = lng = None
    if lat is None or lng is None:
        continue

    slug = slugify(name)
    base = slug
    n = 2
    while slug in existing_slugs:
        slug = f"{base}-{n}"
        n += 1
    existing_slugs.add(slug)

    # image URL from RIDB MEDIA (first image), description from facility
    media = cg.get('media') or (d.get('media') or [])
    img = ''
    if isinstance(media, list):
        for m in media:
            u = (m.get('URL') or m.get('url') or '')
            if u:
                img = u
                break
    desc = strip_html(cg.get('facility_description') or '')
    park = {
        'facilityId': str(cg.get('facility_id')),
        'name': name,
        'slug': slug,
        'street': (cg.get('facility_address') or {}).get('addressline1') or '',
        'city': (cg.get('facility_address') or {}).get('city') or '',
        'state': 'TX',
        'zip': (cg.get('facility_address') or {}).get('postalcode') or '',
        'lat': lat,
        'lng': lng,
        'phone': cg.get('facility_phone') or '',
        'website': cg.get('facility_reservation_url') or '',
        'nightlyPriceMin': res['min'],
        'nightlyPriceMax': res['max'],
        'dataSource': 'ridb-fee-description',
        'priceNote': res.get('note', ''),
        'priceRaw': res.get('raw', '')[:400],
        'weatherCurrent': None,
        'aqi': None,
        'hookups': 'partial',
        'amenities': [],
        'siteCount': None,
        'rating': None,
        'reviewCount': None,
        'petPolicy': None,
        'lastVerified': '2026-08-19',
        'source': {
            'orgId': cg.get('parent_asset_id') or '',
            'orgName': None,
            'parentId': cg.get('parent_asset_id') or '',
            'parentName': None,
            'reservable': bool(cg.get('facility_reservation_url')),
            'facilityType': 'Campground',
            'equipment': [],
            'maxVehicleLength': None,
            'imageUrl': img,
            'timeZone': None,
            'description': desc[:900],
        },
    }
    # light amenity/hookup parse from description + fee text
    combo = f"{desc} {strip_html(fee)}"
    if re.search(r'50\s*amp', combo, re.I): park['amenities'].append('50 amp')
    if re.search(r'30\s*amp', combo, re.I): park['amenities'].append('30 amp')
    if re.search(r'20\s*amp', combo, re.I): park['amenities'].append('20 amp')
    if re.search(r'water hookup|water &|with water', combo, re.I): park['amenities'].append('water hookup')
    if re.search(r'dump station', combo, re.I): park['amenities'].append('dump station')
    if re.search(r'\bshowers?\b', combo, re.I): park['amenities'].append('showers')
    if re.search(r'flush toilet', combo, re.I): park['amenities'].append('flush toilets')
    if re.search(r'boat ramp|boat launch', combo, re.I): park['amenities'].append('boat ramp')
    if re.search(r'playground', combo, re.I): park['amenities'].append('playground')
    if re.search(r'laundry', combo, re.I): park['amenities'].append('laundry')
    if re.search(r'full hookup|sewer', combo, re.I):
        park['hookups'] = 'full'
    elif re.search(r'electrical|electric', combo, re.I):
        park['hookups'] = 'partial'

    parks.append(park)
    added += 1
    print(f"  ADDED: {name[:40]} | ${res['min']}-${res['max']} | {slug}")

# recompute meta.counts so validators / pages stay truthful
priced = [x for x in parks if x.get('nightlyPriceMin') is not None]
rated = [x for x in parks if x.get('rating') is not None]
with_weather = [x for x in parks if x.get('weatherCurrent')]
with_aqi = [x for x in parks if x.get('aqi')]
cities = sorted({x.get('city') for x in parks if x.get('city')})
meta['counts'] = {
    'parks': len(parks),
    'parksWithPrice': len(priced),
    'parksWithRating': len(rated),
    'parksWithWeather': len(with_weather),
    'parksWithAqi': len(with_aqi),
    'cities': len(cities),
}
meta['lastVerified'] = '2026-08-19'
json.dump({'parks': parks, 'meta': meta}, open('src/data/parks.tx.json', 'w'), indent=2)
print(f"\nadded {added} parks with prices; total parks now {len(parks)}; priced {len(priced)}")
