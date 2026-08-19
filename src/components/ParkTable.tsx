'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Park } from '@/lib/types';
import { fmtPrice, fmtRating } from '@/lib/parks';

type SortKey = 'name' | 'city' | 'price' | 'rating' | 'sites';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Campground' },
  { key: 'city', label: 'City' },
  { key: 'price', label: 'Nightly price' },
  { key: 'rating', label: 'Rating' },
  { key: 'sites', label: 'Sites' },
];

// Text columns (alpha) use string values; numeric columns use nullable numbers.
const NUMERIC_KEYS: SortKey[] = ['price', 'rating', 'sites'];

// Raw value used for comparison. Numeric columns return null when unknown
// (these always sort LAST regardless of direction). Text columns never null.
function sortValue(p: Park, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return p.name.toLowerCase();
    case 'city':
      return (p.city ?? '').toLowerCase();
    case 'price':
      return p.nightlyPriceMin ?? p.nightlyPriceMax;
    case 'rating':
      return p.rating;
    case 'sites':
      return p.siteCount;
  }
}

const ARROW: Record<SortDir, string> = { asc: '▲', desc: '▼' };

export default function ParkTable({ parks }: { parks: Park[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const arr = [...parks];
    const dir = sortDir === 'asc' ? 1 : -1;
    const numeric = NUMERIC_KEYS.includes(sortKey);
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (numeric) {
        // nulls always sort last, independent of direction
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (va === vb) return 0;
        return va < vb ? -dir : dir;
      }
      const sa = String(va);
      const sb = String(vb);
      if (sa === sb) return 0;
      return sa < sb ? -dir : dir;
    });
    return arr;
  }, [parks, sortKey, sortDir]);

  if (parks.length === 0) {
    return <p className="muted">No parks match this list yet.</p>;
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <table className="data sortable">
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const active = c.key === sortKey;
            const ariaSort = active
              ? sortDir === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none';
            return (
              <th
                key={c.key}
                data-sort={c.key}
                scope="col"
                aria-sort={ariaSort}
              >
                <button
                  type="button"
                  className="sort-btn"
                  data-sort={c.key}
                  onClick={() => handleSort(c.key)}
                  aria-label={`Sort by ${c.label} ${
                    active && sortDir === 'asc' ? 'descending' : 'ascending'
                  }`}
                >
                  {c.label}
                  {active ? <span className="sort-ind">{ARROW[sortDir]}</span> : null}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
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
