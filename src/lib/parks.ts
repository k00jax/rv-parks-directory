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

// Amenity hubs (Family C). Phase 0: structure in place; matches are driven by
// real data, so full-hookup intentionally matches 0 parks until Phase 1 data.
export const amenityHubs: AmenityHub[] = [
  {
    slug: 'full-hookup',
    title: 'Full Hookup RV Parks',
    description:
      'RV parks in Texas with full hookups (water, sewer, and electric at every site). Full hookup data arrives in Phase 1 (per-campsite attributes); this page is the structured placeholder.',
    match: (p) => p.hookups === 'full',
  },
  {
    slug: 'pet-friendly',
    title: 'Pet-Friendly RV Parks & Campgrounds',
    description:
      'Campgrounds in Texas where pets are allowed, based on Recreation.gov facility amenity data.',
    match: (p) => p.petPolicy === 'Pets allowed',
  },
  {
    slug: 'lakefront',
    title: 'Lakefront Campgrounds in Texas',
    description:
      'Campgrounds in Texas with lake access or lakefront sites, based on Recreation.gov facility amenity data.',
    match: (p) =>
      p.amenities.some((a) => /lake access|boat ramp|boat dock/i.test(a)),
  },
];

export function getAmenityHub(slug: string): AmenityHub | undefined {
  return amenityHubs.find((a) => a.slug === slug);
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

export function fmtSiteCount(park: Park): string {
  if (park.siteCount === null) return '—';
  return `${park.siteCount} sites`;
}

export function fmtPhone(park: Park): string {
  if (!park.phone) return '—';
  return park.phone;
}
