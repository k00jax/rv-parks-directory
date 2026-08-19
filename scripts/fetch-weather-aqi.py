#!/usr/bin/env python3
"""fetch-weather-aqi.py — enrich TX parks with live weather + air quality.

Data sources (Google, verified working with the project key 2026-08-19):
  Weather:      GET  https://weather.googleapis.com/v1/currentConditions:lookup
                  ?key=KEY&location.latitude=LAT&location.longitude=LNG&unitsSystem=IMPERIAL
                -> temperature.degrees (FAHRENHEIT), weatherCondition.description.text,
                   timeZone.id, isDaytime
  Air quality:  POST https://airquality.googleapis.com/v1/currentConditions:lookup
                  {location:{latitude,longitude}, extraComputations:["HEALTH_RECOMMENDATIONS"]}
                -> indexes[0].aqi + indexes[0].category

Requires GOOGLE_API_KEY (from .env or environment). If the key is missing/empty
the script SKIPS cleanly (exit 0) — no API calls, no fabricated data. The key
value is filled in .env by the Director; this repo never commits it.

For each park with non-null lat/lng:
  - fetch weather + AQI (1 s rate limit between parks)
  - cache raw responses to scripts/raw/weather-aqi-<YYYY-MM-DD>.json
  - store on the park record:
      weatherCurrent = {tempF, conditions, isDaytime, fetchedAt}   (or null)
      aqi           = {aqi, category, fetchedAt}                   (or null)
  - on ANY API error the fields stay null — never fabricated.

Re-runs skip parks that already have a fetch for today (see meta.weatherFetchedAt).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'scripts' / 'raw'
DATA_DIR = ROOT / 'src' / 'data'
DATASET = DATA_DIR / 'parks.tx.json'
UA = 'rv-parks-directory/0.4 (weather/AQI enrichment; contact kyle@fonger.ai)'
DELAY_S = 1.0
TRIES = 3

WEATHER_URL = 'https://weather.googleapis.com/v1/currentConditions:lookup'
AIRQUALITY_URL = 'https://airquality.googleapis.com/v1/currentConditions:lookup'

# --- API key (never printed) -------------------------------------------------
API_KEY = os.environ.get('GOOGLE_API_KEY', '').strip()
if not API_KEY:
    env_file = ROOT / '.env'
    if env_file.exists():
        m = re.search(r'^GOOGLE_API_KEY=(.*)$', env_file.read_text(), re.M)
        if m:
            API_KEY = m.group(1).strip()
if not API_KEY:
    print('[weather] GOOGLE_API_KEY not set (add GOOGLE_API_KEY= to .env) — skipping weather/AQI enrichment. exit 0')
    sys.exit(0)


# --- HTTP --------------------------------------------------------------------
def get_json(url, data=None, headers=None):
    for attempt in range(1, TRIES + 1):
        hdr = {'User-Agent': UA, 'Accept': 'application/json'}
        if headers:
            hdr.update(headers)
        req = urllib.request.Request(url, data=data, headers=hdr)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = 4 * attempt
                print(f'  [retry] HTTP {e.code} — wait {wait}s (attempt {attempt}/{TRIES})')
                time.sleep(wait)
                continue
            print(f'  [warn] HTTP {e.code} on {url[:120]}')
            return None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            wait = 3 * attempt
            print(f'  [retry] {e} — wait {wait}s (attempt {attempt}/{TRIES})')
            time.sleep(wait)
            continue
    print(f'  [warn] failed after {TRIES} tries: {url[:120]}')
    return None


def fetch_weather(lat, lng):
    params = urllib.parse.urlencode({
        'key': API_KEY,
        'location.latitude': lat,
        'location.longitude': lng,
        'unitsSystem': 'IMPERIAL',
    })
    data = get_json(f'{WEATHER_URL}?{params}')
    if data is None:
        return None
    if 'error' in data:
        err = data['error']
        print(f'    [warn] weather status={err.get("status")} ({str(err.get("message", ""))[:120]})')
        return None
    temp = (data.get('temperature') or {})
    cond = (data.get('weatherCondition') or {})
    tz = (data.get('timeZone') or {})
    return {
        'tempF': temp.get('degrees'),
        'conditions': (cond.get('description') or {}).get('text') if isinstance(cond.get('description'), dict) else cond.get('description'),
        'timeZone': tz.get('id'),
        'isDaytime': data.get('isDaytime'),
        'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }


def fetch_aqi(lat, lng):
    url = f'{AIRQUALITY_URL}?{urllib.parse.urlencode({"key": API_KEY})}'
    payload = json.dumps({
        'location': {'latitude': lat, 'longitude': lng},
        'extraComputations': ['HEALTH_RECOMMENDATIONS'],
    }).encode()
    headers = {'Content-Type': 'application/json'}
    data = get_json(url, data=payload, headers=headers)
    if data is None:
        return None
    if 'error' in data and data['error']:
        err = data['error']
        print(f'    [warn] airquality status={err.get("status")} ({str(err.get("message", ""))[:120]})')
        return None
    indexes = data.get('indexes') or []
    if not indexes:
        print('    [warn] airquality: no indexes in response')
        return None
    idx = indexes[0]
    return {
        'aqi': idx.get('aqi'),
        'category': idx.get('category'),
        'dominantPollutant': idx.get('dominantPollutant'),
        'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }


# --- main --------------------------------------------------------------------
def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dataset = json.loads(DATASET.read_text())
    parks = dataset['parks']

    today = time.strftime('%Y-%m-%d', time.gmtime())
    raw_file = RAW_DIR / f'weather-aqi-{today}.json'

    # skip parks already enriched today (idempotent daily refresh) — but only
    # when there is nothing left to fetch: any missing weather/AQI (e.g. a
    # transient 403) must be retried, not skipped.
    n_latlng = sum(1 for p in parks if p.get('lat') is not None and p.get('lng') is not None)
    have_w = sum(1 for p in parks if (p.get('weatherCurrent') or {}).get('tempF') is not None)
    have_a = sum(1 for p in parks if (p.get('aqi') or {}).get('aqi') is not None)
    if (
        dataset['meta'].get('weatherFetchedAt', '').startswith(today)
        and have_w >= n_latlng
        and have_a >= n_latlng
    ):
        print(f'[weather] dataset already has weather ({have_w}) + AQI ({have_a}) for {today} — nothing to do. exit 0')
        return

    raw = {}
    if raw_file.exists():
        raw = json.loads(raw_file.read_text())

    weather_ok = 0
    aqi_ok = 0
    skipped = 0
    for p in parks:
        fid = p['facilityId']
        lat, lng = p.get('lat'), p.get('lng')
        if lat is None or lng is None:
            p['weatherCurrent'] = None
            p['aqi'] = None
            skipped += 1
            continue

        # cached successful field, otherwise fetch. Only successes are cached,
        # so transient failures (403/5xx) are retried on the next run.
        cached = raw.get(fid) or {}
        wrec = cached.get('weather') if cached.get('weather') else None
        arec = cached.get('aqi') if cached.get('aqi') else None

        if wrec is None:
            wrec = fetch_weather(lat, lng)
            if wrec is not None:
                weather_ok += 1
                cached['weather'] = wrec
            time.sleep(DELAY_S)
        if arec is None:
            arec = fetch_aqi(lat, lng)
            if arec is not None:
                aqi_ok += 1
                cached['aqi'] = arec
            time.sleep(DELAY_S)
        cached['name'] = p['name']
        raw[fid] = cached
        raw_file.write_text(json.dumps(raw, indent=2))

        if wrec is not None:
            p['weatherCurrent'] = {
                'tempF': wrec.get('tempF'),
                'conditions': wrec.get('conditions'),
                'isDaytime': wrec.get('isDaytime'),
                'timeZone': wrec.get('timeZone'),
                'fetchedAt': wrec.get('fetchedAt'),
            }
        else:
            p['weatherCurrent'] = None

        if arec is not None:
            p['aqi'] = {
                'aqi': arec.get('aqi'),
                'category': arec.get('category'),
                'dominantPollutant': arec.get('dominantPollutant'),
                'fetchedAt': arec.get('fetchedAt'),
            }
        else:
            p['aqi'] = None

        status = 'OK' if (wrec is not None or arec is not None) else 'ERR'
        print(f'  [{status}] {fid} {p["name"]}: '
              f'weather={"yes" if wrec else "null"} aqi={"yes" if arec else "null"}')

    dataset['meta']['weatherFetchedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    counts = dataset['meta'].setdefault('counts', {})
    counts['parksWithWeather'] = sum(1 for p in parks if p.get('weatherCurrent') is not None)
    counts['parksWithAqi'] = sum(1 for p in parks if p.get('aqi') is not None)
    counts['parksWithoutLatLng'] = skipped

    DATASET.write_text(json.dumps(dataset, indent=2))
    raw_file.write_text(json.dumps(raw, indent=2))
    print(f'\n[weather] DONE: {weather_ok} weather fetched, {aqi_ok} AQI fetched, '
          f'{skipped} parks skipped (no lat/lng). '
          f'Dataset: {counts["parksWithWeather"]} with weather, {counts["parksWithAqi"]} with AQI. '
          f'Raw cache: {raw_file}')


if __name__ == '__main__':
    main()
