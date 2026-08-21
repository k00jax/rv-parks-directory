#!/usr/bin/env node
/**
 * generate-sitemaps.mjs — emits sitemap-index.xml + per-family segments into docs/
 * after `next build`. Per brief section 3: sitemap-index + per-family sitemaps,
 * lastmod = updatedAt (lastVerified).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs');

const SITE_URL = (process.env.SITE_URL || 'https://rvparks.example.com').replace(/\/$/, '');

const parks = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'parks.us.json'), 'utf8')).parks;
const cities = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'cities.us.json'), 'utf8')).cities;
const stateAbbrs = Array.from(new Set(parks.map((p) => p.state))).sort();
// Amenity slugs — must match the amenityHubs slugs in src/lib/parks.ts.
// Single terms from the dataset vocabulary, then the combined pages.
const amenities = [
  'boat-ramp',
  'showers',
  'water-hookup',
  'dump-station',
  'playground',
  'flush-toilets',
  '50-amp',
  '30-amp',
  '20-amp',
  'laundry',
  'full-hookup',
  '50-amp-full-hookup',
];

mkdirSync(OUT, { recursive: true });

const url = (loc, lastmod) =>
  `  <url><loc>${SITE_URL}${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;

const parksXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parks
  .map((p) => url(`/parks/${p.state.toLowerCase()}/${p.slug}/`, p.lastVerified))
  .join('\n')}\n</urlset>\n`;

const citiesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${url('/', null)}
${stateAbbrs
  .map((s) => url(`/rv-parks/${s.toLowerCase()}/`, parks.find((p) => p.state === s)?.lastVerified ?? null))
  .join('\n')}
${cities
  .map((c) => url(`/rv-parks/${(c.state ?? 'tx').toLowerCase()}/${c.slug}/`, parks.find((p) => p.facilityId === c.parkIds[0])?.lastVerified ?? null))
  .join('\n')}\n</urlset>\n`;

const amenitiesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${url('/rv-parks/amenities/', null)}\n${amenities
  .map((a) => `${url(`/rv-parks/${a}/`, null)}\n${stateAbbrs.map((s) => url(`/rv-parks/${s.toLowerCase()}/${a}/`, null)).join('\n')}`)
  .join('\n')}\n</urlset>\n`;

const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_URL}/sitemap-parks.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-cities.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-amenities.xml</loc></sitemap>
</sitemapindex>\n`;

writeFileSync(join(OUT, 'sitemap-index.xml'), indexXml);
writeFileSync(join(OUT, 'sitemap-parks.xml'), parksXml);
writeFileSync(join(OUT, 'sitemap-cities.xml'), citiesXml);
writeFileSync(join(OUT, 'sitemap-amenities.xml'), amenitiesXml);

const count = (xml, tag) => (xml.match(/<url>/g) || []).length;
console.log(
  `[sitemaps] wrote sitemap-index.xml, sitemap-parks.xml (${count(parksXml)}), sitemap-cities.xml (${count(citiesXml)}), sitemap-amenities.xml (${count(amenitiesXml)}) -> docs/`
);
