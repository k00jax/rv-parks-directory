import type { AmenityHub, CityDataset, CityHub, Park, ParkDataset } from './types';
import parksData from '../data/parks.us.json';
import citiesData from '../data/cities.us.json';

const parksDataset = parksData as ParkDataset;
const citiesDataset = citiesData as CityDataset;

export const parks: Park[] = parksDataset.parks;
export const cities: CityHub[] = citiesDataset.cities;

export const datasetMeta = parksDataset.meta;

export const STATE_ABBR = 'US';
export const STATE_NAME = 'United States';

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export function stateName(abbr: string): string {
  return STATE_NAMES[abbr.toUpperCase()] ?? abbr;
}

/** Parks in one state (abbr lowercase, e.g. 'tx'). */
export function parksInState(state: string): Park[] {
  const s = state.toUpperCase();
  return parks.filter((p) => p.state === s);
}

/** Cities in one state (abbr lowercase). */
export function citiesInState(state: string): CityHub[] {
  const s = state.toUpperCase();
  return cities.filter((c) => c.state === s);
}

export const stateAbbrs: string[] = Array.from(new Set(parks.map((p) => p.state))).sort();

export function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function getParkBySlug(slug: string): Park | undefined {
  return parks.find((p) => p.slug === slug);
}

export function getParksByCity(citySlug: string): Park[] {
  const hub = cities.find((c) => c.slug === citySlug);
  if (!hub) return [];
  return hub.parkIds
    .map((id) => parks.find((p) => p.facilityId === id))
    .filter((p): p is Park => Boolean(p));
}

export function getCitySlug(park: Park): string | null {
  if (!park.city) return null;
  const hub = cities.find((c) => c.name.toLowerCase() === park.city!.toLowerCase());
  return hub ? hub.slug : slugify(park.city);
}

// Nearest neighbors by haversine distance (same-state), used for internal linking.
export function neighbors(park: Park, count = 2): Park[] {
  const withDist = parks
    .filter((p) => p.facilityId !== park.facilityId && p.lat !== null && p.lng !== null)
    .map((p) => ({ p, d: haversine(park.lat, park.lng, p.lat, p.lng) }))
    .sort((a, b) => a.d - b.d);
  return withDist.slice(0, count).map((x) => x.p);
}

