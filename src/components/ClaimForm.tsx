import type { Park } from '@/lib/types';

// Director-controlled mailbox for park owner claims/updates (director-1 routes
// these into the data pipeline). Change the address here; it feeds every page.
const CLAIM_EMAIL = 'claims@fonger.ai';

/**
 * ClaimForm — "Is this your park? Claim & update rates".
 *
 * Static-export safe: NO <form>, no onSubmit, no client JS. Renders a <div>
 * with a mailto: LINK (styled as a button) to the Director-controlled
 * mailbox, prefilled with the park name and rate fields. Zero backend, zero
 * infra — owner submissions arrive by email and enter the data pipeline as
 * verified updates.
 */
export default function ClaimForm({ park }: { park: Park }) {
  const subject = encodeURIComponent(`Claim: ${park.name}`);
  const body = encodeURIComponent(
    [
      `Park: ${park.name}`,
      `City: ${park.city ?? '—'}, ${park.state}`,
      `Facility ID: ${park.facilityId}`,
      ``,
      `I manage this park and would like to update its listing.`,
      ``,
      `Nightly rate min ($):`,
      `Nightly rate max ($):`,
      `Hookups (full/partial/none):`,
      `Website / reservation URL:`,
      ``,
      `(Rates are verified before display.)`,
    ].join('\n')
  );
  const href = `mailto:${CLAIM_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <div className="claim">
      <h2>Is this your park? Claim &amp; update rates</h2>
      <p>
        Own or manage {park.name}? Submit your current nightly rates and we will
        verify them before display — owner submissions update the rate fields
        (nightlyPriceMin / nightlyPriceMax) through our data pipeline.
      </p>
      <a className="btn" href={href}>
        Claim &amp; update rates
      </a>
    </div>
  );
}
