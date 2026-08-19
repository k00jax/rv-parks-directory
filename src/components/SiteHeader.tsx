import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          RV Parks &amp; Campgrounds
        </Link>
        <nav>
          <Link href="/rv-parks/texas/">Texas RV Parks</Link>
          <Link href="/rv-parks/amenities/">Amenities</Link>
          <Link href="/rv-parks/full-hookup/">Full Hookup</Link>
          <Link href="/rv-parks/50-amp/">50 Amp</Link>
        </nav>
      </div>
    </header>
  );
}
