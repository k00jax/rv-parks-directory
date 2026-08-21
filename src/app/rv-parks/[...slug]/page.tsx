import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';
import ParkTable from '@/components/ParkTable';
import { amenityHubs, cities, citiesInState, getAmenityHub, getParksByCity, parks, parksInState, stateAbbrs, stateName } from '@/lib/parks';

/**
 * Family B (geo hubs) + Family C (amenity hubs) share the /rv-parks/ tree.
 * Multi-state (2026-08-21): the state segment is the lowercase abbrev (tx,
 * al, az, ...), matching /parks/{state}/{slug}. City slugs are globally
 * unique (state-scoped in the US dataset) so same-named cities in different
 * states resolve unambiguously.
 *   /rv-parks/{state}/              -> state hub
 *   /rv-parks/{state}/{city}/       -> city hub
 *   /rv-parks/amenities/            -> amenity index (nationwide)
 *   /rv-parks/{amenity}/            -> amenity hub (nationwide)
 *   /rv-parks/{state}/{amenity}/    -> amenity hub scoped to a state
 * Anything else -> 404.
 */
interface Props {
  params: { slug: string[] };
}

export function generateStaticParams() {
  const params: { slug: string[] }[] = [{ slug: ['amenities'] }];
  for (const st of stateAbbrs) {
    const lower = st.toLowerCase();
    params.push({ slug: [lower] });
    for (const c of citiesInState(lower)) params.push({ slug: [lower, c.slug] });
    for (const a of amenityHubs) params.push({ slug: [a.slug] });
    for (const a of amenityHubs) params.push({ slug: [lower, a.slug] });
  }
  return params;
}

export function generateMetadata({ params }: Props): Metadata {
  const [a, b] = params.slug;
  if (a === 'amenities') {
    return {
      title: `RV Park Amenities in the United States`,
      description: `Browse every RV park in the United States by amenity: hookups, dump stations, showers, boat ramps, playgrounds, and more — from Recreation.gov data.`,
    };
  }
  const stName = stateName(a);
  if (stateAbbrs.includes(a.toUpperCase()) && !b) {
    const stParks = parksInState(a);
    return {
      title: `RV Parks & Campgrounds in ${stName}`,
      description: `${stParks.length} campgrounds and RV parks in ${stName} with prices, ratings, and amenities from Recreation.gov data.`,
    };
  }
  if (stateAbbrs.includes(a.toUpperCase()) && b) {
    const amenity = getAmenityHub(b);
    if (amenity) {
      return { title: amenity.title, description: amenity.description };
    }
    const cityParks = getParksByCity(b);
    if (cityParks.length > 0) {
      const cityName = cities.find((c) => c.slug === b)?.name ?? b;
      return {
        title: `RV Parks in ${cityName}, ${stName}`,
        description: `${cityParks.length} campgrounds and RV parks in ${cityName}, ${stName}.`,
      };
    }
  }
  const amenity = getAmenityHub(a);
  if (amenity) {
    return { title: amenity.title, description: amenity.description };
  }
  return { title: 'Not found' };
}

