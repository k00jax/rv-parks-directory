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
