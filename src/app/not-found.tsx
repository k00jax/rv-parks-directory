import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p className="muted">
        This page does not exist. Browse the full directory from the{' '}
        <Link href="/">homepage</Link> or the <Link href="/rv-parks/texas/">Texas hub</Link>.
      </p>
    </div>
  );
}
