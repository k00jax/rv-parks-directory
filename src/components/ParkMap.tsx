'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Minimal park shape the map needs. The server page maps full Park records
// down to these fields so the RSC payload stays small (82 parks × 8 fields).
export interface MapPark {
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  nightlyPriceMin: number | null;
  nightlyPriceMax: number | null;
}

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
    `<a href="/parks/tx/${p.slug}/" class="arvp-popup-name">${escapeHtml(p.name)}</a>`,
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

// Texas fallback view (used only if every marker were filtered out).
const TX_CENTER: [number, number] = [31.0, -99.5];

export default function ParkMap({ parks }: { parks: MapPark[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Belt-and-suspenders: the page loads this with ssr:false, so window
    // exists here; the guard keeps the component safe in any future caller.
    if (typeof window === 'undefined') return;
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: 5,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTR,
    }).addTo(map);

    const group = L.featureGroup();
    parks.filter(hasCoords).forEach((p) => {
      L.marker([p.lat!, p.lng!], { icon: PIN_ICON })
        .bindPopup(popupHtml(p), { maxWidth: 240 })
        .addTo(group);
    });
    group.addTo(map);

    if (group.getLayers().length > 0) {
      // Fit to the plotted pins; maxZoom cap keeps a dense city cluster from
      // zooming in on one neighborhood — the map opens on all of Texas.
      map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 10 });
    } else {
      map.setView(TX_CENTER, 6);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [parks]);

  return (
    <div
      ref={containerRef}
      className="park-map"
      role="region"
      aria-label="Interactive map of all Texas RV parks and campgrounds"
    />
  );
}
