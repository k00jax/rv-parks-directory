#!/usr/bin/env python3
"""fetch-tpwd-rates.py — fill TX park nightly rates from Texas Parks & Wildlife.

Data source: tpwd.texas.gov (public Texas state park pages — free public data).
  1. Park list:   https://tpwd.texas.gov/state-parks/parks-map
                   (fallback: https://tpwd.texas.gov/state-parks/)
  2. Rates page:  https://tpwd.texas.gov/state-parks/<slug>/fees-facilities/campsites
                   Each page lists campsite types with explicit "$NN Nightly" or
                   "$NN Daily" amounts (the daily ENTRANCE fee is a separate
                   charge and is NOT part of the campsite rate we parse).

Pipeline:
  1. Load the RIDB dataset (src/data/parks.tx.json).
  2. Pull the TPWD park list (slug + name + city).
  3. Fuzzy-match RIDB parks to TPWD parks on name tokens AND city:
       - name confidence = shared significant tokens / min(ridb_tokens, tpwd_tokens)
       - MATCH if city matches AND confidence >= 0.5
       - RIDB park with no city: MATCH only on name confidence >= 0.85
       - city present on both but different -> REJECT (blocks false positives
         like Bear Creek (Fort Worth) vs Bear Creek State Park (Concan))
  4. For each match, fetch the campsites page and parse "$NN Nightly|Daily"
     amounts into a min/max range.
  5. Cache to scripts/raw/tpwd-parks.json (park list) and
     scripts/raw/tpwd-rates.json (facilityId -> rate record) so re-runs reuse
     fetched rates unless --refresh is passed.
  6. Apply to parks.tx.json: nightlyPriceMin/Max + dataSource='tpwd' — ONLY
     where the park has no existing price (an existing RIDB price keeps
     dataSource='ridb'; a price with no source gets dataSource='ridb').

If TPWD blocks scraping (403/WAF), the script prints a note and exits 0 as a
documented stub — it never scrapes competitor directories.

Anti-fabrication: rates come only from explicit Nightly/Daily amounts on the
official TPWD page; uncertain pages are recorded as null, never guessed.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'scripts' / 'raw'
DATA_DIR = ROOT / 'src' / 'data'
DATASET = DATA_DIR / 'parks.tx.json'
PARK_LIST_CACHE = RAW_DIR / 'tpwd-parks.json'
RATES_CACHE = RAW_DIR / 'tpwd-rates.json'
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/126 Safari/537.36')
BASE = 'https://tpwd.texas.gov/state-parks'
DELAY_S = 0.6
TRIES = 3
REFRESH = '--refresh' in sys.argv[1:]

# Generic words that never prove identity (same philosophy as the google script).
STOP = set('''
park campground camping camp recreation area state national forest lake rv resort
texas tx county usace us co cg rec trailway natural historic site group unit
east west north south big little old new upper lower and the of trailway
'''.split())

NIGHTLY_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$(\d+(?:\.\d{2})?)\s*(nightly|daily)\b', re.I)
SINGLE_RE = re.compile(
    r'\$(\d+(?:\.\d{2})?)\s*(nightly|daily)\b', re.I)


def get(url, tries=TRIES):
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode('utf-8', errors='replace'), None
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(5 * attempt)
                continue
            return None, e.code
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(3 * attempt)
            continue
    return None, None


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


def tokens(name):
    if not name:
        return []
    t = name.lower().replace('&', ' and ')
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    return [w for w in t.split() if len(w) >= 3 and w not in STOP]


def norm_city(c):
    if not c:
        return ''
    return re.sub(r'[^a-z ]', '', c.lower()).strip()


def city_match(a, b):
    a, b = norm_city(a), norm_city(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def parse_rates(text):
    """Collect explicit Nightly/Daily amounts -> (min, max) or None."""
    amounts = []
    for m in NIGHTLY_RE.finditer(text):
        try:
            amounts.extend([float(m.group(1)), float(m.group(2))])
        except ValueError:
            pass
    for m in SINGLE_RE.finditer(text):
        try:
            amounts.append(float(m.group(1)))
        except ValueError:
            pass
    if not amounts:
        return None
    lo, hi = min(amounts), max(amounts)
    if hi - lo < 0.01:
        return lo, lo
    return lo, hi


def extract_park_list(html):
    """Parse (slug, name, city) from the parks-map / state-parks page."""
    links = re.findall(r'<a[^>]*href="https://tpwd\.texas\.gov/state-parks/([a-z0-9-]+)"[^>]*>(.*?)</a>',
                       html, flags=re.S)
    seen = {}
    for slug, inner in links:
        if slug in ('parks-map', 'maps', 'help-parks', 'find-a-park', 'parks'):
            continue
        label = re.sub(r'<[^>]+>', ' ', inner)
        label = re.sub(r'\s+', ' ', label).strip()
        label = label.replace('&amp;', '&')
        if not label or len(label) < 3 or label.lower() in ('more', 'less', 'park', 'maps', 'contact', 'view'):
            continue
        # label format: "<Park Name> <City>, TX" (names may contain commas, so
        # the city is the last comma-separated segment before ", TX")
        m = re.match(r'^(.*?),\s*TX\s*$', label)
        if not m:
            continue
        left = m.group(1).strip()
        parts = [s.strip() for s in left.split(',')]
        city = parts[-1]
        name = ','.join(parts[:-1]).strip() if len(parts) > 1 else left
        if not city or not name:
            continue
        # keep the longest label for a slug (later links repeat w/ tracking text)
        if slug not in seen or len(label) > len(seen[slug][0]):
            seen[slug] = (label, name, city)
    return [{'slug': s, 'label': v[0], 'name': v[1], 'city': v[2]}
            for s, v in sorted(seen.items())]


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dataset = json.loads(DATASET.read_text())
    parks = dataset['parks']

    # 1. TPWD park list (cached, refresh with --refresh)
    park_list = None
    if PARK_LIST_CACHE.exists() and not REFRESH:
        park_list = json.loads(PARK_LIST_CACHE.read_text()).get('parks')
    if park_list is None:
        print('[tpwd] fetching TPWD park list...')
        html = None
        for url in (f'{BASE}/parks-map', f'{BASE}/'):
            html, code = get(url)
            if html and code is None:
                break
            time.sleep(DELAY_S)
        if not html:
            print('[tpwd] BLOCKED or unreachable (403/WAF) — leaving documented stub. exit 0')
            sys.exit(0)
        park_list = extract_park_list(html)
        PARK_LIST_CACHE.write_text(json.dumps({
            'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'sourceUrl': url,
            'parks': park_list,
        }, indent=2))
    print(f'[tpwd] {len(park_list)} TPWD parks loaded')

    # 2. fuzzy match
    matches = {}
    for p in parks:
        ridb_toks = tokens(p['name'])
        ridb_city = p.get('city') or ''
        best = None
        for tp in park_list:
            tpwd_toks = tokens(tp['name'])
            if not ridb_toks or not tpwd_toks:
                continue
            shared = set(ridb_toks) & set(tpwd_toks)
            if not shared:
                continue
            conf = len(shared) / min(len(ridb_toks), len(tpwd_toks))
            cm = city_match(ridb_city, tp['city'])
            if cm and conf >= 0.5:
                score = conf + (0.2 if cm else 0)
                if best is None or score > best[0]:
                    best = (score, conf, cm, tp)
            elif not ridb_city and conf >= 0.85:
                score = conf
                if best is None or score > best[0]:
                    best = (score, conf, False, tp)
        if best:
            score, conf, cm, tp = best
            matches[p['facilityId']] = {
                'ridbName': p['name'],
                'tpwdSlug': tp['slug'],
                'tpwdName': tp['name'],
                'confidence': round(conf, 3),
                'cityMatch': cm,
            }
            print(f'  [match] {p["facilityId"]} {p["name"]} -> {tp["name"]} '
                  f'(conf={conf:.2f} city={cm})')
    print(f'[tpwd] {len(matches)} name matches')

    # 3. fetch rates for matched parks (cached unless --refresh)
    rates = {}
    if RATES_CACHE.exists() and not REFRESH:
        rates = json.loads(RATES_CACHE.read_text()).get('matches', {})
    fetched = 0
    for fid, m in matches.items():
        if fid in rates and not REFRESH:
            continue
        url = f"{BASE}/{m['tpwdSlug']}/fees-facilities/campsites"
        html, code = get(url)
        time.sleep(DELAY_S)
        if not html:
            print(f'  [warn] {m["tpwdSlug"]}: HTTP {code} — no rates')
            rates[fid] = {**m, 'sourceUrl': url, 'nightlyPriceMin': None,
                          'nightlyPriceMax': None, 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                          'blocked': bool(code)}
            continue
        lo, hi = parse_rates(strip_html(html))
        rates[fid] = {**m, 'sourceUrl': url, 'nightlyPriceMin': lo,
                      'nightlyPriceMax': hi, 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        fetched += 1
        print(f'  [rates] {m["tpwdName"]}: {lo}–{hi}' if lo else f'  [rates] {m["tpwdName"]}: no nightly amounts')
    RATES_CACHE.write_text(json.dumps({
        'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'matches': rates,
    }, indent=2))

    # 4. apply to dataset (never overwrite an existing price)
    applied = 0
    skipped_has_price = 0
    for p in parks:
        fid = p['facilityId']
        if p.get('dataSource') is None and (p.get('nightlyPriceMin') is not None or p.get('nightlyPriceMax') is not None):
            p['dataSource'] = 'ridb'  # price came from RIDB fee text
        r = rates.get(fid)
        if not r:
            continue
        if p.get('nightlyPriceMin') is not None or p.get('nightlyPriceMax') is not None:
            skipped_has_price += 1
            continue
        if r.get('nightlyPriceMin') is None:
            continue
        p['nightlyPriceMin'] = r['nightlyPriceMin']
        p['nightlyPriceMax'] = r['nightlyPriceMax']
        p['dataSource'] = 'tpwd'
        applied += 1

    counts = dataset['meta'].setdefault('counts', {})
    counts['parksWithPrice'] = sum(1 for p in parks if p.get('nightlyPriceMin') is not None)
    counts['priceSourceBreakdown'] = {}
    for p in parks:
        src = p.get('dataSource')
        if src:
            counts['priceSourceBreakdown'][src] = counts['priceSourceBreakdown'].get(src, 0) + 1
    counts['tpwdMatchedParks'] = len(matches)

    DATASET.write_text(json.dumps(dataset, indent=2))
    print(f'\n[tpwd] DONE: {applied} parks filled from TPWD rates '
          f'({skipped_has_price} skipped: already priced), {len(matches)} matched.')
    print(f'[tpwd] priceSourceBreakdown: {counts["priceSourceBreakdown"]}')


if __name__ == '__main__':
    main()
