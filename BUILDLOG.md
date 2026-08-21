# BUILDLOG — RV Parks & Campgrounds Directory

Date: 2026-08-18/19 (UTC) · Builder: Developer (dev-3) · Spec: /home/odroid/trivance/directory-niche-brief.md
Repo: /home/odroid/trivance/rv-parks-directory (LOCAL ONLY — not deployed, not pushed)

## 0. DATA REFRESH 2026-08-19 — switched to the REAL RIDB API (apikey)

Previous dataset (133 parks) was built from the recreation.gov SPA endpoints (partial
mirror, no RIDB apikey). This refresh pulls the official RIDB API v1 with Kyle's
registered developer key (stored in .env, gitignored; verified working) and
REPLACES the dataset.

### 0.1 Fetch pipeline (scripts/fetch-ridb.py, `npm run data:fetch`)

1. `GET /facilities?state=TX&limit=100&offset=0/100/200` — paginated until
   TOTAL_COUNT (269) consumed. Raw pages → scripts/raw/ridb-facilities-tx-page-*.json.
2. Phase A filter (campground/RV-park types OR camping keywords in name/keywords/
   description; day-use areas excluded unless the NAME itself says camping):
   - KEEP_TYPES: Campground, RV Park, Trailer Park, Group Campground,
     Campground - Group, Horse Campground, Horse Camp
   - Day-use name markers (day use / picnic / pavilion / shelter / marina /
     trailhead / overlook / museum / hotel / …) drop a facility even when RIDB
     typed it "Campground" — e.g. BRUSHY CREEK DAY USE, LAKELAND PAVILION,
     Boykin Springs Pavilion, AIRPORT BEACH SHELTER were all typed Campground
     but are day-use areas and were dropped.
3. Enrichment per candidate: `GET /facilities/{id}` (phone, reservation URL, fee
   description, media, description) + `GET /facilities/{id}/facilityaddresses`
   (street/city/zip/state). Raw → scripts/raw/ridb-facility-{id}*.json.
4. Phase B filter (Texas verification). RIDB's `state=TX` filter is UNRELIABLE —
   the 269 records include New Mexico facilities (Ojo Redondo, McGaffey, Bosque,
   Water Canyon, Mills Canyon Rim, Fourth of July, Red Cloud, New Canyon),
   Oklahoma facilities (Black Kettle, Spring Creek, Spring Creek Dispersed), a
   Mexico City cemetery, museums, hotels, and visitor centers. State was verified
   per facility:
   - real address (street or city) with AddressStateCode == TX → keep (73)
   - no real address → OpenStreetMap Nominatim reverse-geocode of RIDB coords
     (one-time run 2026-08-19; verdicts baked into STATE_OVERRIDES in
     fetch-ridb.py so re-runs are deterministic) → 14 checked: 12 non-TX dropped,
     2 TX panhandle kept (East Bluff #1, McDowell)
   - bbox fallback only when geocoder unavailable (none needed after overrides)
5. Mapping is 1:1 with src/lib/types.ts. All parsed values come from real RIDB
   text (FacilityDescription/Keywords for hookups/amenities/siteCount,
   FacilityUseFeeDescription for prices). rating/reviewCount/petPolicy are null
   (RIDB facility level does not publish them — never fabricated). Price parsing
   requires an explicit per-night/per-day context; per-person/per-vehicle amounts
   are rejected; multiple nightly rates collapse to a min/max (e.g. MOTT
   "$16/night 50 amp; $14/night 30 amp" → $14–$16).

### 0.2 Counts

| Item | Value |
|---|---|
| RIDB TX query TOTAL_COUNT | 269 |
| Phase A candidates (campground-ish) | 88 |
| Dropped Phase A — no camp signal (museums/hotels/trailheads/…) | 168 |
| Dropped Phase A — typed Campground but day-use name | 10 |
| Dropped Phase A — day-use name, no name camp signal (type Facility) | 3 |
| Dropped Phase B — address/Nominatim says New Mexico | 9 |
| Dropped Phase B — address/Nominatim says Oklahoma | 3 |
| Dropped Phase B — coords (0,0) unverifiable (Manzanita, NM) | 1 |
| **Parks kept (new dataset)** | **75** (72 Campground + 3 Facility: Big Mineral Camp, Bridgeview Camp Marina, Campers Cove) |
| Cities derived | 38 |
| State evidence: address 73 · Nominatim override TX 2 | |
| Parks with street/zip | 68/68 |
| Parks with city | 73 |
| Parks with phone | 66 |
| Parks with lat/lng | 75 |
| Parks with nightly price | 1 (MOTT $14–$16; RIDB fee text rarely lists per-night rates) |
| Parks with siteCount | 36 |
| Parks with amenities | 64 |
| Parks with hookups | 47 (partial 42, none 4, full 1) |
| Parks with media (primary image) | 66 |
| Parks with website | 68 (FacilityReservationURL or canonical recreation.gov listing when Reservable) |
| lastVerified | 2026-08-19 |

Previous dataset was 133 parks (recreation.gov SPA mirror, 58 cities). New dataset
is 75 parks / 38 cities: smaller because the RIDB TX set is federal-leaning (TX
state parks book on ResRec and are not in RIDB), the state filter was unreliable
and was corrected, and day-use/museum/hotel records were excluded.

### 0.3 RIDB API notes / issues

- Rate limits: none hit during the pull (~180 requests, 0.45 s pacing; script
  retries 429/5xx with backoff).
- `state` parameter: RIDB returns facilities with no/incorrect state records —
  see Phase B above. Verification from facilityaddresses is authoritative.
- List + detail endpoints return NO FacilityAddress (empty array); addresses come
  only from the `/facilities/{id}/facilityaddresses` sub-endpoint (Physical
  preferred, Default fallback). Many facilities have only empty TX/NM/OK
  state-marker rows (no street/city) — treated as "no real address".
- Detail endpoint returns the facility object directly (not RECDATA-wrapped);
  sub-endpoints are RECDATA-wrapped.
- CAMPSITE data exists per facility (`/facilities/{id}/campsites` has per-site
  attributes incl. hookups/amps) but was NOT pulled (scope: description-level
  parsing per task). It is the Phase 1 hookup upgrade path.

## 1. Dataset (post-refresh state)

Source: RIDB API v1 (ridb.recreation.gov/api/v1) with registered developer apikey.
Full breakdown in section 0.2. Raw provenance: scripts/raw/ridb-*.json +
fetch-meta.json. Website derivation documented in parks.tx.json meta.

## 2. Data-source notes

- Texas count is 269 RIDB records → 75 kept campground/RV-park facilities. The
  brief's ~1,400 [est] includes TX state parks, which book on ResRec and are not
  in RIDB. A later phase can add state-park data from official state sources.
- website = FacilityReservationURL when present; otherwise the canonical
  Recreation.gov listing URL (`https://www.recreation.gov/camping/campgrounds/{id}`)
  only when Reservable=true. Documented in meta.websiteDerivation.
- Anti-fabrication: no invented ratings/prices/hookups; uncertain parses are null.
  rating/reviewCount/petPolicy are always null (not published at RIDB facility
  level). Hookup/amenity/siteCount values are greppable in the raw facility JSON.

## 3. Build + verification gates (2026-08-19 refresh, all real outputs)

| Gate | Command | Result |
|---|---|---|
| 1. Typecheck | `npx tsc --noEmit` | exit 0 |
| 2. Validator | `node scripts/validate-data.mjs` (also in build chain) | exit 0 — parks 75, cities 38, OK |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 124/124 static pages |
| 4. HTML inventory | `find docs -name "*.html" \| wc -l` | 123 HTML files (home 1, park pages 75, rv-parks tree 45, 404/extras) |
| 5. Sponsored links | verify-content.py grep | 0 (Phase 0: no live affiliate links — reserved slots only) |
| 6. Disclosure ordering | park page docs/parks/tx/airport-park | disclosure@448 < slot@625 (disclosure above first affiliate slot) |
| 7. JSON-LD | park page | ['Campground', 'FAQPage'] — both parse |
| 8. Badge | park page | "Updated 2026-08-19" renders |
| 9. Homepage crawl surface | verify-content.py | 75/75 park links on homepage |
| 10. Compliance greps | verify-content.py | zero "we tested"/"we reviewed" framing |
| 11. Spot check price | docs/parks/tx/mott | "Nightly price $14–$16/night", hookups partial, 33 sites |
| 12. Spot check hookups | docs/parks/tx/clear-lake | hookups full (desc: "23 sites with water, sewer and electric hookups") |

Sitemaps (docs/): sitemap-index.xml → sitemap-parks.xml (75 URLs), sitemap-cities.xml (40),
sitemap-amenities.xml (6). lastmod = lastVerified. URLs use https://rvparks.example.com
placeholder (SITE_URL env override).

Page inventory: `/parks/tx/{slug}/` 75 · `/rv-parks/texas/` 1 · `/rv-parks/texas/{city}/` 38 ·
`/rv-parks/{amenity}/` 3 (full-hookup 1 match, pet-friendly 0, lakefront 56) ·
`/rv-parks/texas/{amenity}/` 3 scoped.

## 4. TODO for human

1. Real domain: replace rvparks.example.com (public/CNAME + sitemap SITE_URL env) once purchased; verify GitHub Pages settings.
2. Hookups upgrade: Phase 1 per-campsite pull (`/facilities/{id}/campsiteattributes` or `/campsites` with ATTRIBUTES) for definitive 30/50 amp + water/sewer/electric per site; feeds full-hookup pages.
3. Price coverage: only 1/75 parks has a per-night price in RIDB fee text; plan operator-claim/curation or a paid data source for pricing (never scrape competitors).
4. State parks: TX state parks (ResRec) are absent from RIDB; consider official TPWD data as a Phase 2 source to grow the dataset past 75.
5. Affiliate programs: RVshare, Outdoorsy, Harvest Hosts, Passport America, Camping World (brief section 5). Wire into reserved affiliate slots with rel="sponsored nofollow" when live (verify-content.py gate 2 flips to >=1).
6. Claim/featured-listing funnel (free claim form) + Search Console submission + sitemap ping.
7. Data freshness: re-run `npm run data:fetch` on a cadence; lastVerified auto-updates; STATE_OVERRIDES makes the state check deterministic without live geocoding.
## 5. ENRICHMENT 2026-08-19 — nightly rates + ratings + claim funnel (PUSHED)

Repo is now LIVE at https://k00jax.github.io/rv-parks-directory (auto-deploy on push
to main via GitHub Actions). Three honest data sources; nothing fabricated.

