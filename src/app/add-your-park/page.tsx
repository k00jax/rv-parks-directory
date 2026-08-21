import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';

// Director-controlled mailbox for owner park-addition requests. Same mailbox
// as claims/updates — director-1 routes these into the data pipeline.
const OWNER_EMAIL = 'claims@fonger.ai';

export const metadata: Metadata = {
  title: 'Add Your Campground — American RV Parks',
  description:
    'Own or manage an RV park or campground that is not listed on American RV Parks? Request to add it — free, verified from public Recreation.gov data.',
};

export default function AddParkPage() {
  const subject = encodeURIComponent('Add my park: [Park name]');
  const body = encodeURIComponent(
    [
      `Park name:`,
      `City:`,
      `State:`,
      `Street address (if public):`,
      `Phone:`,
      `Website / reservation URL:`,
      `Amenities (hookups, showers, dump station, etc.):`,
      `Nightly rate range ($):`,
      ``,
      `(We add parks from verified public data before display.)`,
    ].join('\n')
  );
  const href = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <div className="park-page">
      <Breadcrumbs crumbs={[{ label: 'Add your campground' }]} />
      <h1>Own a campground? List it here.</h1>
      <p className="muted" style={{ fontSize: '1.02rem' }}>
        Can&apos;t find your park in our directory? We add campgrounds from verified public data —
        submit your details and we&apos;ll get it listed.
      </p>

      <section style={{ marginTop: '1.2rem' }}>
        <h2>Why list on American RV Parks?</h2>
        <ul className="plain">
          <li>
            <strong>Free visibility</strong> — your park appears in a nationwide directory that ranks
            campgrounds by real Google ratings and reviews.
          </li>
          <li>
            <strong>Honest data</strong> — we show verified rates, amenities, and contact info from
            public Recreation.gov data. Nothing invented.
          </li>
          <li>
            <strong>Claim &amp; update</strong> — once listed, you can claim your park and update its
            rates, photos, and details through our owner funnel.
          </li>
        </ul>
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2>Request to add your park</h2>
        <p>
          Fill in the details (or just send your park&apos;s name and location) — our team verifies
          the listing before it goes live.
        </p>
        <a className="btn btn-green" href={href}>
          Request to add my park →
        </a>
        <p className="small table-explain" style={{ marginTop: '0.8rem' }}>
          No account needed. Submissions go to our verified-data mailbox and are processed before
          display.
        </p>
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2>Already listed?</h2>
        <p>
          Search for your park, open its page, and use the <strong>Claim &amp; update rates</strong>{' '}
          button to take control of the listing.
        </p>
        <p>
          <Link href="/">Search all parks</Link> or <Link href="/rv-parks/amenities/">browse by amenity</Link>.
        </p>
      </section>
    </div>
  );
}
