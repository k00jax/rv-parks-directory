#!/usr/bin/env node
/**
 * validate-data.mjs — build-time dataset validator (runs before `next build`).
 * Fails the build with a clear message on any of:
 *  - required fields missing/empty
 *  - duplicate facilityIds or slugs
 *  - invalid lat/lng (present values must be finite + in range; no NaN anywhere)
 *  - impossible prices (negative, min > max), out-of-range ratings, negative counts
 *  - city hub references that don't resolve to a park in the dataset
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const errors = [];
const warnings = [];

function load(name) {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'data', name), 'utf8'));
}

let dataset, citiesData;
try {
  dataset = load('parks.tx.json');
  citiesData = load('cities.tx.json');
} catch (e) {
  console.error(`[validate] FATAL: could not read dataset: ${e.message}`);
  console.error('[validate] Run `node scripts/fetch-ridb.mjs` first.');
  process.exit(1);
}

const parks = dataset.parks;
if (!Array.isArray(parks) || parks.length === 0) {
  console.error('[validate] FATAL: parks.tx.json has no parks array.');
  process.exit(1);
}

const REQUIRED = ['facilityId', 'name', 'slug', 'state', 'lastVerified'];

const seenIds = new Map();
const seenSlugs = new Map();

for (const [i, p] of parks.entries()) {
  const where = `park[${i}] ${p.facilityId || p.name || '(no id)'}`;

  for (const field of REQUIRED) {
    const v = p[field];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      errors.push(`${where}: missing required field "${field}"`);
    }
  }

  if (typeof p.facilityId === 'string') {
    if (seenIds.has(p.facilityId)) errors.push(`${where}: duplicate facilityId "${p.facilityId}" (also park[${seenIds.get(p.facilityId)}])`);
    seenIds.set(p.facilityId, i);
  }
  if (typeof p.slug === 'string') {
    if (seenSlugs.has(p.slug)) errors.push(`${where}: duplicate slug "${p.slug}"`);
    seenSlugs.set(p.slug, i);
  }

  // lat/lng: finite numbers in range, or null. Never NaN.
  for (const [field, lo, hi] of [
    ['lat', -90, 90],
    ['lng', -180, 180],
  ]) {
    const v = p[field];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${where}: ${field} is not a finite number (${String(v)})`);
    } else if (v < lo || v > hi) {
      errors.push(`${where}: ${field} out of range (${v}, expected ${lo}..${hi})`);
    }
  }

  // numeric sanity
  for (const [field, op] of [
    ['nightlyPriceMin', (v) => v >= 0],
    ['nightlyPriceMax', (v) => v >= 0],
    ['siteCount', (v) => Number.isInteger(v) && v >= 0],
    ['rating', (v) => v >= 0 && v <= 5],
    ['reviewCount', (v) => Number.isInteger(v) && v >= 0],
    ['priceLevel', (v) => Number.isInteger(v) && v >= 0 && v <= 4],
  ]) {
    const v = p[field];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${where}: ${field} is not a finite number (${String(v)})`);
    } else if (!op(v)) {
      errors.push(`${where}: ${field} invalid value (${v})`);
    }
  }

  // enriched optional fields (null is fine; malformed values are not)
  if (p.dataSource !== null && p.dataSource !== undefined && !['ridb', 'tpwd'].includes(p.dataSource)) {
    errors.push(`${where}: dataSource invalid value "${p.dataSource}" (expected ridb|tpwd|null)`);
  }
  if (p.placeId !== null && p.placeId !== undefined && (typeof p.placeId !== 'string' || p.placeId.trim() === '')) {
    errors.push(`${where}: placeId must be a non-empty string or null`);
  }
  if (
    p.googleUrl !== null &&
    p.googleUrl !== undefined &&
    (typeof p.googleUrl !== 'string' || !p.googleUrl.startsWith('https://www.google.com/maps/place/?q=place_id:'))
  ) {
    errors.push(`${where}: googleUrl must be a Google place URL or null`);
  }

  // live weather/AQI snapshots (null = API unavailable; malformed values are not)
  const w = p.weatherCurrent;
  if (w !== null && w !== undefined) {
    if (typeof w !== 'object') {
      errors.push(`${where}: weatherCurrent must be an object or null`);
    } else {
      if (w.tempF !== null && w.tempF !== undefined && (typeof w.tempF !== 'number' || !Number.isFinite(w.tempF) || w.tempF < -100 || w.tempF > 150)) {
        errors.push(`${where}: weatherCurrent.tempF invalid (${String(w.tempF)})`);
      }
      if (w.conditions !== null && w.conditions !== undefined && (typeof w.conditions !== 'string' || w.conditions.trim() === '')) {
        errors.push(`${where}: weatherCurrent.conditions must be a non-empty string or null`);
      }
      if (typeof w.fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(w.fetchedAt || '')) {
        errors.push(`${where}: weatherCurrent.fetchedAt missing/invalid ("${w.fetchedAt}")`);
      }
    }
  } else if (!('weatherCurrent' in p)) {
    errors.push(`${where}: missing weatherCurrent field (null when unavailable)`);
  }
  const a = p.aqi;
  if (a !== null && a !== undefined) {
    if (typeof a !== 'object') {
      errors.push(`${where}: aqi must be an object or null`);
    } else {
      if (a.aqi !== null && a.aqi !== undefined && (typeof a.aqi !== 'number' || !Number.isFinite(a.aqi) || a.aqi < 0 || a.aqi > 500)) {
        errors.push(`${where}: aqi.aqi invalid (${String(a.aqi)})`);
      }
      if (a.category !== null && a.category !== undefined && (typeof a.category !== 'string' || a.category.trim() === '')) {
        errors.push(`${where}: aqi.category must be a non-empty string or null`);
      }
      if (typeof a.fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(a.fetchedAt || '')) {
        errors.push(`${where}: aqi.fetchedAt missing/invalid ("${a.fetchedAt}")`);
      }
    }
  } else if (!('aqi' in p)) {
    errors.push(`${where}: missing aqi field (null when unavailable)`);
  }

  // data hygiene invariants (never show a price without a source, etc.)
  const hasPrice = p.nightlyPriceMin !== null || p.nightlyPriceMax !== null;
  const hasSource = p.dataSource !== null && p.dataSource !== undefined;
  if (hasPrice && !hasSource) {
    errors.push(`${where}: nightly price present but dataSource is null`);
  }
  if (!hasPrice && hasSource) {
    errors.push(`${where}: dataSource "${p.dataSource}" set but no nightly price`);
  }
  if (p.rating !== null && p.rating !== undefined && (p.reviewCount === null || p.reviewCount === undefined)) {
    errors.push(`${where}: rating present but reviewCount is null`);
  }
  if ((p.reviewCount || 0) > 0 && (p.rating === null || p.rating === undefined)) {
    warnings.push(`${where}: reviewCount ${p.reviewCount} but rating is null`);
  }

  if (
    p.nightlyPriceMin !== null &&
    p.nightlyPriceMax !== null &&
    p.nightlyPriceMin > p.nightlyPriceMax
  ) {
    errors.push(`${where}: nightlyPriceMin (${p.nightlyPriceMin}) > nightlyPriceMax (${p.nightlyPriceMax})`);
  }

  // anti-fabrication: no invented values
  if (p.hookups !== null && !['full', 'partial', 'none'].includes(p.hookups)) {
    errors.push(`${where}: hookups invalid value "${p.hookups}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.lastVerified || '')) {
    errors.push(`${where}: lastVerified not an ISO date ("${p.lastVerified}")`);
  }

  if (p.state !== 'TX') warnings.push(`${where}: unexpected state "${p.state}" (pilot is TX-only)`);
}

// city hub references resolve
const parkIds = new Set(parks.map((p) => p.facilityId));
for (const c of citiesData.cities || []) {
  if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) {
    errors.push(`city hub "${c.name}": invalid slug "${c.slug}"`);
  }
  for (const id of c.parkIds || []) {
    if (!parkIds.has(id)) errors.push(`city hub "${c.name}": parkId "${id}" does not exist in dataset`);
  }
}
// every park with a city must appear in exactly its city hub
const parkToCity = new Map();
for (const c of citiesData.cities || []) {
  for (const id of c.parkIds) parkToCity.set(id, (parkToCity.get(id) || 0) + 1);
}
for (const p of parks) {
  if (p.city && !parkToCity.has(p.facilityId)) {
    errors.push(`${p.facilityId}: has city "${p.city}" but no city hub entry`);
  }
}

console.log(`[validate] parks: ${parks.length}, cities: ${(citiesData.cities || []).length}`);
if (warnings.length) {
  console.log(`[validate] warnings (${warnings.length}):`);
  for (const w of warnings.slice(0, 10)) console.log(`  ! ${w}`);
  if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
}

if (errors.length) {
  console.error(`[validate] FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('[validate] OK: dataset passes required-field, uniqueness, lat/lng, numeric, and city-reference checks.');