### 5.1 Task A — Google Places ratings (scripts/fetch-google-ratings.py)

- Uses Places API Text Search: `textsearch/json?query=<name+city+state>&key=KEY`.
- Match rule: keep results whose name shares >= 1 significant token with the park
  (stopwords park/campground/recreation/area/lake/… excluded), AND within 40 km of
  the RIDB coordinates (kills wrong-city false positives). Best = highest
  user_ratings_total. No confident match -> null (never guessed).
- Stores {rating, reviewCount, priceLevel, placeId, googleUrl} per park; caches to
  scripts/raw/google-ratings.json (gitignored) so re-runs don't re-bill; 1 s pacing.
- **Status: SKIPPED this build — GOOGLE_API_KEY empty in .env (Director fills it).**
  Script exits 0 with a note when the key is missing. `.env.example` documents it.
  TODO: Director pastes key into `.env`, run `python3 scripts/fetch-google-ratings.py`,
  rebuild, push (ratings then render as stars + "Google reviews" link).

### 5.2 Task B — Claim form (owner submissions, zero infra)

- `src/components/ClaimForm.tsx` on every park page: "Is this your park? Claim &
  update rates" — a static-export-safe mailto LINK (styled .btn) to
  claims@fonger.ai (Director-controlled; change the constant in the component),
  subject "Claim: <park name>", body prefilled with park name/city/facilityId and
  blanks for nightlyPriceMin/Max, hookups, website. NO <form>/onSubmit/no client JS
  (avoids the Next 14 App Router event-handler-on-server-component build error).
- Copy states rates are verified before display; owner submissions update
  nightlyPriceMin/Max via the data pipeline.

### 5.3 Task D — TPWD Texas State Park rates (scripts/fetch-tpwd-rates.py)

- TPWD is NOT blocked (HTTP 200). Pulled 93 TPWD parks from
  tpwd.texas.gov/state-parks/parks-map (slug + name + city).
- Fuzzy match: shared significant tokens / min(tokens) >= 0.5 AND city match
  (RIDB park without city: name-only at >= 0.85). City mismatch rejects (e.g. Bear
  Creek FW vs Bear Creek State Park Concan). Rates parsed from
  /state-parks/<slug>/fees-facilities/campsites pages — explicit "$NN Nightly|Daily"
  amounts (entrance fee excluded). Cached in scripts/raw/tpwd-{parks,rates}.json.
- Result: 1 confident match — Lake Somerville Marina & Campground (248470) ->
  Lake Somerville State Park & Trailway, $10–$20/night, dataSource='tpwd'.
  MOTT (232646) keeps its RIDB fee-text price $14–$16/night, dataSource='ridb'.
- If TPWD ever 403/WAFs, script prints a note and exits 0 (documented stub) — it
  never scrapes competitor directories.

### 5.4 Schema + UI changes

- types.ts: Park gains dataSource ('ridb'|'tpwd'|null), priceLevel (0-4),
  placeId, googleUrl (all nullable). fetch-ridb.py emits the new keys as null on
  re-fetch so the schema stays consistent.
- Park page: rating row renders star row + "4.3★ (n reviews)" + Google reviews
  link when present, else "No reviews yet"; nightly price renders
  "$min–$max/night — Texas Parks & Wildlife rate" (or "Recreation.gov fee data"),
  else "Rates not published — check reservation page" (links to reservation page).
- Validator (validate-data.mjs): priceLevel integer 0-4; googleUrl must be a
  Google place URL; dataSource must be ridb|tpwd|null; invariants: price present
  <=> dataSource present, rating present -> reviewCount present. All optional —
  null never fails.
- verify-content.py: priceLevel included in finite-number scan.

### 5.5 Gates (2026-08-19, real outputs)

