import { AFFILIATES } from '@/lib/affiliates';

/**
 * Affiliate compliance per brief section 7 + skill:
 * - FTC disclosure rendered ABOVE the first affiliate link/slot on the page.
 * - Phase 2: the slot carries a REAL booking CTA to the park's official
 *   Recreation.gov reservation page (or an honest fallback to Recreation.gov
 *   when the dataset has no URL — never fabricate), plus partner CTAs to
 *   RVshare + Outdoorsy. Every monetized link uses rel="sponsored nofollow noopener".
 */
export default function AffiliateDisclosure({
  website,
  slotId,
}: {
  website: string | null;
  slotId: string;
}) {
  return (
    <>
      <div className="disclosure" data-testid="affiliate-disclosure">
        <strong>Affiliate disclosure:</strong> we may earn a commission from links
        (including booking and partner links) at no extra cost to you.
      </div>
      <div className="affiliate-slot" data-affiliate-slot={slotId} data-testid="affiliate-slot">
        {website ? (
          <a
            className="btn btn-book"
            href={website}
            target="_blank"
            rel="sponsored nofollow noopener"
          >
            Book this campground
          </a>
        ) : (
          <p className="affiliate-fallback">
            Rates not published —{' '}
            <a
              href="https://www.recreation.gov/"
              target="_blank"
              rel="sponsored nofollow noopener"
            >
              check Recreation.gov
            </a>
          </p>
        )}
        <p className="affiliate-partner">
          Compare rental RVs near this park on{' '}
          <a
            href={AFFILIATES.rvshare.url}
            target="_blank"
            rel="sponsored nofollow noopener"
          >
            {AFFILIATES.rvshare.label}
          </a>{' '}
          or{' '}
          <a
            href={AFFILIATES.outdoorsy.url}
            target="_blank"
            rel="sponsored nofollow noopener"
          >
            {AFFILIATES.outdoorsy.label}
          </a>{' '}
          →
        </p>
      </div>
    </>
  );
}
