"""Restore enriched fields (Google ratings, TPWD prices, weather/AQI) for TX
parks from git history into the current US dataset, matched by facilityId.

The fresh 50-state RIDB pull overwrote parks.tx.json with raw RIDB data (all
ratings null). This merges the enrichment that existed in commit ddb6074
(ratings/prices) and 0727c1e (weather/AQI) back in, by facilityId, without
any API calls. Other states keep null enrichment until fetch-google-ratings.py
etc. are run against the US dataset with a Google API key.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(r'C:\Users\black\AppData\Local\Temp\rvparks-check')
DATA = ROOT / 'src' / 'data'

# --- load old enriched TX from git ---
def git_json(commit, path):
    out = subprocess.run(
        ['git', 'show', f'{commit}:{path}'], cwd=ROOT,
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)

old_tx = git_json('ddb6074', 'src/data/parks.tx.json')['parks']
old_tx_wx = git_json('0727c1e', 'src/data/parks.tx.json')['parks']  # weather/aqi

# merge weather/aqi into ratings snapshot by id
wx_by_id = {str(p['facilityId']): p for p in old_tx_wx}
for p in old_tx:
    wx = wx_by_id.get(str(p['facilityId']), {})
    p['weatherCurrent'] = wx.get('weatherCurrent')
    p['aqi'] = wx.get('aqi')

enrich_by_id = {str(p['facilityId']): p for p in old_tx}
print(f'old TX enrichment: {len(enrich_by_id)} parks (rated: '
      f'{sum(1 for p in old_tx if p.get("rating") is not None)})')

# --- patch current TX parks in the US index ---
us = json.load(open(DATA / 'parks.us.json', encoding='utf-8'))
restored = 0
for p in us['parks']:
    if p['state'] != 'TX':
        continue
    old = enrich_by_id.get(p['facilityId'])
    if not old:
        continue
    for field in ('rating', 'reviewCount', 'priceLevel', 'placeId', 'googleUrl',
                  'nightlyPriceMin', 'nightlyPriceMax', 'dataSource',
                  'weatherCurrent', 'aqi', 'petPolicy'):
        if old.get(field) is not None:
            p[field] = old[field]
    restored += 1

json.dump(us, open(DATA / 'parks.us.json', 'w', encoding='utf-8'), indent=2)
print(f'restored enrichment for {restored} TX parks')
print('TX rated now:', sum(1 for p in us["parks"] if p["state"]=="TX" and p.get("rating") is not None))
