#!/usr/bin/env node
// Generates landing pages from src/data.json + src/templates/landing.html.
// Usage: node build.mjs            -> builds the pages listed in data.build
//        node build.mjs --all      -> builds every brand × appliance page that has appliance data
// The homepage (/index.html) is never touched.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(ROOT, 'src/data.json'), 'utf8'));
const template = readFileSync(join(ROOT, 'src/templates/landing.html'), 'utf8');
const { site, serviceArea, brands, appliances, reviews } = data;

// Words Google Ads flags next to brand names (ТЗ, раздел 2).
const BANNED = [/authori[sz]ed/i, /\bofficial\b/i, /factory[- ]certified/i, /service center/i, /\bcertified\b/i];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STARS = '<svg><use href="#star"/></svg>'.repeat(5);

function listBrands(appKey, exceptSlug) {
  const names = Object.entries(brands)
    .filter(([slug, b]) => slug !== exceptSlug && b.appliances.includes(appKey))
    .map(([, b]) => b.name);
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function gtagBlock() {
  const id = site.tracking.gtagId;
  if (!id) return '<!-- Google tag: set site.tracking.gtagId in src/data.json and rebuild -->';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(id)}');</script>`;
}

function buildPage({ brand: brandSlug, appliance: appKey }) {
  const app = appliances[appKey];
  if (!app) throw new Error(`No appliance data for "${appKey}"`);
  const brand = brandSlug ? brands[brandSlug] : null;
  if (brandSlug && !brand) throw new Error(`Unknown brand "${brandSlug}"`);
  if (brand && !brand.appliances.includes(appKey)) throw new Error(`${brand.name} has no ${appKey} page`);

  const B = brand ? brand.name + ' ' : '';
  const path = brand ? `/${brandSlug}/${appKey}-repair/` : `/${appKey}-repair/`;
  const url = site.baseUrl + path;
  const title = `${B}${app.name} Repair Portland & Milwaukie, OR | Home-Serv`;
  const h1Plain = `${B}${app.name} Repair in Portland & Milwaukie, OR`;
  const description = brand
    ? `${brand.name} ${app.lower} repair in Portland & Milwaukie, OR. We fix all ${brand.name} ${app.lower} models. $99 diagnostic, 60-day warranty on parts & labor. Book online 24/7.`
    : `${app.name} repair in Portland & Milwaukie, OR, all major brands. $99 diagnostic, 60-day warranty on parts & labor. Book online 24/7.`;
  const subtitle = brand
    ? `Fast, local repair for all ${brand.name} ${app.lower} models. Licensed, bonded & insured.`
    : `Fast, local repair for all major ${app.lower} brands. Licensed, bonded & insured.`;
  const disclaimer = brand
    ? `${site.name} is an independent repair company and is not affiliated with, authorized or endorsed by ${brand.name}. All brand names and trademarks are the property of their respective owners.`
    : `${site.name} is an independent repair company and is not affiliated with, authorized or endorsed by any appliance manufacturer. All brand names and trademarks are the property of their respective owners.`;

  const problems = app.problems.map((p) =>
    `<li class="prob"><svg aria-hidden="true"><use href="#wrench"/></svg><div><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div></li>`).join('');
  const models = app.models.map((m) => `<li>${esc(brand ? brand.name + ' ' : '')}${esc(m.charAt(0).toLowerCase() + m.slice(1))}</li>`).join('');
  const revs = app.reviews.map((id) => {
    const r = reviews[id];
    const cut = r.text.endsWith('…');
    return `<article class="rv"><div class="rv-who"><img src="/assets/img/${id}.webp" width="60" height="60" alt="" loading="lazy"><div><b>${esc(r.name)}</b><span>${esc(r.when)}</span></div></div><span class="stars" aria-label="5 stars">${STARS}</span><p>${esc(r.text)}</p><div class="rv-foot"><span><svg aria-hidden="true"><use href="#g"/></svg>Posted on Google</span>${cut ? `<a href="${esc(site.googleReviewsUrl)}" target="_blank" rel="noopener">Read more</a>` : ''}</div></article>`;
  }).join('');

  const faqs = [
    [`How much does ${B}${app.lower} diagnostics cost?`,
     `Diagnostics is <b>$99 per appliance</b>. The fee is waived if you hire us for the repair.`],
    [`What warranty do you give on ${app.lower} repairs?`,
     `Every repair comes with a <b>60-day warranty on parts and labor</b>.`],
    [`How fast can you come out?`,
     `You can book online 24/7 and pick the earliest available time slot. To check today's availability, call or text <b>${esc(site.phone)}</b> Mon–Fri 9 AM – 5 PM.`],
    [brand ? `Do you repair other ${app.lower} brands besides ${brand.name}?` : `Which ${app.lower} brands do you repair?`,
     `Yes. We repair ${esc(listBrands(appKey, brandSlug))} ${app.plural}${brand ? '' : ''}, plus most other major brands.`],
  ];
  const faqHtml = faqs.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><div class="ans">${a}</div></details>`).join('');

  const crumbs = brand
    ? `<li><a href="/">Home</a></li><li>${esc(brand.name)}</li><li aria-current="page">${esc(brand.name)} ${esc(app.name)} Repair</li>`
    : `<li><a href="/">Home</a></li><li aria-current="page">${esc(app.name)} Repair</li>`;

  const business = {
    '@type': 'HomeAndConstructionBusiness',
    '@id': site.baseUrl + '/#business',
    name: site.name,
    url: site.baseUrl + '/',
    telephone: site.phoneE164,
    email: site.email,
    image: site.baseUrl + '/assets/img/og-image.jpg',
    foundingDate: String(site.since),
    areaServed: serviceArea.cities.map((c) => ({ '@type': 'City', name: c.replace(/ \(.*\)$/, '') + ', OR' }))
      .concat(serviceArea.zips.map((z) => ({ '@type': 'PostalCodeSpecification', postalCode: z }))),
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' }],
  };
  if (site.rating.verified) business.aggregateRating = { '@type': 'AggregateRating', ratingValue: site.rating.value, reviewCount: String(site.rating.count) };
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      business,
      { '@type': 'Service', name: `${B}${app.name} Repair`, serviceType: `${app.name} repair`, url, provider: { '@id': site.baseUrl + '/#business' },
        areaServed: ['Portland, OR', 'Milwaukie, OR'], offers: { '@type': 'Offer', name: 'Diagnostic visit', price: '99', priceCurrency: 'USD', description: 'Waived if you hire us for the repair' } },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: site.baseUrl + '/' },
        { '@type': 'ListItem', position: 2, name: `${B}${app.name} Repair`, item: url } ] },
    ],
  };

  const vars = {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    CANONICAL: esc(url),
    BASE_URL: esc(site.baseUrl),
    SITE_NAME: esc(site.name),
    GTAG: gtagBlock(),
    SCHEMA: JSON.stringify(schema).replace(/</g, '\\u003c'),
    PHONE: esc(site.phone),
    PHONE_E164: esc(site.phoneE164),
    EMAIL: esc(site.email),
    LICENSE: esc(site.license),
    SINCE: String(site.since),
    HOURS: esc(site.hours),
    ZEN_URL: esc(site.zenbookerUrl),
    ZEN_EMBED_URL: esc(site.zenbookerEmbedUrl),
    GOOGLE_REVIEWS_URL: esc(site.googleReviewsUrl),
    RATING_VALUE: esc(site.rating.value),
    RATING_COUNT: String(site.rating.count),
    STARS,
    CRUMBS: crumbs,
    EYEBROW: brand ? `${esc(brand.name)} ${esc(app.lower)} repair` : `${esc(app.lower)} repair`,
    H1: brand ? `<span class="b">${esc(brand.name)} ${esc(app.name)} Repair</span> in Portland &amp; Milwaukie, OR` : `<span class="b">${esc(app.name)} Repair</span> in Portland &amp; Milwaukie, OR`,
    SUBTITLE: esc(subtitle),
    APPLIANCE_IMG: esc(app.image),
    APPLIANCE_IMG_W: String(app.imageW),
    APPLIANCE_IMG_H: String(app.imageH),
    APPLIANCE_IMG_ALT: esc(`${app.name} repair`),
    APPLIANCE_LOWER: esc(app.lower),
    PROBLEMS_TITLE: esc(`Common ${B}${app.lower} problems we fix`),
    PROBLEMS_LEAD: esc(brand ? `Our technicians repair these ${brand.name} ${app.lower} issues every week.` : `Our technicians repair these ${app.lower} issues every week.`),
    PROBLEMS: problems,
    MODELS_TITLE: esc(brand ? `${brand.name} ${app.plural} we repair` : `${app.name} types we repair`),
    MODELS_LEAD: esc(brand ? `We repair all ${brand.name} ${app.lower} models, including:` : `We repair all common ${app.lower} types:`),
    MODELS: models,
    REVIEWS: revs,
    AREA_LEAD: esc(`We come to your home for ${B}${app.lower} repair in Milwaukie, Portland and nearby cities.`),
    CITIES: serviceArea.cities.map((c) => `<li>${esc(c)}</li>`).join(''),
    ZIPS: serviceArea.zips.map((z) => `<li>${z}</li>`).join(''),
    FAQ: faqHtml,
    FINAL_TITLE: esc(`Need ${brand ? 'your ' + brand.name + ' ' + app.lower : 'your ' + app.lower} fixed?`),
    DISCLAIMER: esc(disclaimer),
    YEAR: String(new Date().getFullYear()),
    CLIENT_CONFIG: JSON.stringify({ gtagId: site.tracking.gtagId, phoneLabel: site.tracking.phoneConversionLabel }),
  };

  let html = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`Template variable ${k} has no value`);
    return vars[k];
  });

  // Moderation check: page text (minus the required disclaimer) must not contain banned words.
  if (brand) {
    const text = html.replace(/<p class="disclaimer">[\s\S]*?<\/p>/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    for (const re of BANNED) if (re.test(text)) throw new Error(`${path}: banned wording ${re} on a brand page`);
  }
  if (html.includes('#popup:embedcode')) throw new Error(`${path}: leftover #popup:embedcode`);

  const out = join(ROOT, path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return path;
}

const list = process.argv.includes('--all')
  ? Object.entries(brands).flatMap(([slug, b]) => b.appliances.filter((a) => appliances[a]).map((a) => ({ brand: slug, appliance: a })))
  : data.build;
const built = list.map(buildPage);
console.log(`Built ${built.length} page(s):\n` + built.map((p) => '  ' + p).join('\n'));
