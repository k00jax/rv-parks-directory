import Link from 'next/link';
import type { Park } from '@/lib/types';
import { fmtPrice, fmtRating } from '@/lib/parks';

export default function ParkTable({ parks }: { parks: Park[] }) {
  if (parks.length === 0) {
    return <p className="muted">No parks match this list yet.</p>;
  }
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Campground</th>
          <th>City</th>
          <th>Nightly price</th>
          <th>Rating</th>
          <th>Sites</th>
        </tr>
      </thead>
      <tbody>
        {parks.map((p) => (
          <tr key={p.facilityId}>
            <td>
              <Link href={`/parks/tx/${p.slug}/`}>{p.name}</Link>
            </td>
            <td>{p.city ?? '—'}</td>
            <td>{fmtPrice(p)}</td>
            <td>{fmtRating(p)}</td>
            <td>{p.siteCount ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
