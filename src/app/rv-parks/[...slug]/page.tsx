import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';
import ParkTable from '@/components/ParkTable';
import { amenityHubs, cities, getAmenityHub, getParksByCity, parks, STATE_NAME } from '@/lib/parks';

/**
 * Family B (geo hubs) + Family C (amenity hubs) share the /rv-parks/ tree:
 *   /rv-parks/texas/                -> state hub
 *   /rv-parks/texas/{city}/         -> city hub
 *   /rv-parks/amenities/            -> amenity index (all amenity pages)
 *   /rv-parks/{amenity}/            -> amenity hub (Family C)
 *   /rv-parks/texas/{amenity}/      -> amenity hub scoped to Texas
 * Anything else -> 404.
 */
interface Props {
  params: { slug: string[] };
}

export function generateStaticParams() {
  const params: { slug: string[] }[] = [{ slug: ['texas'] }, { slug: ['amenities'] }];
  for (const c of cities) params.push({ slug: ['texas', c.slug] });
  for (const a of amenityHubs) params.push({ slug: [a.slug] });
  for (const a of amenityHubs) params.push({ slug: ['texas', a.slug] });
  return params;
}

export function generateMetadata({ params }: Props): Metadata {
  const [a, b] = params.slug;
  if (a === 'amenities') {
    return {
      title: `RV Park Amenities in ${STATE_NAME}`,
      description: `Browse every RV park in ${STATE_NAME} by amenity: hookups, dump stations, showers, boat ramps, playgrounds, and more — from Recreation.gov data.`,
    };
  }
  if (a === 'texas' && !b) {
    return {
      title: `RV Parks & Campgrounds in ${STATE_NAME}`,
      description: `${parks.length} campgrounds and RV parks in ${STATE_NAME} with prices, ratings, and amenities from Recreation.gov data.`,
    };
  }
  if (a === 'texas' && b) {
    const amenity = getAmenityHub(b);
    if (amenity) {
      return { title: amenity.title, description: amenity.description };
    }
    const cityParks = getParksByCity(b);
    if (cityParks.length > 0) {
      const cityName = cities.find((c) => c.slug === b)?.name ?? b;
      return {
        title: `RV Parks in ${cityName}, ${STATE_NAME}`,
        description: `${cityParks.length} campgrounds and RV parks in ${cityName}, ${STATE_NAME}.`,
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
  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Amenities' }]} />
      <h1>RV Park Amenities in {STATE_NAME}</h1>
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
        <h2>All campgrounds in {STATE_NAME} ({parks.length})</h2>
        <ParkTable parks={parks} />
      </section>
    </div>
  );
}

function AmenityHubView({ amenitySlug, scoped }: { amenitySlug: string; scoped: boolean }) {
  const amenity = getAmenityHub(amenitySlug);
  if (!amenity) notFound();
  const matched = parks.filter(amenity.match);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: amenity.title,
    numberOfItems: matched.length,
    itemListElement: matched.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/tx/${p.slug}/`,
    })),
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          ...(scoped ? [{ label: STATE_NAME, href: '/rv-parks/texas/' }] : []),
          { label: 'Amenities', href: '/rv-parks/amenities/' },
          { label: amenity.title },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>{amenity.title}</h1>
      <p>{amenity.description}</p>
      <p className="muted">
        {matched.length} campground{matched.length === 1 ? '' : 's'} match this amenity filter,
        from Recreation.gov facility amenity data.
      </p>

      <h2>Campgrounds ({matched.length})</h2>
      <ParkTable parks={matched} />

      <section>
        <h2>Related</h2>
        <ul className="plain">
          <li>
            <Link href="/rv-parks/amenities/">All RV park amenities in {STATE_NAME}</Link>
          </li>
          <li>
            <Link href="/rv-parks/texas/">All RV parks &amp; campgrounds in {STATE_NAME}</Link>
          </li>
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

function StateHubView() {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `RV Parks & Campgrounds in ${STATE_NAME}`,
    numberOfItems: parks.length,
    itemListElement: parks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/tx/${p.slug}/`,
    })),
  };
  return (
    <div>
      <Breadcrumbs crumbs={[{ label: STATE_NAME }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>RV Parks &amp; Campgrounds in {STATE_NAME}</h1>
      <p className="muted">
        {parks.length} campgrounds listed from Recreation.gov public data · verified{' '}
        {parks[0]?.lastVerified ?? '—'}. Looking for a specific city? Browse the city list below.
      </p>

      <section>
        <h2>Browse by city</h2>
        <div className="card-grid">
          {cities.map((c) => (
            <div className="card" key={c.slug}>
              <Link href={`/rv-parks/texas/${c.slug}/`}>
                RV Parks in {c.name}, TX
              </Link>
              <div className="muted">{c.parkIds.length} parks</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>All campgrounds in {STATE_NAME} ({parks.length})</h2>
        <ParkTable parks={parks} />
      </section>
    </div>
  );
}

function CityHubView({ citySlug }: { citySlug: string }) {
  const cityParks = getParksByCity(citySlug);
  const hub = cities.find((c) => c.slug === citySlug);
  if (!hub || cityParks.length === 0) notFound();
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `RV Parks in ${hub.name}, ${STATE_NAME}`,
    numberOfItems: cityParks.length,
    itemListElement: cityParks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `https://americanrvparks.com/parks/tx/${p.slug}/`,
    })),
  };
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: STATE_NAME, href: '/rv-parks/texas/' }, { label: hub.name }]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <h1>RV Parks in {hub.name}, {STATE_NAME}</h1>
      <p className="muted">
        {cityParks.length} campground{cityParks.length === 1 ? '' : 's'} in {hub.name} from
        Recreation.gov public data.
      </p>

      <h2>Campgrounds in {hub.name}</h2>
      <ParkTable parks={cityParks} />

      <section>
        <h2>Nearby cities</h2>
        <div className="card-grid">
          {cities
            .filter((c) => c.slug !== citySlug)
            .map((c) => (
              <div className="card" key={c.slug}>
                <Link href={`/rv-parks/texas/${c.slug}/`}>
                  RV Parks in {c.name}, TX
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
  if (a === 'texas' && !b) return <StateHubView />;
  if (a === 'texas' && b) {
    if (getAmenityHub(b)) return <AmenityHubView amenitySlug={b} scoped />;
    return <CityHubView citySlug={b} />;
  }
  if (getAmenityHub(a)) return <AmenityHubView amenitySlug={a} scoped={false} />;
  notFound();
}
