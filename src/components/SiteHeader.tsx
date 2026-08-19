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
          <Link href="/rv-parks/full-hookup/">Full Hookup</Link>
          <Link href="/rv-parks/pet-friendly/">Pet Friendly</Link>
          <Link href="/rv-parks/lakefront/">Lakefront</Link>
        </nav>
      </div>
    </header>
  );
}