function haversine(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null
): number {
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Infinity;
  const R = 3958.8; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Amenity hubs (Family C). Driven by the REAL amenity vocabulary present in
// the parks dataset (Recreation.gov facility amenity data) — no invented terms.
// Single-amenity pages cover each vocabulary value; combined pages cover
// meaningful combinations that actually exist in the dataset (>=3 parks).
//
// NOTE: the US dataset uses its own RIDB amenity vocabulary (e.g. 'water',
// 'showers', 'restrooms', 'picnic tables', 'electric', 'sewer') which differs
// from the TX-only vocabulary ('water hookup', 'flush toilets', ...). The
// matchers below accept BOTH forms so hub counts never silently drop to 0.
const hasAmenity = (p: Park, ...words: string[]): boolean => {
  const ams = p.amenities ?? [];
  return words.some((w) => ams.includes(w));
};
// Some facilities carry amenity signals only in their description text (the
// US RIDB parse left 'boat ramp' out of the amenities array but the source
// description says it). Check both so hub counts stay honest.
const descHas = (p: Park, ...words: string[]): boolean => {
  const blob = ` ${p.name} ${(p.source?.description ?? '').toLowerCase()} `;
  return words.some((w) => blob.includes(w.toLowerCase()));
};
export const amenityHubs: AmenityHub[] = [
  // ---- single-amenity pages (every vocabulary term in the dataset) ----
  {
    slug: 'boat-ramp',
    title: 'RV Parks with Boat Ramp in the United States',
    description:
      'Campgrounds and RV parks in the United States with a boat ramp on site, from Recreation.gov facility amenity data. Great for anglers and boaters who want to launch within walking distance of their site.',
    match: (p) => hasAmenity(p, 'boat ramp', 'boat launch', 'boat landing') || descHas(p, 'boat ramp', 'boat launch', 'boat landing'),
  },
  {
    slug: 'waterfront',
    title: 'RV Parks on the Water in the United States',
    description:
      'Lakeside and riverside RV parks and campgrounds across the United States, from Recreation.gov facility descriptions. Park near the water — fishing, kayaking, and sunset views included.',
    match: (p) => descHas(p, 'waterfront', 'lakeside', 'riverside', 'on the water', "water's edge", 'shore of', 'shoreline', 'by the lake', 'beside the lake', 'along the river', 'on the lake', 'on the river', 'on the reservoir', 'waterfront sites', 'waterfront campsites'),
  },
  {
    slug: 'showers',
    title: 'RV Parks with Showers in the United States',
    description:
      'RV parks and campgrounds in the United States with shower facilities, from Recreation.gov facility amenity data. A hot shower after a long day on the road makes all the difference.',
    match: (p) => hasAmenity(p, 'showers', 'shower'),
  },
  {
    slug: 'water-hookup',
    title: 'RV Parks with Water Hookup in the United States',
    description:
      'RV parks in the United States with water hookups at campsites, from Recreation.gov facility amenity data. Skip the tank fills and camp with running water at your site.',
    match: (p) => hasAmenity(p, 'water hookup', 'water'),
  },
  {
    slug: 'dump-station',
    title: 'RV Parks with Dump Station in the United States',
    description:
      'RV parks and campgrounds in the United States with an on-site dump station, from Recreation.gov facility amenity data. Empty your tanks before the drive home without hunting for a service stop.',
    match: (p) => hasAmenity(p, 'dump station', 'rv dump', 'sewage disposal'),
  },
  {
    slug: 'playground',
    title: 'RV Parks with Playground in the United States',
    description:
      'Family-friendly RV parks and campgrounds in the United States with a playground, from Recreation.gov facility amenity data. Keep the kids entertained while you set up camp.',
    match: (p) => hasAmenity(p, 'playground'),
  },
  {
    slug: 'flush-toilets',
    title: 'RV Parks with Flush Toilets in the United States',
    description:
      'RV parks and campgrounds in the United States with flush toilets, from Recreation.gov facility amenity data. Real restrooms instead of vault toilets make campground life a lot more comfortable.',
    match: (p) => hasAmenity(p, 'flush toilets', 'restrooms', 'restroom'),
  },
  {
    slug: '50-amp',
    title: 'RV Parks with 50 Amp Service in the United States',
    description:
      'RV parks in the United States with 50-amp electrical service, from Recreation.gov facility amenity data. Run your air conditioner and high-draw appliances without tripping a breaker.',
    match: (p) => hasAmenity(p, '50 amp'),
  },
  {
    slug: '30-amp',
    title: 'RV Parks with 30 Amp Service in the United States',
    description:
      'RV parks in the United States with 30-amp electrical service, from Recreation.gov facility amenity data. The standard hookup for most travel trailers and motorhomes.',
    match: (p) => hasAmenity(p, '30 amp'),
  },
  {
    slug: '20-amp',
    title: 'RV Parks with 20 Amp Service in the United States',
    description:
      'RV parks in the United States with 20-amp electrical service, from Recreation.gov facility amenity data. Basic power for tent campers and small rigs.',
    match: (p) => hasAmenity(p, '20 amp'),
  },
  {
    slug: 'laundry',
    title: 'RV Parks with Laundry in the United States',
    description:
      'RV parks and campgrounds in the United States with on-site laundry facilities, from Recreation.gov facility amenity data. Pack lighter and wash clothes on the road.',
    match: (p) => hasAmenity(p, 'laundry'),
  },
  // ---- combined amenity pages (only combos that exist in the dataset) ----
  {
    slug: 'full-hookup',
    title: 'RV Parks with Full Hookups in the United States',
    description:
      'RV parks in the United States with full hookups — water plus sewer/electric at the campground, from Recreation.gov facility amenity data. The classic full-hookup setup for worry-free camping.',
    match: (p) =>
      hasAmenity(p, 'water hookup', 'water') &&
      (hasAmenity(p, 'dump station', 'rv dump', 'sewage disposal') || hasAmenity(p, 'sewer')),
  },
  {
    slug: '50-amp-full-hookup',
    title: 'RV Parks with 50 Amp Full Hookups in the United States',
    description:
      'RV parks in the United States with 50-amp service plus full hookups (water, sewer, electric), from Recreation.gov facility amenity data. The complete setup for big rigs: all the power, water, and tank service you need.',
    match: (p) =>
      hasAmenity(p, '50 amp') &&
      hasAmenity(p, 'water hookup', 'water') &&
      (hasAmenity(p, 'dump station', 'rv dump', 'sewage disposal') || hasAmenity(p, 'sewer')),
  },
];

// Amenity pages a given park qualifies for (used to link park pages -> amenity pages).
export function getAmenityHubsForPark(park: Park): AmenityHub[] {
  return amenityHubs.filter((a) => a.match(park));
}

export function getAmenityHub(slug: string): AmenityHub | undefined {
  return amenityHubs.find((a) => a.slug === slug);
}

// AQI color buckets (Google Universal AQI): green <50, yellow 51-100,
// orange 101-150, red >150. null = no AQI data (never display a color for it).
export type AqiLevel = 'good' | 'moderate' | 'unhealthy-sens' | 'unhealthy';

export function aqiLevel(aqi: number | null): AqiLevel | null {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) return null;
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy-sens';
  return 'unhealthy';
}