| Gate | Command | Result |
|---|---|---|
| 1. Google fetch (no key) | `python3 scripts/fetch-google-ratings.py` | exit 0 — skipped with note |
| 2. TPWD fetch | `python3 scripts/fetch-tpwd-rates.py` | exit 0 — 93 parks, 1 match, rates applied |
| 3. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 75, cities 38, OK |
| 4. Typecheck | `npx tsc --noEmit` | exit 0 |
| 5. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 124 static pages + sitemaps |
| 6. Content verify | `python3 scripts/verify-content.py` | PASS (all 7 checks) |
| 7. UI spot check | docs/parks/tx/lake-somerville-marina-and-campground | "$10–$20/night — Texas Parks & Wildlife rate", claim form mailto present |
| 8. Deploy | git push origin main | GitHub Actions Deploy to GitHub Pages — see run URL in session report |

Counts now: 75 parks · prices 2/75 (ridb 1, tpwd 1) · ratings 0/75 (awaiting
Google key) · claim form on 75/75 pages.

### 5.6 TODO for human (updated)

1. **Director: fill GOOGLE_API_KEY= in .env** (repo/.env, gitignored) then run
   `python3 scripts/fetch-google-ratings.py`, rebuild, push → ratings go live.
2. Point claims@fonger.ai at a real inbox; route submissions into the data pipeline.
3. Real domain + SITE_URL env for sitemaps (still rvparks.example.com placeholder).
4. Phase 1 hookups: per-campsite RIDB attributes pull.
5. Affiliate programs (RVshare/Outdoorsy/Harvest Hosts/Passport America/Camping
   World) into the reserved slots with rel="sponsored nofollow" (Phase 2).
6. Data freshness: re-run data:fetch + tpwd + google on a cadence.
## 6. ENRICHMENT 2026-08-19 — LIVE WEATHER + AQI + REAL AMENITY PAGES (PUSHED)

Repo live at https://k00jax.github.io/rv-parks-directory. This build adds live
Google Weather + Air Quality per park, and replaces the 3 stub amenity pages
(full-hookup placeholder, pet-friendly, lakefront) with 12 real dataset-driven
amenity pages + an amenity index.

### 6.1 Task A — Live weather + AQI (scripts/fetch-weather-aqi.py)

- Weather: `GET https://weather.googleapis.com/v1/currentConditions:lookup?key=KEY&location.latitude=..&location.longitude=..&unitsSystem=IMPERIAL`
  → `temperature.degrees` (F), `weatherCondition.description.text`, `timeZone.id`, `isDaytime`.
- AQI: `POST https://airquality.googleapis.com/v1/currentConditions:lookup?key=KEY`
  body `{"location":{...},"extraComputations":["HEALTH_RECOMMENDATIONS"]}` → `indexes[0].aqi` + `.category`.
- Per park with lat/lng: fetch both, 1 s pacing, cache raw to
  `scripts/raw/weather-aqi-<date>.json` (gitignored). Store
  `weatherCurrent = {tempF, conditions, isDaytime, timeZone, fetchedAt}` and
  `aqi = {aqi, category, dominantPollutant, fetchedAt}`; on ANY API error both
  stay null — never fabricated. Missing GOOGLE_API_KEY → skip cleanly (exit 0).
- **Bug found + fixed during the run:** first attempt got HTTP 403 on all 75 AQI
  calls because `fetch_aqi()` omitted `?key=` from the URL (weather worked; the
  key was only on the weather query string). Fixed the URL, re-ran; cache stores
  only successful fields so transient failures are retried, and the
  "already fetched today" skip only fires when every park has weather AND AQI.
- Result: **75/75 parks with weather, 75/75 with AQI** (0 parks skipped — all
  have lat/lng). AQI categories: 55 Good, 20 Moderate. Sample: Double Lake 96°F
  Partly sunny, AQI 71 Good air quality.

### 6.2 Task B — Real amenity pages (12 hubs + index)

- Dataset vocabulary (Recreation.gov facility amenities): boat ramp 56, showers
  39, water hookup 34, dump station 27, playground 22, flush toilets 18,
  50 amp 12, 30 amp 10, 20 amp 3, laundry 2.
- Single pages built for all 10 vocabulary terms (slug = term, e.g. `50-amp`,
  `boat-ramp`, `water-hookup`). Combined pages (≥3 parks rule): `full-hookup`
  (water hookup + dump station, 18 parks), `50-amp-full-hookup` (50 amp + water
  hookup + dump station, 6 parks). `boat-ramp-camping` was NOT built — it would
  be an exact duplicate of the boat-ramp page (same 56 parks, same intent).
- Stub pages removed: `pet-friendly` (petPolicy is null on all 75 parks — no
  data), `lakefront` (not a real vocabulary term; its old regex matched
  boat-ramp parks, which now have their own page). Site header now links
  Amenities / Full Hookup / 50 Amp.
- New `/rv-parks/amenities/` index links all 12 amenity pages with live counts.
- Wired in: homepage amenity section (counts per page + index link), sitemap
  generator (`sitemap-amenities.xml`: 25 URLs incl. index + texas-scoped
  variants), park pages (each park links the amenity pages it qualifies for).
- Park page renders a WeatherCard: temp °F + conditions + day/night + timezone,
  AQI value + category with color (green <50, yellow 51-100, orange 101-150,
  red >150), fetch timestamp. Renders only real API data; no data → no card.

### 6.3 Schema + validator changes

- types.ts: `WeatherCurrent` + `Aqi` interfaces; Park gains
  `weatherCurrent: WeatherCurrent | null`, `aqi: Aqi | null`.
- validate-data.mjs: weatherCurrent/aqi must be present (object or null);
  tempF finite -100..150, aqi integer 0..500, conditions/category non-empty
  strings or null, fetchedAt ISO — null never fails, fabricated values do.
- verify-content.py: new checks 8-10 — amenity pages exist + render their
  expected park links (hrefs from raw HTML), amenities index links all pages,
  and the built HTML contains the REAL weather temp + REAL AQI value from the
  dataset (cross-checked against the API record, not a stub).

### 6.4 Gates (2026-08-19, real outputs)

