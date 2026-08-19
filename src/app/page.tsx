import type { Metadata } from 'next';
import Link from 'next/link';
import ParkTable from '@/components/ParkTable';
import { amenityHubs, cities, datasetMeta, parks } from '@/lib/parks';

export const metadata: Metadata = {
  title: 'RV Parks & Campgrounds Directory — All Texas Parks',
  description: `Browse all ${parks.length} campgrounds and RV parks in Texas with prices, ratings, and amenities from Recreation.gov data.`,
};

export default function HomePage() {
  const lastVerified = datasetMeta.lastVerified;
  return (
    <div>
      <h1>RV Parks &amp; Campgrounds Directory — Texas</h1>
      <p className="muted">
        Every campground listed on this site, driven by public Recreation.gov (RIDB) facility data.
        {parks.length} parks · {cities.length} cities · verified {lastVerified}.
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
        <h2>Browse by amenity</h2>
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
          <div className="card">
            <Link href="/rv-parks/amenities/">All RV park amenities in Texas</Link>
            <div className="muted">Full amenity filter index</div>
          </div>
        </div>
      </section>

      <section>
        <h2>All campgrounds in Texas ({parks.length})</h2>
        <ParkTable parks={parks} />
      </section>

      <p className="small muted" style={{ marginTop: '2rem' }}>
        Phase 0 pilot. Missing values (prices, ratings, hookups) are shown as “—” when the source
        data does not publish them — nothing on this site is estimated or invented. Data:{' '}
        {datasetMeta.source} · fetched {datasetMeta.fetchedAt}.
      </p>
    </div>
  );
}