function AmenitiesIndexView() {
  const stName = 'United States';
  return (
    <div className="park-page">
      <Breadcrumbs crumbs={[{ label: 'Amenities' }]} />
      <h1>RV Park Amenities in {stName}</h1>
      <p className="muted">
        Every amenity filter on this site, driven by the actual amenity data published for
        these campgrounds on Recreation.gov. No estimated or invented amenity listings.
      </p>
      <section>
        <div className="card-grid">
          {amenityHubs.map((a) => {
            const count = parks.filter(a.match).length;
            return (
              <div className="card" key={a.slug}>
                <Link href={`/rv-parks/${a.slug}/`}>{a.title}</Link>
                <div className="muted">{count} parks</div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2>All campgrounds in {stName} ({parks.length})</h2>
        <ParkTable parks={parks} />
      </section>
    </div>
  );
}

function AmenityHubView({ amenitySlug, state }: { amenitySlug: string; state?: string }) {
  const amenity = getAmenityHub(amenitySlug);
  if (!amenity) notFound();
  const scoped = Boolean(state);
  const matched = scoped ? parks.filter((p) => p.state === state!.toUpperCase() && amenity.match(p)) : parks.filter(amenity.match);
  const stName = scoped ? stateName(state!) : 'United States';
  const stLower = scoped ? state!.toLowerCase() : '';
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: amenity.title,
    numberOfItems: matched.length,
    itemListElement: matched.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/${p.state.toLowerCase()}/${p.slug}/`,
    })),
  };

  return (
    <div className="park-page">
      <Breadcrumbs
        crumbs={[
          ...(scoped ? [{ label: stName, href: `/rv-parks/${stLower}/` }] : []),
          { label: 'Amenities', href: '/rv-parks/amenities/' },
          { label: amenity.title },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>{amenity.title}</h1>
      <p>{amenity.description}</p>
      <p className="muted">
        {matched.length} campground{matched.length === 1 ? '' : 's'} match this amenity filter
        {scoped ? ` in ${stName}` : ''}, from Recreation.gov facility amenity data.
      </p>

      <h2>Campgrounds ({matched.length})</h2>
      <ParkTable parks={matched} />

      <section>
        <h2>Related</h2>
        <ul className="plain">
          <li>
            <Link href="/rv-parks/amenities/">All RV park amenities</Link>
          </li>
          {scoped ? (
            <li>
              <Link href={`/rv-parks/${stLower}/`}>All RV parks &amp; campgrounds in {stName}</Link>
            </li>
          ) : null}
          {amenityHubs
            .filter((a) => a.slug !== amenitySlug)
            .map((a) => (
              <li key={a.slug}>
                <Link href={`/rv-parks/${a.slug}/`}>{a.title}</Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function StateHubView({ state }: { state: string }) {
  const stName = stateName(state);
  const stParks = parksInState(state);
  const stCities = citiesInState(state);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `RV Parks & Campgrounds in ${stName}`,
    numberOfItems: stParks.length,
    itemListElement: stParks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/${state}/${p.slug}/`,
    })),
  };
  return (
    <div className="park-page">
      <Breadcrumbs crumbs={[{ label: stName }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>RV Parks &amp; Campgrounds in {stName}</h1>
      <p className="muted">
        {stParks.length} campgrounds listed from Recreation.gov public data · verified{' '}
        {stParks[0]?.lastVerified ?? '—'}. Looking for a specific city? Browse the city list below.
      </p>

      <section>
        <h2>Browse by city</h2>
        <div className="card-grid">
          {stCities.map((c) => (
            <div className="card" key={c.slug}>
              <Link href={`/rv-parks/${state}/${c.slug}/`}>
                RV Parks in {c.name}, {state.toUpperCase()}
              </Link>
              <div className="muted">{c.parkIds.length} parks</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>All campgrounds in {stName} ({stParks.length})</h2>
        <ParkTable parks={stParks} />
      </section>
    </div>
  );
}

function CityHubView({ state, citySlug }: { state: string; citySlug: string }) {
  const stName = stateName(state);
  const cityParks = getParksByCity(citySlug);
  const hub = cities.find((c) => c.slug === citySlug);
  if (!hub || cityParks.length === 0) notFound();
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `RV Parks in ${hub.name}, ${stName}`,
    numberOfItems: cityParks.length,
    itemListElement: cityParks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/${p.state.toLowerCase()}/${p.slug}/`,
    })),
  };
  const nearby = cities.filter((c) => c.slug !== citySlug && (c.state ?? state.toUpperCase()) === state.toUpperCase());
  return (
    <div className="park-page">
      <Breadcrumbs
        crumbs={[{ label: stName, href: `/rv-parks/${state}/` }, { label: hub.name }]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>RV Parks in {hub.name}, {stName}</h1>
      <p className="muted">
        {cityParks.length} campground{cityParks.length === 1 ? '' : 's'} in {hub.name} from
        Recreation.gov public data.
      </p>

      <h2>Campgrounds in {hub.name}</h2>
      <ParkTable parks={cityParks} />

      <section>
        <h2>Nearby cities</h2>
        <div className="card-grid">
          {nearby.map((c) => (
            <div className="card" key={c.slug}>
              <Link href={`/rv-parks/${state}/${c.slug}/`}>
                RV Parks in {c.name}, {state.toUpperCase()}
              </Link>
              <div className="muted">{c.parkIds.length} parks</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function RvParksPage({ params }: Props) {
  const [a, b] = params.slug;
  if (a === 'amenities') return <AmenitiesIndexView />;
  if (stateAbbrs.includes(a.toUpperCase()) && !b) return <StateHubView state={a} />;
  if (stateAbbrs.includes(a.toUpperCase()) && b) {
    if (getAmenityHub(b)) return <AmenityHubView amenitySlug={b} state={a} />;
    return <CityHubView state={a} citySlug={b} />;
  }
  if (getAmenityHub(a)) return <AmenityHubView amenitySlug={a} />;
  notFound();
}
