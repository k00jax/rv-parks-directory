/**
 * Affiliate tracking links — single source of truth for the ARVP site.
 * Swap any URL here and the whole site updates (static export picks it up
 * on next build).
 *
 * Status:
 * - RVshare: CJ publisher CID 8050362. Application pending; CJ click-through
 *   URL needs the advertiser ID (form: https://www.jdoqocy.com/click-8050362-{ADV}-{SITE}?url=...)
 *   Once approved, replace RVSHARE_URL with the CJ click link + keep the
 *   generic rvshare.com fallback only until then.
 * - Outdoorsy: anonymous ID 5a2727b7-ecd6-4d7c-a4fb-1528a0ad1837
 *   Link format: https://www.outdoorsy.com/r/{id}
 * - Hipcamp: affiliate_id kylef7b93e5
 *   Link format: https://www.hipcamp.com/en-US/search?affiliate_id={id}
 * - The Dyrt: skipped (PRO costs money; revisit when traffic justifies).
 * - Harvest Hosts: skipped (membership fee; revisit later).
 *
 * FTC compliance: every monetized link renders with
 * rel="sponsored nofollow noopener" and the disclosure renders above it
 * (AffiliateDisclosure.tsx).
 */
export const AFFILIATES = {
  rvshare: {
    label: 'RVshare',
    url: 'https://www.rvshare.com/', // TODO: swap for CJ click URL when approved
    note: 'CJ publisher CID 8050362 — tracking URL pending advertiser approval',
  },
  outdoorsy: {
    label: 'Outdoorsy',
    url: 'https://www.outdoorsy.com/r/5a2727b7-ecd6-4d7c-a4fb-1528a0ad1837',
    note: 'anonymous ID wired',
  },
  hipcamp: {
    label: 'Hipcamp',
    url: 'https://www.hipcamp.com/en-US/search?affiliate_id=kylef7b93e5',
    note: 'affiliate_id wired',
  },
} as const;

export type AffiliateKey = keyof typeof AFFILIATES;
