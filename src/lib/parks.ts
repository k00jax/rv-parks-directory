import type { AmenityHub, CityDataset, CityHub, Park, ParkDataset } from './types';
import parksData from '../data/parks.tx.json';
import citiesData from '../data/cities.tx.json';

const parksDataset = parksData as ParkDataset;
const citiesDataset = citiesData as CityDataset;

export const STATE_ABBR = 'TX';
export const STATE_NAME = 'Texas';

export const parks: Park[] = parksDataset.parks;
export const cities: CityHub[] = citiesDataset.cities;

export const datasetMeta = parksDataset.meta;

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
// parks.tx.json (Recreation.gov facility amenity data) — no invented terms.
// Single-amenity pages cover each vocabulary value; combined pages cover
// meaningful combinations that actually exist in the dataset (>=3 parks).
export const amenityHubs: AmenityHub[] = [
  // ---- single-amenity pages (every vocabulary term in the dataset) ----
  {
    slug: 'boat-ramp',
    title: 'RV Parks with Boat Ramp in Texas',
    description:
      'Campgrounds and RV parks in Texas with a boat ramp on site, from Recreation.gov facility amenity data. Great for anglers and boaters who want to launch within walking distance of their site.',
    match: (p) => p.amenities.includes('boat ramp'),
  },
  {
    slug: 'showers',
    title: 'RV Parks with Showers in Texas',
    description:
      'RV parks and campgrounds in Texas with shower facilities, from Recreation.gov facility amenity data. A hot shower after a long day on the road makes all the difference.',
    match: (p) => p.amenities.includes('showers'),
  },
  {
    slug: 'water-hookup',
    title: 'RV Parks with Water Hookup in Texas',
    description:
      'RV parks in Texas with water hookups at campsites, from Recreation.gov facility amenity data. Skip the tank fills and camp with running water at your site.',
    match: (p) => p.amenities.includes('water hookup'),
  },
  {
    slug: 'dump-station',
    title: 'RV Parks with Dump Station in Texas',
    description:
      'RV parks and campgrounds in Texas with an on-site dump station, from Recreation.gov facility amenity data. Empty your tanks before the drive home without hunting for a service stop.',
    match: (p) => p.amenities.includes('dump station'),
  },
  {
    slug: 'playground',
    title: 'RV Parks with Playground in Texas',
    description:
      'Family-friendly RV parks and campgrounds in Texas with a playground, from Recreation.gov facility amenity data. Keep the kids entertained while you set up camp.',
    match: (p) => p.amenities.includes('playground'),
  },
  {
    slug: 'flush-toilets',
    title: 'RV Parks with Flush Toilets in Texas',
    description:
      'RV parks and campgrounds in Texas with flush toilets, from Recreation.gov facility amenity data. Real restrooms instead of vault toilets make campground life a lot more comfortable.',
    match: (p) => p.amenities.includes('flush toilets'),
  },
  {
    slug: '50-amp',
    title: 'RV Parks with 50 Amp Service in Texas',
    description:
      'RV parks in Texas with 50-amp electrical service, from Recreation.gov facility amenity data. Run your air conditioner and high-draw appliances without tripping a breaker.',
    match: (p) => p.amenities.includes('50 amp'),
  },
  {
    slug: '30-amp',
    title: 'RV Parks with 30 Amp Service in Texas',
    description:
      'RV parks in Texas with 30-amp electrical service, from Recreation.gov facility amenity data. The standard hookup for most travel trailers and motorhomes.',
    match: (p) => p.amenities.includes('30 amp'),
  },
  {
    slug: '20-amp',
    title: 'RV Parks with 20 Amp Service in Texas',
    description:
      'RV parks in Texas with 20-amp electrical service, from Recreation.gov facility amenity data. Basic power for tent campers and small rigs.',
    match: (p) => p.amenities.includes('20 amp'),
  },
  {
    slug: 'laundry',
    title: 'RV Parks with Laundry in Texas',
    description:
      'RV parks and campgrounds in Texas with on-site laundry facilities, from Recreation.gov facility amenity data. Pack lighter and wash clothes on the road.',
    match: (p) => p.amenities.includes('laundry'),
  },
  // ---- combined amenity pages (only combos that exist in the dataset) ----
  {
    slug: 'full-hookup',
    title: 'RV Parks with Full Hookups in Texas',
    description:
      'RV parks in Texas with full hookups — water hookup plus dump station at the campground, from Recreation.gov facility amenity data. The classic full-hookup setup for worry-free camping.',
    match: (p) => p.amenities.includes('water hookup') && p.amenities.includes('dump station'),
  },
  {
    slug: '50-amp-full-hookup',
    title: 'RV Parks with 50 Amp Full Hookups in Texas',
    description:
      'RV parks in Texas with 50-amp service plus full hookups (water hookup and dump station), from Recreation.gov facility amenity data. The complete setup for big rigs: all the power, water, and tank service you need.',
    match: (p) =>
      p.amenities.includes('50 amp') &&
      p.amenities.includes('water hookup') &&
      p.amenities.includes('dump station'),
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
