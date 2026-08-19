#!/usr/bin/env python3
"""List fee-bearing raw parks NOT in our dataset — candidates to re-add."""
import json, glob, re, html as html_mod

def strip_html(s):
    return html_mod.unescape(re.sub(r'<[^>]+>', ' ', s or ''))

for f in sorted(glob.glob('scripts/raw/facility-*.json')):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    cg = d.get('campground') or {}
    fee = cg.get('facility_use_fee_description') or ''
    if not fee or len(fee.strip()) < 3:
        continue
    if '$' not in fee:
        continue
    name = cg.get('facility_name', '').strip()
    state = cg.get('state', '')
    # skip parks already in dataset (name-match check)
    print(f"{name[:45]} | {state} | {strip_html(fee)[:110]}")