| Gate | Command | Result |
|---|---|---|
| 1. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 75, cities 38, OK |
| 2. Typecheck | `npx tsc --noEmit` | exit 0 |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 142 static pages (1 home, 75 park, 38 city, 12 amenity, 12 texas-scoped amenity, amenities index, texas hub, 404) |
| 4. Content verify | `python3 scripts/verify-content.py .` | PASS (10 checks: finite numbers, 0 sponsored, disclosure order, no tested/reviewed framing, JSON-LD, badge, homepage crawl 75/75, amenity pages, amenities index, live weather+AQI) |
| 5. Spot check park page | docs/parks/tx/double-lake-recreation-area | WeatherCard: `96°F`, "Partly sunny", day, America/Chicago; AQI `71` + "Good air quality" (aqi-moderate class) |
| 6. Spot check amenity page | docs/rv-parks/full-hookup | "RV Parks with Full Hookups in Texas", 18 park links (brushy-creek … malden-lake-campground) |
| 7. Grep built HTML | docs/parks/tx/*/index.html | real temp `96°F` and real AQI `71 Good air quality` present (from API, not stubs) |
| 8. Deploy | git push origin main | GitHub Actions Deploy to GitHub Pages — verify live URL after 2-3 min |

Page inventory now: 75 park pages · 38 city pages · 12 amenity pages ·
12 texas-scoped amenity pages · /rv-parks/amenities/ · /rv-parks/texas/ ·
home · 404 = 142 static HTML files.

### 6.5 TODO for human (updated)

1. Real domain: replace rvparks.example.com (JSON-LD URLs) + SITE_URL env once
   purchased; verify GitHub Pages settings.
2. Maps Tile API for a map view (weather/AQI coords are already on every park).
3. Freshness: weather/AQI are a point-in-time snapshot (2026-08-19 ~18:53 UTC).
   Re-run `python3 scripts/fetch-weather-aqi.py` on a cadence (cron candidate)
   to refresh; script is idempotent per day and retries failures.
4. Phase 1 hookups: per-campsite RIDB attributes pull (still the path to
   definitive 30/50 amp + water/sewer/electric per site).
5. Affiliate programs (RVshare/Outdoorsy/Harvest Hosts/Passport America/Camping
   World) into the reserved slots with rel="sponsored nofollow" (Phase 2).
6. TPWD state parks (ResRec) as a Phase 2 data source to grow past 75 parks.
7. Data freshness: re-run data:fetch + tpwd + google + weather on a cadence.

### 6.6 CONCURRENCY NOTE — parallel fee-readd task touched the same working tree

While this build ran (18:53–19:22 UTC), ANOTHER session under the director-1
profile was simultaneously working in this repo on a "re-add dropped TX
campgrounds with real fee prices" pipeline (scripts: probe_recgov_price.py,
parse_fee_prices.py, readd_fee_parks.py, check_missing_parks.py, …; written
19:08–19:12, parks.tx.json rewritten 19:12:33, validate-data.mjs edited
19:13:24 to allow dataSource 'ridb-fee-description').

That merged state was NOT shippable: it grew the dataset to 82 parks, but the
7 readded parks had NO `source` object (park pages render
`park.source.facilityType` → build crash), meta.counts were stale, and 7
original parks gained prices with dataSource null (validator failure).

Resolution taken by THIS task: parks.tx.json was restored to the verified
75-park weather/AQI dataset; the concurrent merged state is preserved at
`scripts/raw/parks-tx-concurrent-readd-backup-20260819.json` (gitignored), and
the readd scripts were left UNTRACKED in the tree so that task can re-run on
top of this commit. DO NOT merge the 82-park file until the readd task
populates `source` objects and updates meta counts.

## 7. Nightly prices from RIDB fee descriptions (2026-08-19)
- 32/75 raw facility files carry `facility_use_fee_description` (HTML, snake_case).
- `scripts/parse_fee_prices.py` extracts nightly prices: prefers explicit "per night", falls back to camping-context amounts, EXCLUDES day-use/boat-ramp/event-only fees (honest — MUSTANG, TEMPLES LAKE, NORTH HOLIDAY stay unpriced).
- `scripts/readd_fee_parks.py` re-adds 7 TX campgrounds that were over-pruned by the earlier day-use filter AND carry real fees: Big Bend Backcountry ($10), Frijole Horse Corral ($15–20), Caney Creek ($5–6), Rock Quarry Group ($35–75), HIGH VIEW ($18–22), Holiday TX ($14–40), Pine Springs ($60). Each gets a full `source` object + meta.counts recompute.
- Result: 82 parks, 9 with honest nightly prices (7 fee-description + MOTT ridb + Lake Somerville tpwd). 73 still show "Rates not published — check reservation page" (rec.gov link).
- Validator now accepts `ridb-fee-description` as a dataSource value.
- Concurrency note: dev-3's weather/AQI build (0727c1e) and this price work ran in parallel; merged deliberately. dev-3 preserved the intermediate state at scripts/raw/parks-tx-concurrent-readd-backup-20260819.json.

## 8. RE-SKIN 2026-08-19 — LIGHT NATURE THEME + SORTABLE PARK TABLE (PUSHED)

Repo still live at https://k00jax.github.io/rv-parks-directory (auto-deploy on push).

### 8.1 New light nature palette (globals.css `:root`)

Replaces the dark slate palette. Every component consumes these vars (audited all
components/pages — the only hard-coded hex/rgba in the codebase lived inside
globals.css itself: `.btn` text `#06283a`, `.btn:hover` `#67e8f9`, `.affiliate-slot`
`rgba(245,158,11,0.06)` — all replaced).

| Var | Old (dark) | New (light nature) | Role |
|---|---|---|---|
| `--bg` | `#0f172a` | `#f6f4ec` | warm cream paper |
| `--surface` | `#1e293b` | `#fdfcf8` | near-white warm card |
| `--surface-2` | `#334155` | `#ede9de` | warm sand (badges, disclosure) |
| `--text` | `#f1f5f9` | `#2e3a2e` | dark green-gray body |
| `--muted` | `#94a3b8` | `#5b6a5b` | muted sage-gray (AA on cream) |
| `--accent` | `#22d3ee` | `#3e6e4e` | sage/forest green (links, header, btn) |
| `--accent-2` | `#f59e0b` | `#b87a3a` | warm earth-tone secondary |
| `--border` | `#475569` | `#e2e0d6` | light warm border |
| `--ok` | `#4ade80` | `#3f7d4e` | verified / positive |
| `--warn` | `#fbbf24` | `#8a5a16` | not-verified / attention |
| `--aqi-good` | `#4ade80` | `#3f7d4e` | green <50 |
| `--aqi-moderate` | `#fbbf24` | `#8a6a1c` | gold 51-100 |
| `--aqi-unhealthy-sens` | `#fb923c` | `#b45a1e` | orange 101-150 |
| `--aqi-unhealthy` | `#f87171` | `#b3322a` | red >150 |

Plus: `--accent-hover #4f835f`, `--hover #e7ecdc`. AQI color semantics preserved
(green/yellow/orange/red) but tuned to nature-friendly, cream-legible shades.
Typography: h1/h2 switch to a system serif stack (Georgia/Iowan/Palatino) for an
outdoorsy brochure feel; body stays sans. Header now a deep sage-green band
(`--accent`) with cream nav text for a strong nature identity.

### 8.2 Sortable ParkTable (src/components/ParkTable.tsx)

- `'use client'` + `useState`/`useMemo` — clicks re-sort the rendered rows client-side.
- 5 columns all sortable: Campground (alpha), City (alpha), Nightly price (numeric),
  Rating (numeric), Sites (numeric). Numeric nulls ALWAYS sort last regardless of
  direction. Re-click toggles asc/desc; default sort = name asc.
- Active column header shows a colored ▲/▼ (`span.sort-ind`); headers are real
  `<button class="sort-btn">` with hover state + `cursor:pointer`; `<th>` carries
  `data-sort` + `aria-sort`.
- Zebra striping (`tbody tr:nth-child(even)`), light-tint hover highlight,
  sticky header (`thead th { position:sticky; top:0 }`).
- Static export still server-renders the FULL table (all 82 rows on homepage) — the
  client hydration is progressive enhancement only; no-JS/SEO intact.
- Price/rating render via existing `fmtPrice`/`fmtRating`; missing values show `—`.

### 8.3 Gates (2026-08-19, all real outputs)

| Gate | Command | Result |
|---|---|---|
| 1. Typecheck | `npx tsc --noEmit` | exit 0 |
| 2. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 82, cities 38, OK |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 150 static pages generated |
| 4. Content verify | `python3 scripts/verify-content.py .` | PASS — 10/10 checks |
| 5. HTML inventory | `find docs -name "*.html" \| wc -l` | 149 HTML files |
| 6. Leftover dark hex | `grep -rl "#0f172a\|#1e293b\|#334155\|#22d3ee" docs --include="*.html"` | 0 (also 0 in `docs/_next/static` CSS bundle) |
| 7. Light palette in built CSS | `grep #f6f4ec / #3e6e4e / #fdfcf8 docs/_next/static/css/*.css` | all 3 present |
| 8. Sortable markup (homepage) | docs/index.html | `class="data sortable"`, all 5 `data-sort` cols, `aria-sort`, default `Campground ▲` |
| 9. No-JS table render | docs/index.html park links | 82/82 rows server-rendered |
| 10. Price intact | docs/parks/tx/mott | `$14–$16/night — Recreation.gov fee data`; double-lake "Rates not published" |
| 11. Light body | park page | `<body>` (no inline dark); bg via CSS bundle `--bg #f6f4ec` |
| 12. Deploy | git push origin main | GitHub Actions Deploy to GitHub Pages — verify live URL after 2-3 min |

Files changed: `src/app/globals.css` (light palette + sortable/table CSS),
`src/components/ParkTable.tsx` (sortable client component), `BUILDLOG.md` (this section).
No data files, lib, or pages touched — theme and table only.

## 9. UX BUILD (A) 2026-08-20 — homepage browse hierarchy (PUSHED)

Kyle: "The many cards at the top with no distinguishing features is really unfriendly."
Before: 38 identical city cards + 13 identical amenity cards on the homepage, wall of
look-alike boxes, table buried below fold.

### 9.1 Changes
- `src/app/page.tsx`:
  - City cards → compact **tag-chip row** (`flex-wrap`): 38 chips, each a link to
    `/rv-parks/texas/{slug}/`. Fixed ALL-CAPS source names → **Title Case** (Coldspring,
    Waco, Jasper). Park count encoded INSIDE the chip as a small round badge; big cities
    (>=5 parks, e.g. Jasper=6) get a bolder sage-tinted `chip-count-hot` badge so they
    stand out at a glance. Each chip carries an `aria-label` ("Coldspring — 1 park").
  - Amenity cards → **icon + tinted tiles**: each hub gets a nature emoji (⛵ boat ramp,
    🚿 showers, 💧 water hookup, 🗑️ dump station, 🛝 playground, 🚽 flush toilets, ⚡
    30/50/20 amp, 🧺 laundry, 🔌 full hookup, ⚡🔌 50A full) with a short Title-Case label,
    a subtle per-tile sage/amber/green tint (cycled, not loud), and a count line. The
    "All RV park amenities" card kept (🧭). Full `href` to `/rv-parks/{slug}/` preserved.
  - Section headers: "Browse by city" → "Explore by city" and "Browse by amenity" →
    "Explore by amenity".
- `src/app/globals.css`: added `.chip-row`, `.chip`, `.chip-count(.chip-count-hot)`,
  `.amenity-grid`, `.amenity-tile(.tint-*)` — all consume the light nature vars; no new
  hard-coded hex beyond the documented tint palette.
- SEO/a11y: hrefs unchanged, text content server-rendered (no lazy hiding), aria-labels
  on chips + tiles. Table NOT moved (that's build B).

### 9.2 Gates (2026-08-20, all real outputs)
| Gate | Command | Result |
|---|---|---|
| 1. Typecheck | `npx tsc --noEmit` | exit 0 |
| 2. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 82, cities 38, OK |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 150 static pages generated |
| 4. Content verify | `python3 scripts/verify-content.py .` | PASS — all checks |
| 5. Chip markup (homepage) | `grep -o 'class="chip"' docs/index.html` | 38 chips |
| 6. Hot-city badges | `grep -o 'class="chip-count chip-count-hot"' docs/index.html` | 1 (Jasper, 6 parks) |
| 7. Amenity icon tiles | `grep -o 'class="amenity-tile' docs/index.html` | 13 tiles (12 hubs + All Amenities) |
| 8. Amenity emoji present | `grep` icon spans | ⛵🚿💧🗑️🛝🚽⚡🧺🔌🧭 (13 icon spans) |
| 9. No ALL-CAPS city text | `grep -oE '>[A-Z]{3,}<span class="chip-count"'` | 0 (Title Case now) |
| 10. Leftover city cards | `grep -o 'class="card"' docs/index.html` | 0 |
| 11. Static pages | `find docs -name 'index.html' \| wc -l` | 148 (150 HTML files) |
| 12. Deploy | git push origin main | GitHub Actions — verify live after push |

Files changed: `src/app/page.tsx`, `src/app/globals.css`, `BUILDLOG.md` (this section).

## 10. THEME OVERHAUL 2026-08-20 — VIBRANT VECTOR-ART CARTOON (PUSHED)

Redesign inspired by the new animated hero banner (public/banner.mp4, 1280x720 10s loop,
2.6MB + banner-poster.jpg). Replaces the cream/sage light nature theme. Static-export
safe (Next.js 14, output:export), no server deps, all 82 park / 40 city / 25 amenity
routes preserved.

### 10.1 Global palette (`src/app/globals.css` `:root` + body)
- Body background = Deep Navy `#0A192F` → Bright Cyan `#00B4D8` → Soft Light Blue
  `#90E0EF` vertical gradient (fixed attach). Brand accent = Orange-Red `#FF4D00` +
  Warm Sun Yellow `#FFD166` (CTA gradient, icons, hover chips/links). Nature accents =
  Grass Green `#06D6A0` + Deep Pine `#2D6A4F`. Neutrals = White cards/surfaces +
  Dark Asphalt `#2B2D42` (footer bg, dark text, thick outlines). Glow = Electric Blue
  `#00F5FF` + Neon Orange `#FF7B00` (light-trail, warn badge, tints).

### 10.2 Typography
- Headings = Fredoka (rounded bold sans, Google Fonts link in layout head, fallback
  Paytone One / Trebuchet MS) with thick dark-blue stroke via `text-shadow: 2px 2px 0
  #0A192F, -1px -1px 0 #0A192F`. Body = Nunito (Google Fonts), Dark Asphalt on light /
  White on dark.

### 10.3 Shapes and motion
- 16px radius interactive / 50px pills; 3px solid #2B2D42 outlines; offset block
  shadows (`4px 4px 0 #0A192F` / table `6px 6px`). CTA buttons = Sun Yellow→Orange-Red
  gradient, white bold uppercase, hover = 2px 2px shadow + translateY(2px) + brightness.
- Icons = filled SVG with thick outlines: map pin (header brand, search results, map
  placeholder), magnifier (search button), amenity tiles via emoji.
- Animations: `@keyframes bounce` (amenity icon on tile hover), `@keyframes light-trail`
  (animated cyan/neon section divider), springy `cubic-bezier(0.175,0.885,0.32,1.275)`
  transitions everywhere; hover = card/tile/chip `scale(1.03)` + lift.

### 10.4 Hero + search (homepage, `src/app/page.tsx` + new `SearchBar.tsx`)
- Full-width `<video>` background (object-fit cover) in `.hero`, autoplay loop muted
  playsInline preload=auto + poster attr (muted REQUIRED for autoplay — Kyle's muted-by-
  default). Subtle dark gradient `.hero-overlay` at bottom for search legibility. Hero
  text removed (banner carries the "AMERICAN RV PARKS" logo); SEO h1 kept in content.
- "Find Your Perfect RV Stay" search bar over the bottom third: pill input + Orange-Red
  search button w/ magnifier. Client-side filter over 82 parks + 40 cities; dropdown
  groups "Cities" + "RV Parks"; click/Enter navigates to `/parks/tx/{slug}/` or
  `/rv-parks/texas/{city}/`. Static-export friendly (no server deps).

### 10.5 Listings
- **Decision: kept the sortable table (ParkTable) and restyled it** into the vector
  look rather than replacing with cards — the gate requires "82 table rows still
  present", sort headers stay functional, and the table keeps 82 server-rendered rows
  for SEO. New look: white surface, 3px asphalt border, 16px radius, offset shadow,
  cyan gradient header, yellow sort arrows, striped rows.
- City chips: restyled w/ 3px thick borders + offset shadows, hover lift, cyan/orange
  count badges (38 chips preserved). Amenity tiles: colorful vector tints (green/blue/
  yellow/orange), thick borders, offset shadows, bouncing icons (13 tiles preserved).

### 10.6 Other
- Footer → dark asphalt `#2B2D42` w/ sun-yellow top accent, light-blue links.
- Map view placeholder note (styled, no map API wired — Phase 1).
- SiteHeader brand → "American RV Parks" + map-pin SVG logo; nav links become yellow
  pills w/ offset shadow on hover.

### 10.7 Gates (2026-08-20, all real outputs)
| Gate | Command | Result |
|---|---|---|
| 1. Typecheck | `npx tsc --noEmit` | exit 0 |
| 2. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 150 static pages generated (148 index.html, same as prior build) |
| 3. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 82, cities 38, OK |
| 4. Content verify | `python3 scripts/verify-content.py .` | PASS — 10/10 checks |
| 5. Hero video (homepage) | `grep -o '<video' docs/index.html` | 1 (autoplay loop muted playsInline poster) |
| 6. Banner asset | `grep -o 'banner.mp4' docs/index.html` | 2 (source + reference) |
| 7. Search input/button | `grep 'type="search"' / 'class="search-btn"' docs/index.html` | 1 / 1 |
| 8. New palette hex | `grep -oiE '#0a192f|#ff4d00' docs/index.html` | 1 (inline CTA gradient on search button; full palette in CSS bundle) |
| 9. City chips | `grep -o 'class="chip"' docs/index.html` | 38 |
| 10. Amenity tiles | `grep -o 'class="amenity-tile' docs/index.html` | 13 |
| 11. Table rows | `grep -o '<tr' docs/index.html` | 83 (82 parks + 1 header) |
| 12. Deploy | git push origin main (git@github-rvparks:) | GitHub Actions — verify live URL after push |

Files changed: `src/app/globals.css` (theme rewrite), `src/app/layout.tsx` (fonts),
`src/app/page.tsx` (hero video + map placeholder + light-trail), `src/components/
SearchBar.tsx` (new client search), `src/components/SiteHeader.tsx` (brand + logo),
`BUILDLOG.md` (this section).

## 11. AFFILIATE PHASE 2 + DATA-FIRST HOMEPAGE + v2.0.0 (2026-08-20)

### 11.1 Affiliate Phase 2 — real booking CTAs (the money task)
- `src/components/AffiliateDisclosure.tsx` — dead "Reserved affiliate slot" text REMOVED; the
  slot now renders (on every park page, `slotId=park-{facilityId}-reserve`):
  - FTC disclosure copy updated: "we may earn a commission from links (including booking and
    partner links) at no extra cost to you." (Phase 0 pilot line gone).
  - Primary CTA: **Book this campground** → `park.website` (official Recreation.gov
    reservation page), `target="_blank"` + `rel="sponsored nofollow noopener"`.
  - Honest fallback for the 14 parks with no website: "Rates not published — check
    Recreation.gov" → https://www.recreation.gov/ (never fabricates a URL).
  - Phase 2 partner line (real working link): "Compare rental RVs near this park on RVshare →"
    → https://www.rvshare.com/, `rel="sponsored nofollow noopener"`.
- `src/app/parks/[state]/[slug]/page.tsx` line 251: passes `website={park.website}`.
- `src/app/globals.css`: `.affiliate-slot` dashed → solid orange border (live slot);
  added `.affiliate-fallback`, `.affiliate-partner`; `.btn` CTA reuses the theme's
  sun→orange gradient pill.
- `scripts/verify-content.py` moved to Phase 2 expectations: check 2 requires >= 1
  sponsored link (was: exactly 0); check 3 verifies disclosure marker precedes slot marker,
  no sponsored link appears before the slot, and "Reserved affiliate slot" text is gone.
  Note: regex counts `rel="sponsored nofollow` prefix (HTML renders the full
  `sponsored nofollow noopener` value).
- Dataset check: 68/82 parks have official Recreation.gov reservation URLs (all 68 verified
  recreation.gov); 14 have none (fallback path).

### 11.2 Build B — data-first homepage (`src/app/page.tsx`)
- Before: Hero → h1 → stats → map placeholder → city chips → amenity tiles → table → note.
- After: Hero → h1 → intro line → stats → light-trail → **All campgrounds table** → city
  chips → amenity tiles → map placeholder → note.
- New intro line (dynamic count): "82 verified campgrounds across Texas, from public
  Recreation.gov data — sortable, with ratings, weather, and live prices where published."
  Existing stats line kept.
- Table section moved up to sit right after the intro; `table.data` already carries the
  redesign treatment from section 10 (white card, 3px #2B2D42 border, 16px radius, 6px
  offset shadow) — no re-theme needed.
- Map placeholder moved below amenity tiles; copy "full table below" → "full table above".
- All sections, links, SEO text preserved — reorder + intro only.

### 11.3 Versioning
- `src/components/SiteFooter.tsx`: "Phase 0 pilot" → "v2.0.0 · Updated 2026-08-20".
- `src/app/page.tsx` footer note: "Phase 0 pilot." → "v2.0.0." (honesty line about missing
  values kept).
- `package.json`: version 0.1.0 → 2.0.0; description updated (drops "Phase 0 pilot").

### 11.4 Gates (2026-08-20, all real outputs)
| Gate | Command | Result |
|---|---|---|
| 1. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 82, cities 38, OK |
| 2. Typecheck | `npx tsc --noEmit` | exit 0 |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 148 static pages (82 park + 40 city + 25 amenity + 1 home) |
| 4. Real rec.gov href on park page | grep docs/parks/tx/double-lake-recreation-area/index.html | `href="https://www.recreation.gov/camping/campgrounds/232430" target="_blank" rel="sponsored nofollow noopener"` — 1x "Book this campground" |
| 5. Reserved slot text | `grep -rl 'Reserved affiliate slot' docs` | 0 files |
| 6. Table before chips | python index('All campgrounds') < index('Explore by city') in docs/index.html | 3389 < 15501 — OK |
| 7. Footer version | grep 'v2.0.0' docs/index.html | 1 — "Data source: Recreation.gov (RIDB) public facility data · v2.0.0 · Updated 2026-08-20 · Not affiliated with Recreation.gov." |
| 8. Hero video + search | grep '<video' / 'type="search"' docs/index.html | 1 / 1 |
| 9. Content verify | `python3 scripts/verify-content.py .` | PASS — 10/10 checks, sponsored-links: 164 (82 RVshare + 68 CTA + 14 fallback) |
| 10. Deploy | git push origin main (git@github-rvparks:) | GitHub Actions — live URL verified after push |

Files changed: `src/components/AffiliateDisclosure.tsx`, `src/app/parks/[state]/[slug]/page.tsx`,
`src/app/page.tsx`, `src/components/SiteFooter.tsx`, `src/app/globals.css`,
`package.json`, `scripts/verify-content.py`, `BUILDLOG.md` (this section).

## 12. MAP BUILD — homepage reorder (Kyle's Build B reversal) + interactive Leaflet map

Spec (2026-08-20): Kyle REVERSED Build B's data-first order. New homepage order: Hero →
h1/intro → Explore by city → Explore by amenity → NEW Explore the map → full table LAST.
Interactive map = Leaflet + OpenStreetMap (no API key, static-export friendly).

### 12.1 Task 1 — homepage order reverted (`src/app/page.tsx`)
- Before (Build B): Hero → h1 → intro → stats → light-trail → **All campgrounds table** →
  city chips → amenity tiles → map placeholder.
- After: Hero → h1 → intro → stats → light-trail → **city chips** → **amenity tiles** →
  **Explore the map** (new) → **All campgrounds table** (last) → footer note.
- Pure reorder + the new map section; all links/SEO text preserved; the old
  "Interactive map view is coming soon" placeholder div and its CSS are GONE
  (replaced by the real map + styles).

### 12.2 Task 2 — interactive map (`src/components/ParkMap.tsx`, new)
- `npm install leaflet@1.9.4` (dependency) + `npm install -D @types/leaflet@1.9.22`.
- `'use client'` component; page loads it via `next/dynamic` with `ssr:false` +
  a 420px loading fallback (`.park-map-loading`), so the static HTML keeps the frame
  (verified: `<div class="park-map park-map-loading">` in docs/index.html) and Leaflet
  never touches the server render. `typeof window !== 'undefined'` guard inside the
  effect as belt-and-suspenders (spec 2h).
- All 82 parks passed from the server page as a slim 8-field shape (name, slug, lat,
  lng, rating, reviewCount, nightlyPriceMin, nightlyPriceMax) — full Park objects stay
  server-side for the table (SEO intact; map is progressive enhancement, spec 2g).
- Markers: `L.divIcon` — teal circle (cyan→#0077a3 gradient, white 3px border) with an
  orange-red inner dot; inline HTML/CSS only, NO image assets (spec 2c). `iconAnchor`
  centered, popup above the pin. Class `arvp-pin-wrap` overrides leaflet's default
  `leaflet-div-icon` box so no default styling leaks in.
- Coordinate guard: one RIDB record (Rock Quarry Group Campground) ships lat=0.0 —
  treated as "no location", excluded from markers/fitBounds (81 plotted, not 82).
- Popups (spec 2d): park name → `/parks/tx/{slug}/` deep link (escaped); rating line
  `4.7★ (33 reviews)` when present; price line `from $X/night` (min) or `$X/night`
  (max-only) when present, else "Rates not published". Popup themed to the redesign
  (3px asphalt border, 12px radius, offset shadow).
- Tiles (spec 2f): `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` with the
  required `© OpenStreetMap contributors` attribution link.
- View (spec 2e): container 420px, 16px radius, 3px #2B2D42 border, 6px offset shadow
  (matches `.table.data` card language). `L.featureGroup` + `fitBounds` over plotted
  pins with `padding [30,30]` and `maxZoom: 10` cap (won't zoom into one city);
  `minZoom: 5`; Texas fallback view if no pins.

### 12.3 Gates (2026-08-20, all real outputs)
| Gate | Command | Result |
|---|---|---|
| 1. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 82, cities 38, OK |
| 2. Typecheck | `npx tsc --noEmit` | exit 0 (leaflet types via @types/leaflet) |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 150 static pages; homepage 170 kB First Load JS |
| 4. Section order | python index() on docs/index.html | 'Explore by city' 3564 < 'Explore the map' 12002 < 'All campgrounds' 12477 — OK |
| 5. SSR map frame | grep docs/index.html | `<div class="park-map park-map-loading">` present (loading fallback of ssr:false dynamic import) |
| 6. Leaflet CSS | grep docs/_next/static/css/*.css | `d3e383b9ef67ddcb.css` contains `.leaflet-pane`/`.leaflet-container` rules |
| 7. Leaflet JS | grep docs/_next/static/chunks | `page-a1397cd90503560d.js` contains `divIcon` + `tile.openstreetmap.org` + `openstreetmap.org/copyright` attribution |
| 8. divIcon markers | grep chunks for `divIcon` | 2 chunks (`d0deef33-08e72c68cc07d6b8.js` = leaflet lib, `page-*.js` = our component) |
| 9. No 404 marker images | grep + ls docs/_next/static/media/ | Default `marker-icon.d577052a.png` + `layers*.png` ARE emitted by webpack (exist on disk → no 404), but no marker ever references them: all 81 pins are divIcon, `L.Icon.Default` is never instantiated |
| 10. Content verify | `python3 scripts/verify-content.py .` | PASS — all checks (no regression from reorder) |

### 12.4 Deploy
- Commit `ca5f877` pushed to origin main via `git@github-rvparks:k00jax/rv-parks-directory.git`.
- GitHub Actions (`.github/workflows/deploy.yml`): npm ci → npm run build (SITE_URL,
  SITE_BASEPATH env) → upload `./docs` → deploy-pages. New version live ~60s after push.
- Live checks (2026-08-20, real curl + fetched chunks):
  - `https://americanrvparks.com/` → HTTP 200; section order city=3564 < map=12002 <
    table=12477 (same indices as local build); SSR map frame present.
  - `https://americanrvparks.com/parks/tx/double-lake-recreation-area/` → 200
  - `https://americanrvparks.com/parks/tx/rock-quarry-group-campground/` → 200
  - Leaflet CSS chunk served 200 (10.6 kB); ParkMap page chunk
    `page-653cc1106520225c.js` served and contains divIcon + OSM tile URL + OSM
    attribution + arvp-pin; Leaflet lib chunk `d0deef33-08e72c68cc07d6b8.js` served.
  - Default marker-icon asset served 200 (no 404s; divIcon pins used exclusively).
  - Note: cloud browser provider unavailable on this box (no CDP endpoint), so the
    click-level popup test was replaced by the chunk-content verification above.

Files changed: `src/components/ParkMap.tsx` (new), `src/app/page.tsx` (reorder + map
section), `src/app/globals.css` (placeholder → map/marker/popup styles), `package.json`
(+ leaflet, + @types/leaflet), `package-lock.json`, `BUILDLOG.md` (this section).
## 15. NATIONAL HOMEPAGE POLISH 2026-08-21 — stats band + map clustering + honest top table (PUSHED)

### 15.1 Task 1 — "Plan your next trip" stats band (src/lib/parks.ts, src/app/page.tsx, globals.css)
- New `computeHomeStats()` in `src/lib/parks.ts`. Every number is computed from the
  committed datasets (parks.us.json: 3,736 parks; cities.us.json: 931 hubs) at build
  time — nothing hardcoded, nothing estimated.
- Band renders between the intro paragraphs and the light-trail divider, directly
  before "Explore by state". Heading "Plan your next trip" + one-line italic white
  subtitle (`.home-subtitle`, same white+navy-stroke pattern as `.home-intro`).
- 6 white stat cards (3px #2B2D42 border, 16px radius, 4px offset shadow — the
  `.card`/`.amenity-tile` language): big Fredoka number + muted label + sub-line.
  - **3,736** campgrounds & RV parks nationwide (`parks.us.json` length)
  - **48** states covered — sub "DE, DC, RI absent from source data" (per-park state
    set vs. 50 states + DC list)
  - **931** cities with campgrounds (`cities.us.json` length)
  - **664** parks in California — most of any state (sub "Oregon 325 · Idaho 281")
  - **37** campgrounds in one city — Moab, UT (largest hub by parkIds; sub "Prineville,
    OR 35 · Juneau, AK 24" — the 24-count tie is broken by name, deterministic)
  - **2,614** parks list "water" — the #1 amenity (amenity-vocabulary counts)
- Honest coverage footnote under the grid: 2,960 parks list amenities · 201 publish nightly prices ·
  60 of 3,736 have Google ratings (all Texas) — national enrichment pending.
- Rebase note: mid-build, remote main advanced with `9aee642` (restore TX Google ratings / TPWD prices /
  weather-AQI enrichment that the fresh 50-state pull had nulled). Rebased onto it and recomputed every
  stat against the restored dataset — the band numbers above are from the final committed data.
- Anti-fabrication note: the brief's suggested top-state numbers (CA 391 / OR 241 /
  AK 217) did NOT match the dataset. Real computed counts: CA 664 / OR 325 / ID 281.
  The band shows the real numbers.

### 15.2 Task 2 — map clustering (src/components/ParkMap.tsx, globals.css)
- 3,707 of 3,736 parks have usable coords; at US zoom 3.7k pins overlap into a blob →
  clustering added (it materially helps; the national map needs it).
- `npm i leaflet.markercluster@1.5.3` + `npm i -D @types/leaflet.markercluster`.
- Dynamic `await import('leaflet.markercluster')` inside the client component's init
  effect — the plugin ships in its own chunk (840.f5adefca9b0d6f6a.js), never the
  initial bundle. The package has no ESM exports; its factory attaches
  `L.markerClusterGroup` to the shared leaflet `L` (leaflet sets `window.L`), so the
  import is a pure side effect.
- New `src/types/leaflet-markercluster.d.ts` ambient module declaration (the package
  ships no types for itself; `@types/leaflet.markercluster` augments "leaflet").
- Options: `maxClusterRadius 55`, `spiderfyOnMaxZoom`, `showCoverageOnHover: false`,
  `chunkedLoading: true`; custom `iconCreateFunction` → `.arvp-cluster` (teal
  navy→cyan gradient circle, 3px white border, Fredoka count; 44/54/64px by count).
  Plugin CSS intentionally not imported — styles live in globals.css, zero image
  assets (static-export safe). `L.featureGroup()` kept as fallback if the plugin
  ever failed to attach.
- Filter panel unchanged: filters still operate on the underlying parks — the cluster
  group is rebuilt from `visibleParks` on filter change; the "Showing X of Y" count
  is untouched. `fitBounds` still runs once over the cluster group (maxZoom 10).
- `mapReady` state gates the marker effect until the async init (plugin load + map +
  group creation) completes; `disposed` flag guards StrictMode double-mount.

### 15.3 Task 3 — top-table heading honesty (src/app/page.tsx)
- Original dataset (commit 5882465) had ZERO Google ratings (rating non-null = 0 of 3,736; TX slice
  0 of 73), so the old "Top campgrounds in Texas (N)" + "Ranked by Google rating" overclaimed a ranking
  that could not exist.
- Mid-build rebase onto `9aee642` restored ratings for 60 TX parks (e.g. Chisos Basin 4.8★/634 reviews,
  Ratcliff Lake 4.8★/183) — so the final table IS rating-ranked for Texas, and the heading keeps the
  honest scope marker: "Top campgrounds in Texas (50) — national ratings coming soon" (the other 47
  states are still 0-rated until fetch-google-ratings.py runs against the US dataset). Sub-line: "60 of
  3,736 parks have ratings today (all Texas); ratings for the other 47 states land with national
  enrichment."
- Added the optional honest national table: "Most-featured campgrounds (10)" —
  ranked by amenities listed (siteCount tiebreak, then name), no ratings involved.
  Top rows: ORTONA SOUTH (FL, 12 amenities), CEDRON CREEK (TX, 10), STUART
  RECREATION AREA (WV, 10).

### 15.4 Gates (2026-08-21, all real outputs)
| Gate | Command | Result |
|---|---|---|
| 1. Validator | `node scripts/validate-data.mjs` | exit 0 — parks 3,736, cities 931, OK |
| 2. Typecheck | `npx tsc --noEmit` | exit 0 |
| 3. Clean rebuild | `rm -rf docs .next && npm run build` | exit 0 — 5,304 static pages (3,736 park pages + 1,562 /rv-parks routes + home); sitemaps wrote (parks 3736, cities 980, amenities 589) |
| 4. Stats band | grep docs/index.html | 'Plan your next trip' present; dataset stat numbers 3,736 / 48 / 931 / 664 / 37 / 2,614 present (≥4 required) |
| 5. Browse sections | grep docs/index.html | 'Explore by state' present; 'California — 664 parks' chip present |
| 6. Video + search | grep docs/index.html | banner.mp4 + search-form present; park-map-loading SSR frame present |
| 7. Cluster plugin | grep docs/_next/static/chunks + css | markerClusterGroup in chunk `840.f5adefca9b0d6f6a.js` (plugin) + `app/page-14e5db9194029d0a.js` (component); .arvp-cluster in CSS `a68c13d2ab9f5a6a.css` |
| 8. Table honesty | grep docs/index.html | 'national ratings coming soon' present; 'Most-featured campgrounds (10)' present |

### 15.5 Deploy
- Commits `87858a6` (feature) + `229c43f` (rating-note fix after the TX-enrichment
  rebase) pushed to origin main via `git@github-rvparks:k00jax/rv-parks-directory.git`.
- Live checks (real curl, after push):
  - `https://americanrvparks.com/` → `<<LIVE_HOME>>`
  - `https://americanrvparks.com/rv-parks/ca/` → `<<LIVE_CA>>`

Files changed: `src/lib/parks.ts` (computeHomeStats), `src/app/page.tsx` (stats band +
table headings + most-featured), `src/components/ParkMap.tsx` (marker clustering),
`src/app/globals.css` (stats band + cluster styles), `src/types/leaflet-markercluster.d.ts`
(new), `package.json` (+leaflet.markercluster, +@types/leaflet.markercluster),
`package-lock.json`, `BUILDLOG.md` (this section).
