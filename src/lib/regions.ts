// US region groupings for the nav mega-menu ("Browse by State").
// Pure static data — NO import of the parks dataset, so SiteHeader (rendered
// on every page via the root layout) never pulls park JSON into its bundle.
//
// The dataset covers 48 states (DE, DC, RI are absent from Recreation.gov
// source data) — every abbr here exists and links to a live /rv-parks/{abbr}/.
//
// One consistent grouping (no state appears in two regions):
//   Pacific   — West Coast + Alaska + Hawaii
//   West      — Mountain/West interior (incl. AZ + NM)
//   Southwest — TX + OK (AZ/NM live in West per the grouping above)
//   Midwest   — Great Plains + Great Lakes interior
//   Southeast — South Atlantic + Gulf + lower Mississippi
//   Northeast — New England + Mid-Atlantic
export interface RegionState {
  abbr: string;
  name: string;
}

export interface Region {
  name: string;
  states: RegionState[];
}

export const REGIONS: Region[] = [
  {
    name: 'Pacific',
    states: [
      { abbr: 'AK', name: 'Alaska' },
      { abbr: 'CA', name: 'California' },
      { abbr: 'HI', name: 'Hawaii' },
      { abbr: 'OR', name: 'Oregon' },
      { abbr: 'WA', name: 'Washington' },
    ],
  },
  {
    name: 'West',
    states: [
      { abbr: 'AZ', name: 'Arizona' },
      { abbr: 'CO', name: 'Colorado' },
      { abbr: 'ID', name: 'Idaho' },
      { abbr: 'MT', name: 'Montana' },
      { abbr: 'NM', name: 'New Mexico' },
      { abbr: 'NV', name: 'Nevada' },
      { abbr: 'UT', name: 'Utah' },
      { abbr: 'WY', name: 'Wyoming' },
    ],
  },
  {
    name: 'Southwest',
    states: [
      { abbr: 'OK', name: 'Oklahoma' },
      { abbr: 'TX', name: 'Texas' },
    ],
  },
  {
    name: 'Midwest',
    states: [
      { abbr: 'IA', name: 'Iowa' },
      { abbr: 'IL', name: 'Illinois' },
      { abbr: 'IN', name: 'Indiana' },
      { abbr: 'KS', name: 'Kansas' },
      { abbr: 'MI', name: 'Michigan' },
      { abbr: 'MN', name: 'Minnesota' },
      { abbr: 'MO', name: 'Missouri' },
      { abbr: 'ND', name: 'North Dakota' },
      { abbr: 'NE', name: 'Nebraska' },
      { abbr: 'OH', name: 'Ohio' },
      { abbr: 'SD', name: 'South Dakota' },
      { abbr: 'WI', name: 'Wisconsin' },
    ],
  },
  {
    name: 'Southeast',
    states: [
      { abbr: 'AL', name: 'Alabama' },
      { abbr: 'AR', name: 'Arkansas' },
      { abbr: 'FL', name: 'Florida' },
      { abbr: 'GA', name: 'Georgia' },
      { abbr: 'KY', name: 'Kentucky' },
      { abbr: 'LA', name: 'Louisiana' },
      { abbr: 'MD', name: 'Maryland' },
      { abbr: 'MS', name: 'Mississippi' },
      { abbr: 'NC', name: 'North Carolina' },
      { abbr: 'SC', name: 'South Carolina' },
      { abbr: 'TN', name: 'Tennessee' },
      { abbr: 'VA', name: 'Virginia' },
      { abbr: 'WV', name: 'West Virginia' },
    ],
  },
  {
    name: 'Northeast',
    states: [
      { abbr: 'CT', name: 'Connecticut' },
      { abbr: 'MA', name: 'Massachusetts' },
      { abbr: 'ME', name: 'Maine' },
      { abbr: 'NH', name: 'New Hampshire' },
      { abbr: 'NJ', name: 'New Jersey' },
      { abbr: 'NY', name: 'New York' },
      { abbr: 'PA', name: 'Pennsylvania' },
      { abbr: 'VT', name: 'Vermont' },
    ],
  },
];
