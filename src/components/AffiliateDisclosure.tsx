/**
 * Affiliate compliance per brief section 7 + skill:
 * - FTC disclosure rendered ABOVE the first affiliate link/slot on the page.
 * - Phase 0 has no live affiliate links: this renders the disclosure plus a
 *   reserved (non-clickable) slot where an affiliate CTA will go in Phase 2.
 *   When real links are added they MUST use rel="sponsored nofollow".
 */
export default function AffiliateDisclosure({ slotId }: { slotId: string }) {
  return (
    <>
      <div className="disclosure" data-testid="affiliate-disclosure">
        <strong>Affiliate disclosure:</strong> if you book a stay through links on this page, we
        may earn a commission at no extra cost to you. Phase 0 pilot — booking links are reserved,
        not yet live.
      </div>
      <div className="affiliate-slot" data-affiliate-slot={slotId} data-testid="affiliate-slot">
        Reserved affiliate slot: <code>{slotId}</code> — booking partner CTA (e.g. Recreation.gov
        reservation link) goes here in Phase 2 with <code>rel=&quot;sponsored nofollow&quot;</code>.
      </div>
    </>
  );
}
