// Data model per directory-niche-brief.md section 3.
// Nullable fields mean "not present in the source data" — never fabricate values.

export type Hookups = 'full' | 'partial' | 'none' | null;

// Where a park's nightly price came from. null = no price known (never invent one).
export type PriceSource = 'ridb' | 'tpwd' | null;

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

// Live weather snapshot from Google Weather API (currentConditions:lookup).
// null fields mean the API did not return them — never fabricated.
export interface WeatherCurrent {
  tempF: number | null; // degrees Fahrenheit
  conditions: string | null; // e.g. 'Mostly cloudy'
  isDaytime: boolean | null;
  timeZone: string | null; // IANA id, e.g. 'America/Chicago'
  fetchedAt: string; // ISO timestamp of the API fetch
}

// Live air quality snapshot from Google Air Quality API
// (currentConditions:lookup, Universal AQI index).
export interface Aqi {
  aqi: number | null; // Universal AQI (0-500)
  category: string | null; // e.g. 'Good air quality'
  dominantPollutant: string | null; // e.g. 'o3'
  fetchedAt: string; // ISO timestamp of the API fetch
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
  // Source of the nightly price: 'ridb' (Recreation.gov fee text) or 'tpwd'
  // (Texas Parks & Wildlife campsite rates). null when no price is known.
  dataSource: PriceSource;
  hookups: Hookups;
  amenities: string[];
  siteCount: number | null;
  rating: number | null; // Google Places rating 0-5 (null = not verified)
  reviewCount: number | null; // Google Places user_ratings_total
  priceLevel: number | null; // Google Places price_level 0-4
  placeId: string | null; // Google Places place_id
  googleUrl: string | null; // https://www.google.com/maps/place/?q=place_id:<id>
  petPolicy: string | null;
  // Live Google Weather/Air Quality snapshots (null = API unavailable or not fetched).
  weatherCurrent: WeatherCurrent | null;
  aqi: Aqi | null;
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
