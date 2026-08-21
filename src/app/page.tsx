import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ParkTable from '@/components/ParkTable';
import SearchBar from '@/components/SearchBar';
import { amenityHubs, cities, citiesInState, datasetMeta, parks, parksInState, stateAbbrs, stateName } from '@/lib/parks';

// Leaflet map is client-only (window APIs). ssr:false keeps Leaflet out of
// the static prerender; the loading fallback holds the 420px frame so the
// layout doesn't shift when the map hydrates.
const ParkMap = dynamic(() => import('@/components/ParkMap'), {
  ssr: false,
  loading: () => <div className="park-map park-map-loading" aria-hidden="true" />,
});

export const metadata: Metadata = {
  title: 'RV Parks & Campgrounds Directory — All United States Parks',
  description: `Browse all ${parks.length} campgrounds and RV parks across the United States with prices, ratings, and amenities from Recreation.gov data.`,
};

// Source city names are ALL-CAPS (e.g. "COLDSPRING"); display as Title Case.
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (/^\s*$/.test(w) || w === '-' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

// Nature-theme emoji per amenity hub slug (sensible, not literal).
const AMENITY_EMOJI: Record<string, string> = {
  'boat-ramp': '⛵',
  showers: '🚿',
  'water-hookup': '💧',
  'dump-station': '🗑️',
  playground: '🛝',
  'flush-toilets': '🚽',
  '50-amp': '⚡⚡⚡',
  '30-amp': '⚡⚡',
  '20-amp': '⚡',
  laundry: '🧺',
  'full-hookup': '🔌',
  '50-amp-full-hookup': '⚡⚡⚡🔌',
};

// Short tile label per hub slug (full title is long-form SEO copy).
const AMENITY_LABEL: Record<string, string> = {
  'boat-ramp': 'Boat Ramp',
  showers: 'Showers',
  'water-hookup': 'Water Hookup',
  'dump-station': 'Dump Station',
  playground: 'Playground',
  'flush-toilets': 'Flush Toilets',
  '50-amp': '50 Amp',
  '30-amp': '30 Amp',
  '20-amp': '20 Amp',
  laundry: 'Laundry',
  'full-hookup': 'Full Hookup',
  '50-amp-full-hookup': '50 Amp + Full Hookup',
};

// Subtle sage/amber/green tints cycled across tiles (not loud).
const AMENITY_TINTS = ['tint-sage', 'tint-amber', 'tint-green', 'tint-moss', 'tint-earth', 'tint-olive'];

function amenityLabel(slug: string): string {
  return AMENITY_LABEL[slug] ?? titleCase(slug.replace(/-/g, ' '));
}

export default function HomePage() {
  const lastVerified = datasetMeta.lastVerified;
  const searchParks = parks.map((p) => ({
    name: p.name,
    slug: p.slug,
    state: p.state,
    city: p.city,
  }));
  const searchCities = cities.map((c) => ({ name: c.name, slug: c.slug, state: c.state }));
  // Minimal park shape for the interactive map (keeps the client payload slim).
  const mapParks = parks.map((p) => ({
    name: p.name,
    slug: p.slug,
    state: p.state,
    lat: p.lat,
    lng: p.lng,
    rating: p.rating,
    reviewCount: p.reviewCount,
    nightlyPriceMin: p.nightlyPriceMin,
    nightlyPriceMax: p.nightlyPriceMax,
    amenities: p.amenities,
  }));
  // Home table = TOP Texas campgrounds ONLY (50 max). Ranked by Google rating
  // desc, reviews desc as tiebreak, then name. Parks without a rating sort
  // last (honest — never fabricate). TX-scoped by design: this table is for
  // Texas campgrounds, not the whole country.
  const topTxParks = parks
    .filter((p) => p.state === 'TX')
    .sort((a, b) => {
      const ra = a.rating ?? -1;
      const rb = b.rating ?? -1;
      if (ra !== rb) return rb - ra;
      const va = a.reviewCount ?? 0;
      const vb = b.reviewCount ?? 0;
      if (va !== vb) return vb - va;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 50);
  // City browse = the cities with the most parks, biggest first (the count
  // pill on each chip is the number of parks there). Capped so the home page
  // stays scannable — searching or browsing by state covers the long tail.
  const topCities = [...cities]
    .sort((a, b) => b.parkIds.length - a.parkIds.length)
    .slice(0, 20);
  return (
    <div>
      {/* Hero: animated banner video (autoplay muted loop) + search bar */}
      <section className="hero" aria-label="American RV Parks promotional banner">
        <video
          className="hero-video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/banner-poster.jpg"
          aria-hidden="true"
        >
          <source src="/banner.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay" aria-hidden="true" />
        <SearchBar parks={searchParks} cities={searchCities} />
      </section>

      <h1>RV Parks &amp; Campgrounds Directory — United States</h1>
      <p className="muted home-intro">
        {parks.length} verified campgrounds across the United States, from public Recreation.gov data —
        sortable, with ratings, weather, and live prices where published.
      </p>
      <p className="muted home-intro">
        Every campground listed on this site, driven by public Recreation.gov (RIDB) facility data.
        {parks.length} parks · {cities.length} cities · verified {lastVerified}.
      </p>

      <div className="light-trail" aria-hidden="true" />

      <section>
        <h2>Explore by state</h2>
        <div className="chip-row">
          {stateAbbrs.map((abbr) => {
            const stParks = parksInState(abbr);
            const count = stParks.length;
            return (
              <Link
                key={abbr}
                className="chip"
                href={`/rv-parks/${abbr.toLowerCase()}/`}
                aria-label={`${stateName(abbr)} — ${count} park${count === 1 ? '' : 's'}`}
              >
                {stateName(abbr)}
                <span className={`chip-count${count >= 20 ? ' chip-count-hot' : ''}`}>{count}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Explore by city</h2>
        <p className="muted home-intro">
          The {topCities.length} cities with the most campgrounds, biggest first.
        </p>
        <div className="chip-row">
          {topCities.map((c) => {
            const count = c.parkIds.length;
            const state = c.state ?? 'TX';
            return (
              <Link
                key={c.slug}
                className="chip"
                href={`/rv-parks/${state.toLowerCase()}/${c.slug}/`}
                aria-label={`${titleCase(c.name)}, ${state} — ${count} park${count === 1 ? '' : 's'}`}
              >
                {titleCase(c.name)}, {state}
                <span className="chip-count">{count}</span>
              </Link>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: '0.6rem' }}>
          Counting every city would overflow this page — search a specific city above, or browse
          by <Link href="/rv-parks/tx/">state</Link>.
        </p>
      </section>

      <section>
        <h2>Explore by amenity</h2>
        <div className="amenity-grid">
          {amenityHubs.map((a, i) => {
            const count = parks.filter(a.match).length;
            const label = amenityLabel(a.slug);
            return (
              <Link
                key={a.slug}
                className={`amenity-tile ${AMENITY_TINTS[i % AMENITY_TINTS.length]}`}
                href={`/rv-parks/${a.slug}/`}
                aria-label={`${label} — ${count} park${count === 1 ? '' : 's'}`}
              >
                <span className="amenity-icon" aria-hidden="true">
                  {AMENITY_EMOJI[a.slug] ?? '⛺'}
                </span>
                <span className="amenity-label">{label}</span>
                <span className="amenity-count">
                  {count} park{count === 1 ? '' : 's'}
                </span>
              </Link>
            );
          })}
          <Link
            className={`amenity-tile ${AMENITY_TINTS[amenityHubs.length % AMENITY_TINTS.length]}`}
            href="/rv-parks/amenities/"
            aria-label="All RV park amenities in the United States — full amenity filter index"
          >
            <span className="amenity-icon" aria-hidden="true">
              🧭
            </span>
            <span className="amenity-label">All Amenities</span>
            <span className="amenity-count">Full filter index</span>
          </Link>
        </div>
      </section>

      {/* Interactive map (Leaflet + OpenStreetMap, client-only). The full
          table below still server-renders every park — SEO intact; the map is
          progressive enhancement on top. */}
      <section>
        <h2>Explore the map</h2>
        <p className="muted home-intro">
          All {parks.length} parks plotted — filter by amenities, reviews, or pricing, then
          click a pin for ratings and nightly rates.
        </p>
        <ParkMap parks={mapParks} />
        <noscript>
          <p className="small muted home-intro" style={{ marginTop: '0.6rem' }}>
            Enable JavaScript to explore the interactive map — the full table below lists every
            park with the same data.
          </p>
        </noscript>
      </section>

      <section>
        <h2>Top campgrounds in Texas ({topTxParks.length})</h2>
        <ParkTable parks={topTxParks} showRank />
        <p className="small muted" style={{ marginTop: '0.6rem' }}>
          Ranked by Google rating — the top {topTxParks.length} Texas campgrounds. Browse every
          Texas campground in the <Link href="/rv-parks/tx/">Texas hub</Link>.
        </p>
      </section>

      <p className="small muted" style={{ marginTop: '2rem' }}>
        v2.0.0. Missing values (prices, ratings, hookups) are shown as “—” when the source
        data does not publish them — nothing on this site is estimated or invented. Data:{' '}
        {datasetMeta.source} · fetched {datasetMeta.fetchedAt}.
      </p>
    </div>
  );
}
