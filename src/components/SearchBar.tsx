'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchPark {
  name: string;
  slug: string;
  state: string;
  city: string | null;
}

export interface SearchCity {
  name: string;
  slug: string;
  state?: string;
}

export interface SearchState {
  abbr: string;
  name: string;
  count: number;
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
  states,
}: {
  parks: SearchPark[];
  cities: SearchCity[];
  states: SearchState[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Result priority: STATES first (2-letter abbr or state-name match), then
  // cities, then parks. State suggestions carry the honest per-state park
  // count and deep-link to the state hub (/rv-parks/{abbr}/).
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    const stateMatches =
      term.length === 2
        ? states.filter((s) => s.abbr.toLowerCase() === term).slice(0, 4)
        : term.length >= 3
          ? states.filter((s) => s.name.toLowerCase().includes(term)).slice(0, 4)
          : [];
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
    if (stateMatches.length === 0 && cityMatches.length === 0 && parkMatches.length === 0)
      return 'empty';
    return { stateMatches, cityMatches, parkMatches };
  }, [q, parks, cities, states]);

  function go(url: string) {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(url);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!results || results === 'empty') return;
    // Submit priority mirrors the dropdown order: state → city → park.
    const firstState = results.stateMatches[0];
    const firstCity = results.cityMatches[0];
    const firstPark = results.parkMatches[0];
    if (firstState) go(`/rv-parks/${firstState.abbr.toLowerCase()}/`);
    else if (firstCity) go(`/rv-parks/${(firstCity.state ?? 'tx').toLowerCase()}/${firstCity.slug}/`);
    else if (firstPark) go(`/parks/${firstPark.state.toLowerCase()}/${firstPark.slug}/`);
  }

  // 'Search all parks' zero-result recovery: clear the query and refocus the
  // input so the full directory is one keystroke away.
  function searchAllParks() {
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
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
          placeholder="Search a park, city, or state…"
          aria-label="Search parks, cities, or states"
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
          {results.stateMatches.length > 0 ? (
            <>
              <li className="search-result-group" role="presentation">
                States
              </li>
              {results.stateMatches.map((s) => (
                <li key={`s-${s.abbr}`}>
                  <a
                    href={`/rv-parks/${s.abbr.toLowerCase()}/`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(`/rv-parks/${s.abbr.toLowerCase()}/`);
                    }}
                  >
                    {PIN}
                    {s.name} — {s.count} parks
                    <span className="res-meta">State</span>
                  </a>
                </li>
              ))}
            </>
          ) : null}

          {results.cityMatches.length > 0 ? (
            <>
              <li className="search-result-group" role="presentation">
                Cities
              </li>
              {results.cityMatches.map((c) => (
                <li key={`c-${c.slug}`}>
                  <a
                    href={`/rv-parks/${(c.state ?? 'tx').toLowerCase()}/${c.slug}/`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(`/rv-parks/${(c.state ?? 'tx').toLowerCase()}/${c.slug}/`);
                    }}
                  >
                    {PIN}
                    {titleCase(c.name)}, {c.state ?? 'TX'}
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
                    href={`/parks/${p.state.toLowerCase()}/${p.slug}/`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(`/parks/${p.state.toLowerCase()}/${p.slug}/`);
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
            <span className="search-empty-msg">
              No public RV parks found for “{q.trim()}”.
            </span>
            <button type="button" className="search-empty-btn" onClick={searchAllParks}>
              Search all parks
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
