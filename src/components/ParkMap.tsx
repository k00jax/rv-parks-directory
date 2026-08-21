'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Minimal park shape the map needs. The server page maps full Park records
// down to these fields so the RSC payload stays small (3,736 parks × 9 fields).
export interface MapPark {
  name: string;
  slug: string;
  state: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  nightlyPriceMin: number | null;
  nightlyPriceMax: number | null;
  amenities: string[];
}

// Amenity filter chips: every vocabulary term present in the dataset with
// >= 5 parks. 20 amp (3 parks) and laundry (2 parks) are too rare to be useful
// map filters. Same vocabulary as the amenity hub pages ('boat ramp',
// 'showers', …) — no invented terms.
const AMENITY_FILTERS: { value: string; label: string }[] = [
  { value: 'boat ramp', label: 'Boat Ramp' },
  { value: 'showers', label: 'Showers' },
  { value: 'water hookup', label: 'Water Hookup' },
  { value: 'dump station', label: 'Dump Station' },
  { value: 'playground', label: 'Playground' },
  { value: 'flush toilets', label: 'Flush Toilets' },
  { value: '50 amp', label: '50 Amp' },
  { value: '30 amp', label: '30 Amp' },
];

// Recreation.gov coordinate quirk: one park (Rock Quarry Group Campground)
// ships lat=0.0 / lng=-101.0236 — a "no location" sentinel, not a real pin.
// Plotting it would put a marker in the Pacific and wreck fitBounds.
function hasCoords(p: MapPark): boolean {
  return (
    p.lat !== null &&
    p.lng !== null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat !== 0 &&
    p.lng !== 0
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Popup: park name (deep link), rating when present, price when present,
// otherwise the honest "Rates not published" fallback.
function popupHtml(p: MapPark): string {
  const rating =
    p.rating !== null
      ? `${p.rating.toFixed(1)}★${p.reviewCount !== null ? ` (${p.reviewCount} reviews)` : ''}`
      : null;
  const price =
    p.nightlyPriceMin !== null
      ? `from $${p.nightlyPriceMin}/night`
      : p.nightlyPriceMax !== null
        ? `$${p.nightlyPriceMax}/night`
        : null;
  return [
    `<a href="/parks/${p.state.toLowerCase()}/${p.slug}/" class="arvp-popup-name">${escapeHtml(p.name)}</a>`,
    rating ? `<span class="arvp-popup-rating">${rating}</span>` : '',
    price
      ? `<span class="arvp-popup-price">${price}</span>`
      : '<span class="arvp-popup-price">Rates not published</span>',
  ].join('');
}

// ARVP-themed pin: teal (navy→cyan gradient) circle, white border, orange-red
// inner dot. Pure inline HTML/CSS — no image assets, so static export never
// 404s on default Leaflet marker images.
const PIN_ICON = L.divIcon({
  className: 'arvp-pin-wrap',
  html: '<div class="arvp-pin"><span class="arvp-pin-dot"></span></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -16],
});

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

// US fallback view (used only if every marker were filtered out).
const US_CENTER: [number, number] = [39.8, -98.5];

export default function ParkMap({ parks }: { parks: MapPark[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.FeatureGroup | null>(null);
  // fitBounds runs exactly once (first load); filter changes re-draw pins
  // without moving the viewport.
  const didFitRef = useRef(false);

  const [amenityFilters, setAmenityFilters] = useState<string[]>([]);
  const [withReviews, setWithReviews] = useState(false);
  const [withPricing, setWithPricing] = useState(false);
  // Set once the async map init (leaflet.markercluster dynamic import)
  // finishes; gates the marker effect so it never runs against a null map.
  const [mapReady, setMapReady] = useState(false);

  const hasActiveFilters = amenityFilters.length > 0 || withReviews || withPricing;

  function toggleAmenity(value: string) {
    setAmenityFilters((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    );
  }

  function clearAllFilters() {
    setAmenityFilters([]);
    setWithReviews(false);
    setWithPricing(false);
  }

  // AND semantics: a park must have EVERY selected amenity to stay visible.
  // 'With reviews' = rating present with at least one review; 'With pricing'
  // = a nightly min price is published (RIDB fee data).
  const visibleParks = useMemo(
    () =>
      parks.filter((p) => {
        if (!hasCoords(p)) return false;
        if (amenityFilters.length > 0 && !amenityFilters.every((a) => p.amenities.includes(a)))
          return false;
        if (withReviews && (p.rating === null || (p.reviewCount ?? 0) <= 0)) return false;
        if (withPricing && p.nightlyPriceMin === null) return false;
        return true;
      }),
    [parks, amenityFilters, withReviews, withPricing]
  );

  // Init map once (tile layer + the shared group markers live in). The
  // marker-cluster plugin is loaded via a dynamic import so it never ships in
  // the initial JS chunk; it has no ESM exports — its factory attaches
  // L.markerClusterGroup to the shared leaflet L (leaflet sets window.L), so
  // importing it for the side effect is the whole story. mapReady gates the
  // marker effect until the map (and group) actually exist.
  useEffect(() => {
    // Belt-and-suspenders: the page loads this with ssr:false, so window
    // exists here; the guard keeps the component safe in any future caller.
    if (typeof window === 'undefined') return;
    if (!containerRef.current || mapRef.current) return;

    let disposed = false;

    (async () => {
      await import('leaflet.markercluster');

      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        minZoom: 5,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: TILE_ATTR,
      }).addTo(map);

      // 3,700+ national pins overlap badly at US zoom, so cluster them.
      // Plugin is always present by the time the map mounts; featureGroup is
      // the (untested) fallback if L.markerClusterGroup never attached.
      const group = L.markerClusterGroup
        ? L.markerClusterGroup({
            maxClusterRadius: 55,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            chunkedLoading: true,
            iconCreateFunction: (cluster) => {
              const count = cluster.getChildCount();
              const size = count < 100 ? 44 : count < 1000 ? 54 : 64;
              return L.divIcon({
                html: `<div class="arvp-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
                className: 'arvp-cluster-wrap',
                iconSize: L.point(size, size),
              });
            },
          })
        : L.featureGroup();
      groupRef.current = group;
      group.addTo(map);
      setMapReady(true);
    })();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        groupRef.current = null;
        // Re-fit on the next mount (dev StrictMode double-mounts effects).
        didFitRef.current = false;
      }
      setMapReady(false);
    };
  }, []);

  // Re-render markers whenever parks or filters change: clear the shared
  // group and add back the filtered pins. fitBounds only on first load —
  // filtering never re-zooms the map.
  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group || !mapReady) return;

    group.clearLayers();
    visibleParks.forEach((p) => {
      L.marker([p.lat!, p.lng!], { icon: PIN_ICON })
        .bindPopup(popupHtml(p), { maxWidth: 240 })
        .addTo(group);
    });

    if (!didFitRef.current) {
      // Default: show the whole continental US, centered. Fixed view + zoom 4
      // puts the country in frame on first load (the national view Kyle wants),
      // instead of fitBounds zooming into wherever the densest pins are.
      map.setView(US_CENTER, 4);
      didFitRef.current = true;
    }
  }, [visibleParks, mapReady]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="park-map-wrap">
      <div className="park-map-tools" role="group" aria-label="Filter map">
        <div className="park-map-filters-head">
          <button
            type="button"
            className="park-map-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="park-map-filters-title">Filter map</span>
            <span className="park-map-toggle-arrow" aria-hidden="true">
              {filtersOpen ? '−' : '+'}
            </span>
          </button>
          {hasActiveFilters && (
            <button type="button" className="park-map-clear" onClick={clearAllFilters}>
              Clear all
            </button>
          )}
        </div>

        <p className="park-map-count" aria-live="polite">
          Showing {visibleParks.length} of {parks.length} parks
        </p>

        {filtersOpen && (
          <div className="park-map-filters-body">
            <div className="park-map-filter-group">
              <span className="park-map-filter-label" id="park-map-amenities-label">
                Amenities
              </span>
              <div
                className="park-map-chip-row"
                role="group"
                aria-labelledby="park-map-amenities-label"
              >
                {AMENITY_FILTERS.map((a) => {
                  const active = amenityFilters.includes(a.value);
                  return (
                    <button
                      key={a.value}
                      type="button"
                      className={`park-map-chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleAmenity(a.value)}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="park-map-chip-row" role="group" aria-label="Reviews and pricing">
              <button
                type="button"
                className={`park-map-chip${withReviews ? ' is-active' : ''}`}
                aria-pressed={withReviews}
                onClick={() => setWithReviews((v) => !v)}
              >
                With reviews
              </button>
              <button
                type="button"
                className={`park-map-chip${withPricing ? ' is-active' : ''}`}
                aria-pressed={withPricing}
                onClick={() => setWithPricing((v) => !v)}
              >
                With pricing
              </button>
            </div>

            {visibleParks.length === 0 && (
              <p className="park-map-empty">No parks match your filters</p>
            )}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="park-map"
        role="region"
        aria-label="Interactive map of all US RV parks and campgrounds"
      />
    </div>
  );
}
