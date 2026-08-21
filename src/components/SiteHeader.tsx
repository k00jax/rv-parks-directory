import Link from 'next/link';

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
        <nav>
          <Link href="/">RV Parks</Link>
          <Link href="/rv-parks/amenities/">Amenities</Link>
          <Link href="/rv-parks/full-hookup/">Full Hookup</Link>
          <Link href="/rv-parks/50-amp/">50 Amp</Link>
        </nav>
      </div>
    </header>
  );
}
