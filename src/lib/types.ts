// Data model per directory-niche-brief.md section 3.
// Nullable fields mean "not present in the source data" — never fabricate values.

export type Hookups = 'full' | 'partial' | 'none' | null;

export interface ParkSource {
  orgId: string | null;
  orgName: string | null;
  parentId: string | null;
  parentName: string | null;
  reservable: boolean;
  facilityType: string | null;
  equipment: string[];
  maxVehicleLength: number | null;
  imageUrl: string | null;
  timeZone: string | null;
  description: string;
}

export interface Park {
  facilityId: string;
  name: string;
  slug: string;
  street: string | null;
  city: string | null;
  state: string; // e.g. 'TX'
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  nightlyPriceMin: number | null;
  nightlyPriceMax: number | null;
  hookups: Hookups;
  amenities: string[];
  siteCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  petPolicy: string | null;
  lastVerified: string; // ISO date, e.g. '2026-08-18'
  source: ParkSource;
}

export interface DatasetMeta {
  fetchedAt: string;
  lastVerified: string;
  source: string;
  sourceUrls: string[];
  [key: string]: unknown;
}

export interface ParkDataset {
  meta: DatasetMeta;
  parks: Park[];
}

export interface CityHub {
  name: string;
  slug: string;
  parkIds: string[];
}

export interface CityDataset {
  meta: { state: string; stateAbbr: string };
  cities: CityHub[];
}

export interface AmenityHub {
  slug: string;
  title: string;
  description: string;
  match: (park: Park) => boolean;
}