// Compact fetch timestamp, e.g. '2026-08-19 14:32 UTC' (null-safe).
export function fmtFetchedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[1]} ${m[2]}:${m[3]} UTC`;
}

// ---- display helpers (null-safe; unknown renders as '—', never invented) ----

export function fmtPrice(park: Park): string {
  if (park.nightlyPriceMin === null && park.nightlyPriceMax === null) return '—';
  if (park.nightlyPriceMin !== null && park.nightlyPriceMax !== null) {
    if (park.nightlyPriceMin === park.nightlyPriceMax) return `$${park.nightlyPriceMin}/night`;
    return `$${park.nightlyPriceMin}–$${park.nightlyPriceMax}/night`;
  }
  return `$${(park.nightlyPriceMin ?? park.nightlyPriceMax) ?? ''}/night`;
}

export function fmtRating(park: Park): string {
  if (park.rating === null || park.reviewCount === null) return '—';
  return `${park.rating.toFixed(1)}★ (${park.reviewCount} reviews)`;
}

// Visual star row for a Google rating (0-5). Rounded to the nearest whole
// star; the exact numeric rating renders next to it.
export function fmtStars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// Human label for where a park's nightly price came from (never invented).
export function fmtPriceSource(park: Park): string {
  if (park.dataSource === 'tpwd') return 'Texas Parks & Wildlife rate';
  if (park.dataSource === 'ridb') return 'Recreation.gov fee data';
  return '';
}

export function fmtSiteCount(park: Park): string {
  if (park.siteCount === null) return '—';
  return `${park.siteCount} sites`;
}

export function fmtPhone(park: Park): string {
  if (!park.phone) return '—';
  return park.phone;
}

// ---- homepage stats band ("Plan your next trip") ----
// Every number below is computed from the committed datasets at build time
// (parks.us.json + cities.us.json). Nothing is hardcoded or estimated —
// the band renders exactly what the data says, including honest coverage
// gaps (e.g. withRating = 0 while Google enrichment is pending).
export interface HomeStats {
  totalParks: number;
  statesWithParks: number;
  /** US states/districts with no parks in the source (honest gap note). */
  statesMissing: string[];
  totalCities: number;
  topStates: { abbr: string; count: number }[];
  largestCity: { name: string; state: string; count: number } | null;
  topCities: { name: string; state: string; count: number }[];
  withAmenities: number;
  withPrice: number;
  /** Parks with a Google rating AND at least one review (0 until enrichment lands). */
  withRating: number;
  mostCommonAmenity: { amenity: string; count: number } | null;
}

// All 50 states + DC (the 51 entries the US dataset is expected to cover).
const US_STATES_51: string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
  'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export function computeHomeStats(): HomeStats {
  const byState = new Map<string, number>();
  const amenityCounts = new Map<string, number>();
  let withAmenities = 0;
  let withPrice = 0;
  let withRating = 0;

  for (const p of parks) {
    byState.set(p.state, (byState.get(p.state) ?? 0) + 1);
    const amens = p.amenities ?? [];
    if (amens.length > 0) withAmenities += 1;
    if (p.nightlyPriceMin !== null || p.nightlyPriceMax !== null) withPrice += 1;
    if (p.rating !== null && (p.reviewCount ?? 0) > 0) withRating += 1;
    for (const a of amens) amenityCounts.set(a, (amenityCounts.get(a) ?? 0) + 1);
  }

  const topStates = [...byState.entries()]
    .map(([abbr, count]) => ({ abbr, count }))
    .sort((a, b) => b.count - a.count || a.abbr.localeCompare(b.abbr))
    .slice(0, 3);

  const topCities = [...cities]
    .map((c) => ({ name: c.name, state: c.state ?? '', count: c.parkIds.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);

  let mostCommonAmenity: HomeStats['mostCommonAmenity'] = null;
  for (const [amenity, count] of amenityCounts) {
    if (!mostCommonAmenity || count > mostCommonAmenity.count) {
      mostCommonAmenity = { amenity, count };
    }
  }

  return {
    totalParks: parks.length,
    statesWithParks: byState.size,
    statesMissing: US_STATES_51.filter((s) => !byState.has(s)),
    totalCities: cities.length,
    topStates,
    largestCity: topCities[0] ?? null,
    topCities,
    withAmenities,
    withPrice,
    withRating,
    mostCommonAmenity,
  };
}
