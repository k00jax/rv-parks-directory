#!/usr/bin/env python3
"""Debug why HIGH VIEW / Caney Creek / Big Bend weren't re-added."""
import json, glob, re, html as html_mod, sys
sys.path.insert(0, 'scripts')
from parse_fee_prices import parse_fee_text

def strip_html(s):
    return html_mod.unescape(re.sub(r'<[^>]+>', ' ', s or ''))

targets = ['HIGH VIEW', 'Caney Creek', 'Big Bend Backcountry', 'Rock Quarry',
           'Pine Springs', 'Frijole', 'Sportsman']
for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if not fee or '$' not in fee:
        continue
    name = (cg.get('facility_name') or '').strip()
    if not any(t in name for t in targets):
        continue
    res = parse_fee_text(fee)
    addr = cg.get('facility_address') or {}
    print(f"{name[:38]}")
    print(f"  state={cg.get('state')} addr_state={addr.get('addressstate')} lat={cg.get('facility_latitude')} lng={cg.get('facility_longitude')}")
    print(f"  parse_res={'YES ' + str(res['min']) + '-' + str(res['max']) if res else 'NONE'}")
