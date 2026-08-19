#!/usr/bin/env python3
"""Parse nightly prices from RIDB facility_use_fee_description fields.

The RIDB free-text fee descriptions are HTML like:
  "<p>Camping Fee $6.00 per night (includes parking for up to 2 vehicles)</p>"
  "<p>$40 Screen Shelter with water & 50 amp electric hookups</p>"
  "<p>$22 fee applies to 50 amp electrical service sites.</p>"

Strategy (honest, never invents):
  1. Strip HTML tags, decode entities.
  2. Find all $ amounts with nearby "night"/"day"/"fee"/context.
  3. Prefer explicit "per night" / "nightly" amounts.
  4. If no per-night marker, take the SMALLEST amount that appears in a
     camping/electrical/RV/shelter context (site types, not day-use).
  5. Only set a price when we have at least one $ amount clearly tied to
     staying overnight. Day-use-only / boat-ramp / event fees are EXCLUDED
     unless a camping amount is also present.
  6. Store min/max + a source note + the raw snippet for audit.
"""
import json, re, glob, html as html_mod, sys

# contexts that mean "you stay overnight here"
CAMP_CTX = re.compile(
    r'(night|nightly|overnight|camp\w*|rv\b|hookup|electrical|electric|'
    r'shelter|cabin|site|tent|per person|person)',
    re.I)
# contexts that mean "you do NOT stay overnight" (exclude unless camping present)
DAY_CTX = re.compile(
    r'(day use|day-use|boat launch|boat ramp|entry|parking|per vehicle|'
    r'per day|event|banquet|wedding|pavilion|picnic|swim)', re.I)


def parse_fee_text(raw):
    if not raw or not raw.strip():
        return None
    text = html_mod.unescape(re.sub(r'<[^>]+>', ' ', raw))
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return None

    # all $ amounts: (amount, 40 chars before, 40 chars after)
    amounts = []
    for m in re.finditer(r'\$(\d{1,4}(?:\.\d{2})?)', text):
        amt = float(m.group(1))
        if amt < 3 or amt > 2000:
            continue  # clearly not a nightly site fee
        before = text[max(0, m.start() - 60):m.start()]
        after = text[m.end():m.end() + 60]
        amounts.append((amt, before, after))

    if not amounts:
        return None

    # 1) explicit per-night / nightly amounts first
    nightly = [a for a in amounts if re.search(r'night|overnight', a[1] + ' ' + a[2], re.I)]
    if nightly:
        vals = sorted(a[0] for a in nightly)
        return {'min': vals[0], 'max': vals[-1], 'source': 'ridb-fee-description',
                'note': 'nightly', 'raw': text[:400]}

    # 2) amounts in camping contexts (site/shelter/RV/electrical/tent)
    camp_amt = [a for a in amounts if CAMP_CTX.search(a[1] + ' ' + a[2])
                and not DAY_CTX.search(a[1] + ' ' + a[2])]
    if camp_amt:
        vals = sorted(a[0] for a in camp_amt)
        return {'min': vals[0], 'max': vals[-1], 'source': 'ridb-fee-description',
                'note': 'camping-context', 'raw': text[:400]}

    # 3) if ONLY day-use amounts, no price (a day-use fee is not a nightly rate)
    return None


def main():
    # map facility_id -> raw file
    parks = json.load(open('src/data/parks.tx.json'))['parks']
    by_fid = {str(p.get('facilityId')): p for p in parks if p.get('facilityId')}

    parsed = 0
    skipped_dayuse = 0
    for f in sorted(glob.glob('scripts/raw/facility-*.json')):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        cg = d.get('campground') or {}
        fid = str(cg.get('facility_id') or '')
        if fid not in by_fid:
            continue
        fee = cg.get('facility_use_fee_description') or ''
        if not fee or len(fee.strip()) < 3:
            continue
        res = parse_fee_text(fee)
        p = by_fid[fid]
        if res:
            p['nightlyPriceMin'] = res['min']
            p['nightlyPriceMax'] = res['max']
            p['priceSource'] = res['source']
            p['priceNote'] = res.get('note', '')
            p['priceRaw'] = res.get('raw', '')
            parsed += 1
        else:
            # only counts as "skipped" if it had $ but was day-use-only
            if re.search(r'\$', fee):
                skipped_dayuse += 1

    json.dump({'parks': parks,
               'meta': json.load(open('src/data/parks.tx.json'))['meta']},
              open('src/data/parks.tx.json', 'w'), indent=2)
    print(f"parks priced from fee descriptions: {parsed} (+2 existing = {parsed + 2} total)")
    print(f"had $ but skipped (day-use/event only): {skipped_dayuse}")


if __name__ == '__main__':
    main()
