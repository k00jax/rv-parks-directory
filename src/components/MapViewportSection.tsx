'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ParkTable from '@/components/ParkTable';
import type { Park } from '@/lib/types';
import type { MapBounds, MapPark } from '@/components/ParkMap';

// Leaflet map is client-only (window APIs). ssr:false keeps Leaflet out of
// the static prerender; the loading fallback holds the 600px frame so the
// layout doesn't shift when the map hydrates. Imported here (not page.tsx)
// because this section owns the map's viewport state.
const ParkMap = dynamic(() => import('@/components/ParkMap'), {
  ssr: false,
  loading: () => <div className="park-map park-map-loading" aria-hidden="true" />,
});

function inBounds(p: Park, b: MapBounds): boolean {
  return (
    p.lat !== null &&
    p.lng !== null &&
    p.lat >= b.south &&
    p.lat <= b.north &&
    p.lng >= b.west &&
    p.lng <= b.east
  );
}

// TASK 3 + TASK 7 — map ↔ table viewport binding and the sticky map.
//
// One client component owns BOTH sections so the map's pan/zoom can filter
// the Top-50 table, and so the map can stick to the top of the viewport
// while the table below it scrolls (position: sticky on .park-map-wrap,
// active at >= 1100px — the wrapper spans both sections, which is what lets
// the map keep pinning as the table passes).
//
// SSR honesty: this is a client component, so Next still server-renders the
// full Top-50 table into the HTML (SEO intact — all 50 rows, no filter chip
// until hydration). mapBounds starts null; the table only changes after the
// user actually pans/zooms the map, and 'Clear map filter' restores it.
export default function MapViewportSection({
  topParks,
  mapParks,
  totalParks,
}: {
  topParks: Park[];
  mapParks: MapPark[];
  totalParks: number;
}) {
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  const visibleTop = useMemo(
    () => (mapBounds ? topParks.filter((p) => inBounds(p, mapBounds)) : topParks),
    [topParks, mapBounds]
  );

  return (
    <div className="map-viewport-wrap">
      {/* Map section — sticky on desktop (>= 1100px) via .park-map-wrap */}
      <section aria-label="Explore the map">
        <h2>Explore the map</h2>
        <p className="muted home-intro">
          All {totalParks} parks plotted — filter by amenities, reviews, or pricing, then
          click a pin for ratings and nightly rates.
        </p>
        <ParkMap parks={mapParks} onBoundsChange={setMapBounds} />
        <noscript>
          <p className="small muted home-intro" style={{ marginTop: '0.6rem' }}>
            Enable JavaScript to explore the interactive map — the full table below lists every
            park with the same data.
          </p>
        </noscript>
      </section>

      {/* Top-50 table — viewport-filtered after hydration, full list in SSR */}
      <section>
        <h2>Top campgrounds in America ({topParks.length})</h2>
        {mapBounds ? (
          <div className="map-bound-chip" role="status">
            <span className="map-bound-chip-label">
              {visibleTop.length} parks in this view
            </span>
            <button
              type="button"
              className="map-bound-clear"
              onClick={() => setMapBounds(null)}
            >
              Clear map filter
            </button>
          </div>
        ) : (
          <p className="small muted map-bound-hint">
            Pan or zoom the map above to narrow this list to parks in view.
          </p>
        )}
        <ParkTable parks={visibleTop} showRank />
        <p className="small muted" style={{ marginTop: '0.6rem' }}>
          Ranked by a trust score that weighs Google rating AND review volume — a 4.8★ park with 500
          reviews outranks a 5★ park with 6 reviews. Parks with fewer than 5 reviews are shown honestly
          as “—” rather than guessed.
        </p>
      </section>
    </div>
  );
}
