#!/usr/bin/env python3
"""Match raw fee descriptions to parks by NAME (raw ids differ from park ids)."""
import json, glob, re, html as html_mod, sys
sys.path.insert(0, 'scripts')
from parse_fee_prices import parse_fee_text

parks = json.load(open('src/data/parks.tx.json'))['parks']

def norm_name(n):
    n = re.sub(r'\(.*?\)', '', n or '')
    n = re.sub(r'[^a-z0-9]+', ' ', n.lower()).strip()
    return n

by_name = {}
for p in parks:
    key = norm_name(p.get('name', ''))
    by_name[key] = p

matched = 0
for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if not fee or len(fee.strip()) < 3:
        continue
    raw_name = cg.get('facility_name', '')
    rn = norm_name(raw_name)
    p = by_name.get(rn)
    if not p:
        continue  # park not in our 75
    if p.get('nightlyPriceMin') is not None:
        continue  # already priced
    res = parse_fee_text(fee)
    if res:
        p['nightlyPriceMin'] = res['min']
        p['nightlyPriceMax'] = res['max']
        p['priceSource'] = 'ridb-fee-description'
        p['priceNote'] = res.get('note', '')
        p['priceRaw'] = res.get('raw', '')
        matched += 1
        print(f"  MATCHED: {raw_name[:35]} -> ${res['min']}-${res['max']} ({res.get('note')})")

print(f"newly priced by name-match: {matched}")
json.dump({'parks': parks, 'meta': json.load(open('src/data/parks.tx.json'))['meta']},
          open('src/data/parks.tx.json', 'w'), indent=2)
