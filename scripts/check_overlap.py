#!/usr/bin/env python3
"""Check overlap between park facilityIds and raw facility files."""
import json, glob

parks = json.load(open('src/data/parks.tx.json'))['parks']
by_fid = {str(p.get('facilityId')): p['name'] for p in parks}
raw_fids = set()
for f in glob.glob('scripts/raw/facility-*.json'):
    fid = f.split('facility-')[1].replace('.json', '')
    raw_fids.add(fid)

overlap = set(by_fid.keys()) & raw_fids
print(f"parks: {len(by_fid)}, raw facility files: {len(raw_fids)}, overlapping ids: {len(overlap)}")
print("park ids NOT in raw:", len(set(by_fid) - raw_fids))
print("raw ids NOT in parks:", len(raw_fids - set(by_fid)))
print("MOTT in parks:", [(k, v) for k, v in by_fid.items() if 'MOTT' in v.upper()])
