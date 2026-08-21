'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchPark {
  name: string;
  slug: string;
  city: string | null;
}

export interface SearchCity {
  name: string;
  slug: string;
}

// Pin + magnifier SVG icons (filled, thick outline look).
const PIN = (
  <svg viewBox="0 0 24 24" className="res-icon" aria-hidden="true">
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
);
const MAG = (
  <svg viewBox="0 0 24 24" className="search-btn-icon" aria-hidden="true">
    <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
  </svg>
);

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (/^\s*$/.test(w) || w === '-' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

export default function SearchBar({
  parks,
  cities,
}: {
  parks: SearchPark[];
  cities: SearchCity[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    const cityMatches = cities
      .filter((c) => c.name.toLowerCase().includes(term))
      .slice(0, 6);
    const parkMatches = parks
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.city ?? '').toLowerCase().includes(term)
      )
      .slice(0, 10);
    if (cityMatches.length === 0 && parkMatches.length === 0) return 'empty';
    return { cityMatches, parkMatches };
  }, [q, parks, cities]);

  function go(url: string) {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(url);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!results || results === 'empty') return;
    const firstPark = results.parkMatches[0];
    const firstCity = results.cityMatches[0];
    if (firstPark) go(`/parks/tx/${firstPark.slug}/`);
    else if (firstCity) go(`/rv-parks/texas/${firstCity.slug}/`);
  }

  return (
    <div className="hero-search-wrap">
      <span className="search-label">Find Your Perfect RV Stay</span>
      <form className="search-form" role="search" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search a park, city, or amenity…"
          aria-label="Search parks, cities, or amenities"
        />
        <button
          className="search-btn"
          type="submit"
          aria-label="Search"
          style={{ background: 'linear-gradient(135deg, #FFD166 0%, #FF4D00 100%)' }}
        >
          {MAG}
          <span>Search</span>
        </button>
      </form>

      {open && q.trim() && results && results !== 'empty' ? (
        <ul className="search-results" role="listbox" aria-label="Search results">
          {results.cityMatches.length > 0 ? (
            <>
              <li className="search-result-group" role="presentation">
                Cities
              </li>
              {results.cityMatches.map((c) => (
                <li key={`c-${c.slug}`}>
                  <a
                    href={`/rv-parks/texas/${c.slug}/`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(`/rv-parks/texas/${c.slug}/`);
                    }}
                  >
                    {PIN}
                    {titleCase(c.name)}, TX
                    <span className="res-meta">City</span>
                  </a>
                </li>
              ))}
            </>
          ) : null}

          {results.parkMatches.length > 0 ? (
            <>
              <li className="search-result-group" role="presentation">
                RV Parks
              </li>
              {results.parkMatches.map((p) => (
                <li key={`p-${p.slug}`}>
                  <a
                    href={`/parks/tx/${p.slug}/`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(`/parks/tx/${p.slug}/`);
                    }}
                  >
                    {PIN}
                    {titleCase(p.name)}
                    {p.city ? <span className="res-meta">{titleCase(p.city)}</span> : null}
                  </a>
                </li>
              ))}
            </>
          ) : null}
        </ul>
      ) : null}

      {open && q.trim() && results === 'empty' ? (
        <ul className="search-results" role="listbox" aria-label="Search results">
          <li className="search-empty">
            No parks or cities match “{q.trim()}”. Try a city like Waco or an RV park name.
          </li>
        </ul>
      ) : null}
    </div>
  );
}
