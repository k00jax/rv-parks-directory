import Link from 'next/link';
import { REGIONS } from '@/lib/regions';

// Nav mega-menu "States": a <details> disclosure so the panel works with NO
// JavaScript (the root layout renders this header on every page). Desktop
// shows the 6 regional columns on hover OR click (CSS only); mobile collapses
// to an in-flow stacked disclosure via media query. Every state links to its
// live /rv-parks/{abbr}/ hub (48 states — DE, DC, RI are absent from the
// Recreation.gov source data and are intentionally not listed).
export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          <svg viewBox="0 0 24 24" className="brand-icon" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
          American RV Parks
        </Link>
        <nav aria-label="Main">
          <Link href="/">RV Parks</Link>
          <details className="nav-states">
            <summary className="nav-states-btn">
              States
              <span className="nav-caret" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="nav-states-panel">
              {REGIONS.map((region) => (
                <div className="nav-region" key={region.name}>
                  <span className="nav-region-name">{region.name}</span>
                  {region.states.map((s) => (
                    <Link
                      key={s.abbr}
                      className="nav-region-state"
                      href={`/rv-parks/${s.abbr.toLowerCase()}/`}
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <Link href="/rv-parks/amenities/">Amenities</Link>
          <Link href="/rv-parks/full-hookup/">Full Hookup</Link>
          <Link href="/rv-parks/50-amp/">50 Amp</Link>
          <Link href="/add-your-park/" className="nav-owner">
            List your park
          </Link>
        </nav>
      </div>
    </header>
  );
}
