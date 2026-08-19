#!/usr/bin/env python3
"""Debug why parse_fee_prices only priced 8 parks."""
import json, glob, sys
sys.path.insert(0, 'scripts')
from parse_fee_prices import parse_fee_text

parks = json.load(open('src/data/parks.tx.json'))['parks']
by_fid = {str(p.get('facilityId')): p for p in parks}

print("sample park facilityIds:", [p.get('facilityId') for p in parks[:5]])
print("sample raw files:", sorted(glob.glob('scripts/raw/facility-*.json'))[:5])

matched_fee = 0
parse_hit = 0
no_fee = 0
for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    fid = f.split('facility-')[1].replace('.json', '')
    if fid not in by_fid:
        continue
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if fee and len(fee.strip()) > 3:
        matched_fee += 1
        res = parse_fee_text(fee)
        if res:
            parse_hit += 1
        else:
            no_fee += 1
            print(f"  PARSE-MISS: {cg.get('facility_name','?')[:35]} ({fid}): {fee.strip()[:120]}")

print(f"parks-with-raw: overlap, fee present: {matched_fee}, parse hit: {parse_hit}, parse miss: {no_fee}")
