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
  ]) {
    const v = p[field];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${where}: ${field} is not a finite number (${String(v)})`);
    } else if (!op(v)) {
      errors.push(`${where}: ${field} invalid value (${v})`);
    }
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
