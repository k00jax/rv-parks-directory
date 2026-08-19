#!/usr/bin/env python3
"""Which fee-bearing raw parks are NOT in our 75, by name."""
import json, glob, re

parks = json.load(open('src/data/parks.tx.json'))['parks']

def norm_name(n):
    n = re.sub(r'\(.*?\)', '', n or '')
    n = re.sub(r'[^a-z0-9]+', ' ', n.lower()).strip()
    return n

ours = {norm_name(p.get('name', '')) for p in parks}

targets = ['High View', 'Holiday', 'Rock Quarry', 'Big Bend Backcountry',
           'Pine Springs', 'Caney Creek', 'Frijole', 'Sportsman']
for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if not fee or len(fee.strip()) < 3:
        continue
    raw = cg.get('facility_name', '')
    if any(t.lower() in raw.lower() for t in targets):
        in_ours = norm_name(raw) in ours
        print(f"{'IN' if in_ours else 'NOT-IN'}: {raw[:40]} ({cg.get('facility_id')})")
