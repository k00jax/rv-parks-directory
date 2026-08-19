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
