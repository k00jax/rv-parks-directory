import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import UpdatedBadge from '@/components/UpdatedBadge';
import AffiliateDisclosure from '@/components/AffiliateDisclosure';
import ClaimForm from '@/components/ClaimForm';
import WeatherCard from '@/components/WeatherCard';
import {
  amenityHubs,
  fmtPhone,
  fmtPrice,
  fmtPriceSource,
  fmtRating,
  fmtSiteCount,
  fmtStars,
  getAmenityHubsForPark,
  getCitySlug,
  getParkBySlug,
  neighbors,
  parks,
  STATE_NAME,
} from '@/lib/parks';
import Link from 'next/link';

interface Props {
  params: { state: string; slug: string };
}

export function generateStaticParams() {
  return parks.map((p) => ({ state: 'tx', slug: p.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const park = getParkBySlug(params.slug);
  if (!park) return { title: 'Not found' };
  return {
    title: `${park.name} — ${park.city ? park.city + ', ' : ''}TX`,
    description: `${park.name} in ${park.city ?? 'Texas'}: nightly price ${fmtPrice(
      park
    )}, ${fmtRating(park)}, ${fmtSiteCount(park)}. Verified ${park.lastVerified} from Recreation.gov data.`,
  };
}

export default function ParkPage({ params }: Props) {
  const park = getParkBySlug(params.slug);
  if (!park) notFound();

  const city = park.city ? park.city : null;
  const near = neighbors(park, 2);
  const parkAmenityHubs = getAmenityHubsForPark(park);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Campground',
    name: park.name,
    ...(park.street ? { address: { '@type': 'PostalAddress', streetAddress: park.street, addressLocality: park.city, addressRegion: park.state, postalCode: park.zip, addressCountry: 'US' } } : {}),
    ...(park.lat !== null && park.lng !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: park.lat, longitude: park.lng } }
      : {}),
    ...(park.phone ? { telephone: park.phone } : {}),
    ...(park.website ? { url: park.website } : {}),
    ...(park.rating !== null ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: park.rating, reviewCount: park.reviewCount ?? 0 } } : {}),
    ...(park.siteCount !== null ? { numberOfRooms: park.siteCount } : {}),
    ...(park.petPolicy ? { petsAllowed: park.petPolicy === 'Pets allowed' } : {}),
    ...(park.nightlyPriceMin !== null || park.nightlyPriceMax !== null
      ? { priceRange: fmtPrice(park) }
      : {}),
  };
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How much does it cost to stay at ${park.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            park.nightlyPriceMin !== null
              ? `Based on published data, nightly rates are ${fmtPrice(park)}.`
              : 'Published data does not list nightly rates for this campground.',
        },
      },
      {
        '@type': 'Question',
        name: `Are pets allowed at ${park.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            park.petPolicy === 'Pets allowed'
              ? 'Yes — the Recreation.gov facility listing marks this campground as pet friendly.'
              : 'Pet policy is not listed in the Recreation.gov facility data for this campground.',
        },
      },
      {
        '@type': 'Question',
        name: `How many campsites does ${park.name} have?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            park.siteCount !== null
              ? `${park.siteCount} campsites are listed for this campground.`
              : 'Site count is not published in the Recreation.gov data for this campground.',
        },
      },
    ],
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: 'Texas', href: '/rv-parks/texas/' },
          ...(city && getCitySlug(park)
            ? [{ label: city, href: `/rv-parks/texas/${getCitySlug(park)}/` }]
            : []),
          { label: park.name },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <UpdatedBadge date={park.lastVerified} />
      <h1>{park.name}</h1>
      <p className="muted">
        {park.city ? `${park.city}, ${park.state}` : park.state} · {park.source.facilityType ?? 'Campground'}
      </p>

      <table className="data">
        <tbody>
          <tr>
            <th>Address</th>
            <td>
              {park.street ? (
                <>
                  {park.street}
                  <br />
                </>
              ) : null}
              {park.city ? `${park.city}, ` : ''}
              {park.state}
              {park.zip ? ` ${park.zip}` : ''}
              {!park.street && !park.city ? '—' : ''}
            </td>
          </tr>
          <tr>
            <th>Phone</th>
            <td>{fmtPhone(park)}</td>
          </tr>
          <tr>
            <th>Nightly price</th>
            <td>
              {park.nightlyPriceMin !== null || park.nightlyPriceMax !== null ? (
                <>
                  {fmtPrice(park)}
                  {park.dataSource ? (
                    <span className="muted"> — {fmtPriceSource(park)}</span>
                  ) : null}
                  {park.priceLevel !== null && park.priceLevel > 0 ? (
                    <span className="muted"> · {'$'.repeat(park.priceLevel)}</span>
                  ) : null}
                </>
              ) : park.website ? (
                <>
                  Rates not published —{' '}
                  <Link href={park.website} target="_blank" rel="nofollow noopener">
                    check reservation page
                  </Link>
                </>
              ) : (
                <>Rates not published</>
              )}
            </td>
          </tr>
          <tr>
            <th>Rating</th>
            <td>
              {park.rating !== null && park.reviewCount !== null ? (
                <span className="badge ok">
                  {fmtStars(park.rating)} {fmtRating(park)}
                  {park.googleUrl ? (
                    <>
                      {' '}
                      <Link href={park.googleUrl} target="_blank" rel="nofollow noopener">
                        (Google reviews)
                      </Link>
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="badge warn">No reviews yet</span>
              )}
            </td>
          </tr>
          <tr>
            <th>Sites</th>
            <td>{fmtSiteCount(park)}</td>
          </tr>
          <tr>
            <th>Hookups</th>
            <td>{park.hookups === null ? '— (Phase 1 data)' : park.hookups}</td>
          </tr>
          <tr>
            <th>Pets</th>
            <td>{park.petPolicy ?? 'Not listed'}</td>
          </tr>
          {park.website ? (
            <tr>
              <th>Reservations</th>
              <td>
                <Link href={park.website} target="_blank" rel="nofollow noopener">
                  Official reservation page
                </Link>
              </td>
            </tr>
          ) : null}
          <tr>
            <th>Amenities</th>
            <td>
              {park.amenities.length > 0 ? (
                park.amenities.map((a) => (
                  <span className="badge" key={a}>
                    {a}
                  </span>
                ))
              ) : (
                <span className="muted">Not listed</span>
              )}
            </td>
          </tr>
          {park.source.equipment.length > 0 ? (
            <tr>
              <th>Allowed equipment</th>
              <td>
                {park.source.equipment.map((e) => (
                  <span className="badge" key={e}>
                    {e}
                  </span>
                ))}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <WeatherCard park={park} />

      {/* Owner claim/update funnel (mailto to Director-controlled inbox). */}
      <ClaimForm park={park} />

      {/* FTC disclosure sits ABOVE the first affiliate slot on this page. */}
      <AffiliateDisclosure slotId={`park-${park.facilityId}-reserve`} />

      <section>
        <h2>Nearby campgrounds</h2>
        <ul className="plain">
          {near.map((n) => (
            <li key={n.facilityId}>
              <Link href={`/parks/tx/${n.slug}/`}>{n.name}</Link>{' '}
              <span className="muted">
                — {n.city ?? 'Texas'} · {fmtPrice(n)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Browse related</h2>
        <ul className="plain">
          {city ? (
            <li>
              <Link href={`/rv-parks/texas/${getCitySlug(park)}/`}>
                RV parks in {city}, TX
              </Link>
            </li>
          ) : null}
          <li>
            <Link href="/rv-parks/texas/">All RV parks &amp; campgrounds in {STATE_NAME}</Link>
          </li>
          {parkAmenityHubs.length > 0 ? (
            <li>
              <span className="muted">Amenity filters this park matches: </span>
              {parkAmenityHubs.map((a, i) => (
                <span key={a.slug}>
                  {i > 0 ? ' · ' : ''}
                  <Link href={`/rv-parks/${a.slug}/`}>{a.title}</Link>
                </span>
              ))}
            </li>
          ) : null}
          <li>
            <Link href="/rv-parks/amenities/">All RV park amenities in {STATE_NAME}</Link>
          </li>
          {amenityHubs.map((a) => (
            <li key={a.slug}>
              <Link href={`/rv-parks/${a.slug}/`}>{a.title}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
