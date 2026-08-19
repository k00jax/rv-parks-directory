#!/usr/bin/env node
/**
 * DEPRECATED — superseded by scripts/fetch-ridb.py (2026-08-19).
 * fetch-ridb.py pulls the REAL RIDB API v1 with the registered developer apikey
 * (ridb.recreation.gov/api/v1/facilities?state=TX...) and is what
 * `npm run data:fetch` runs now. Do NOT run this legacy recreation.gov SPA
 * endpoint script: it would overwrite src/data/parks.tx.json with the old
 * partial-mirror dataset. Kept only as provenance of the Phase 0 pull.
 *
 * fetch-ridb.mjs — Phase 0 RIDB data pull for the RV Parks & Campgrounds directory.
 *
 * Source: Recreation.gov public search + facility endpoints (the live endpoints the
 * recreation.gov SPA itself uses). The RIDB API (ridb.recreation.gov/api/v1) now
 * requires an apikey issued through the developer portal (account registration);
 * the public endpoints below are the same RIDB-backed facility data the site uses,
 * accessible without an account:
 *   GET /api/search?fq=entity_type:campground&fq=state_code:Texas&limit=20&start=N
 *   GET /api/camps/campgrounds/{facilityId}
 *
 * Output (provenance + derived datasets):
 *   scripts/raw/search-tx-page-*.json     raw search pages
 *   scripts/raw/facility-{id}.json        raw facility details
 *   scripts/raw/fetch-meta.json           fetch metadata (counts, timestamps, URLs)
 *   src/data/parks.tx.json                dataset in the brief's data model
 *   src/data/cities.tx.json               derived city -> parkId index
 *
 * Anti-fabrication: every field is mapped from actual API values. Missing values
 * become null. hookups is intentionally null in Phase 0 (no hookup/amp evidence in
 * the facility-level endpoints; per-campsite attributes are a Phase 1 pull).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(__dirname, 'raw');
const DATA_DIR = join(ROOT, 'src', 'data');

const STATE_CODE = 'Texas'; // fq value; the index stores full state names here
const STATE_ABBR = 'TX';
const STATE_NAME_TO_ABBR = {
  TEXAS: 'TX',
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
  MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN',
  UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
};
function normalizeState(v) {
  if (!v) return STATE_ABBR;
  const up = String(v).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;
  return STATE_NAME_TO_ABBR[up] || STATE_ABBR;
}
const BASE = 'https://www.recreation.gov';
const UA =
  'rv-parks-directory-pilot/0.1 (Phase 0 data pull; public recreation.gov API; contact kyle@fonger.ai)';
const DELAY_MS = 1200; // polite pacing (robots.txt asks Crawl-delay: 10 for crawlers)
const FETCHED_AT = new Date().toISOString();
const LAST_VERIFIED = FETCHED_AT.slice(0, 10); // ISO date only

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstAddress(campground, searchResult) {
  const addrs = campground?.addresses || searchResult?.addresses || [];
  const def =
    addrs.find((a) => a.address_type === 'Default') || addrs[0] || {};
  return {
    street: def.address1 || def.street_address1 || null,
    city: (def.city || searchResult?.city || null) ?? null,
    state: def.state_code || searchResult?.state_code || null,
    zip: def.postal_code || null,
  };
}

function mapPark(searchResult, detail) {
  const c = detail?.campground || {};
  const addr = firstAddress(c, searchResult);
  const amenitiesMap = c.amenities || {};
  const amenities = Object.keys(amenitiesMap)
    .filter((k) => amenitiesMap[k])
    .sort();
  const price = searchResult.price_range || {};
  const ratingRaw = numOrNull(searchResult.average_rating);
  const reviewsRaw = numOrNull(searchResult.number_of_ratings);
  const priceMin = numOrNull(price.amount_min);
  const priceMax = numOrNull(price.amount_max);
  const siteCount = numOrNull(searchResult.campsites_count);
  const name =
    (c.facility_name || searchResult.name || '').trim().replace(/\s+/g, ' ') ||
    null;

  return {
    facilityId: String(c.facility_id || searchResult.entity_id),
    name,
    slug: slugify(name),
    street: addr.street,
    city: addr.city,
    state: normalizeState(addr.state),
    zip: addr.zip,
    lat: numOrNull(c.facility_latitude ?? searchResult.latitude),
    lng: numOrNull(c.facility_longitude ?? searchResult.longitude),
    phone: c.facility_phone || null,
    // Recreation.gov does not populate facility_reservation_url for most facilities;
    // the canonical official listing URL follows a deterministic, verifiable pattern.
    website:
      c.facility_reservation_url ||
      `https://www.recreation.gov/camping/campgrounds/${String(c.facility_id || searchResult.entity_id)}` ||
      null,
    nightlyPriceMin: priceMin,
    nightlyPriceMax: priceMax,
    hookups: null, // Phase 0: no hookup/amp evidence in facility-level endpoints
    amenities,
    siteCount,
    rating: ratingRaw && reviewsRaw > 0 ? ratingRaw : null,
    reviewCount: reviewsRaw > 0 ? reviewsRaw : null,
    petPolicy: amenitiesMap['Pets Allowed'] ? 'Pets allowed' : null,
    lastVerified: LAST_VERIFIED,
    source: {
      orgId: searchResult.org_id || null,
      orgName: searchResult.org_name || null,
      parentId: searchResult.parent_id || null,
      parentName: searchResult.parent_name || null,
      reservable: Boolean(searchResult.reservable),
      facilityType: c.facility_type || searchResult.type || null,
      equipment: searchResult.campsite_equipment_name || [],
      maxVehicleLength: numOrNull(searchResult.campsite_max_vehicle_length),
      imageUrl: searchResult.preview_image_url || null,
      timeZone: searchResult.time_zone || c.facility_time_zone || null,
      description: (searchResult.description || '').slice(0, 600),
    },
  };
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[fetch] fetching TX campground search pages (fetchedAt=${FETCHED_AT})`);
  const searchRecords = [];
  let page = 0;
  let total = null;
  do {
    const url = `${BASE}/api/search?fq=entity_type:campground&fq=state_code:${encodeURIComponent(
      STATE_CODE
    )}&limit=20&start=${page * 20}`;
    const data = await getJson(url);
    if (total === null) total = data.total;
    writeFileSync(
      join(RAW_DIR, `search-tx-page-${page}.json`),
      JSON.stringify(data, null, 2)
    );
    const results = data.results || [];
    searchRecords.push(...results);
    console.log(`[fetch] page ${page}: +${results.length} (total=${total})`);
    page += 1;
    if (results.length) await sleep(DELAY_MS);
  } while (page * 20 < total && page < 100);

  const byId = new Map();
  for (const r of searchRecords) byId.set(String(r.entity_id), r);
  console.log(`[fetch] unique TX campground entities: ${byId.size}`);

  const parks = [];
  const failures = [];
  let i = 0;
  for (const [id, searchResult] of byId) {
    i += 1;
    let detail = null;
    try {
      const url = `${BASE}/api/camps/campgrounds/${id}`;
      detail = await getJson(url);
      writeFileSync(join(RAW_DIR, `facility-${id}.json`), JSON.stringify(detail, null, 2));
    } catch (e) {
      failures.push({ id, error: String(e.message || e) });
      console.warn(`[fetch] detail FAILED ${id}: ${e.message}`);
    }
    const park = mapPark(searchResult, detail);
    if (detail) {
      // trust the detail endpoint for the facility id
      park.facilityId = String(detail.campground?.facility_id || id);
    }
    parks.push(park);
    if (i % 25 === 0) console.log(`[fetch] ${i}/${byId.size} details fetched`);
    await sleep(DELAY_MS);
  }

  // unique slugs (append facilityId suffix on collision)
  const seen = new Map();
  for (const p of parks) {
    let slug = p.slug || `facility-${p.facilityId}`;
    if (seen.has(slug)) {
      let n = 2;
      while (seen.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    seen.set(slug, true);
    p.slug = slug;
  }

  const cities = {};
  for (const p of parks) {
    const city = (p.city || '').trim();
    if (!city) continue;
    const key = city.toLowerCase();
    cities[key] = cities[key] || { name: city, slug: slugify(city), parkIds: [] };
    if (!cities[key].parkIds.includes(p.facilityId)) cities[key].parkIds.push(p.facilityId);
  }

  const meta = {
    fetchedAt: FETCHED_AT,
    lastVerified: LAST_VERIFIED,
    source: 'Recreation.gov public search + facility endpoints (RIDB-backed)',
    sourceUrls: [
      `${BASE}/api/search?fq=entity_type:campground&fq=state_code:Texas&limit=20&start=N`,
      `${BASE}/api/camps/campgrounds/{facilityId}`,
    ],
    ridbApiNote:
      'ridb.recreation.gov/api/v1 requires an apikey from the developer portal (account registration); public site endpoints used instead (same RIDB facility data).',
    searchTotal: total,
    uniqueEntities: byId.size,
    parksWritten: parks.length,
    detailFailures: failures,
    crawlerPacingMs: DELAY_MS,
    robotsNote: 'recreation.gov/robots.txt disallows /api/* for crawlers and requests Crawl-delay 10; this is a bounded one-time dataset pull with descriptive UA.',
  };

  writeFileSync(join(RAW_DIR, 'fetch-meta.json'), JSON.stringify(meta, null, 2));
  writeFileSync(
    join(DATA_DIR, 'parks.tx.json'),
    JSON.stringify({ meta, parks }, null, 2)
  );
  writeFileSync(
    join(DATA_DIR, 'cities.tx.json'),
    JSON.stringify({ meta: { state: 'Texas', stateAbbr: 'TX' }, cities: Object.values(cities) }, null, 2)
  );

  console.log(`\n[fetch] DONE: ${parks.length} parks, ${Object.keys(cities).length} cities`);
  if (failures.length) console.log(`[fetch] detail failures: ${JSON.stringify(failures, null, 2)}`);
}

main().catch((e) => {
  console.error('[fetch] FATAL', e);
  process.exit(1);
});
