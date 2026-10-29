#!/usr/bin/env node
// Home-Serv site generator. Run: node build.mjs
// Builds every page except the homepage body from src/data.json + src/templates/page.html,
// refreshes the tracking/meta block in the homepage <head>, writes sitemap.xml and robots.txt,
// then checks all pages (banned wording, broken internal links, leftover placeholders).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(ROOT, 'src/data.json'), 'utf8'));
const TEMPLATE = readFileSync(join(ROOT, 'src/templates/page.html'), 'utf8');
const { site, serviceArea, brands, appliances, reviews, rangeHood: hood } = data;
const YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STARS = '<svg><use href="#star"/></svg>'.repeat(5);
const BIZ_ID = site.baseUrl + '/#business';
const joinList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const appName = (a) => a.displayName || a.name;          // "Stove & Cooktop" for the cooktop page
const appLower = (a) => a.displayLower || a.lower;
const brandLong = (b) => b.longName || b.name;
const brandPath = (slug, appKey) => `/${slug}/${appKey}-repair/`;
const hasBrandPage = (slug, appKey) => brands[slug] && brands[slug].pages.includes(appKey);

/* ---------- shared head block (also injected into the homepage) ---------- */
function trackingBlock() {
  const t = site.tracking;
  const cfg = { bookingMode: site.bookingMode };
  const parts = [];
  if (t.gtagId) {
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(t.gtagId)}"></script>`);
    parts.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(t.gtagId)}');</script>`);
    // Soft conversions: clicks on booking buttons and phone links (once per visit each).
    // Labels come from secondary conversion actions in Google Ads; without a label only a plain event is sent.
    const sendTo = (label) => label ? `'${esc(t.gtagId)}/${esc(label)}'` : 'null';
    parts.push(`<script>(function(){var L={book:${sendTo(t.bookClickLabel)},call:${sendTo(t.callClickLabel)}};function fire(kind){var key='hs_click_'+kind;try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1')}catch(e){}if(typeof gtag!=='function')return;gtag('event',kind==='book'?'book_click':'call_click',{page_path:location.pathname});if(L[kind])gtag('event','conversion',{send_to:L[kind]})}document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';if(a.hasAttribute('data-book')||h.indexOf('widget.zenbooker.com')>-1)fire('book');else if(h.indexOf('tel:')===0)fire('call')},true)})();</script>`);
  } else {
    parts.push('<!-- Google tag: set site.tracking.gtagId in src/data.json and run node build.mjs -->');
  }
  parts.push(`<script>window.HS=${JSON.stringify(cfg)};</script>`);
  // Ad click params (utm_* from the Google Ads tracking template, gclid from auto-tagging):
  // remembered for the visit and appended to every Zenbooker link and embed URL,
  // so the source reaches the booking even if the visitor books from another page.
  parts.push('<script>(function(){var K=["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid"],q=new URLSearchParams(location.search),s={},f=false;K.forEach(function(k){if(q.get(k))f=true});if(f){K.forEach(function(k){var v=q.get(k);if(v)s[k]=v});try{sessionStorage.setItem("hs_utm",JSON.stringify(s))}catch(e){}}else{try{s=JSON.parse(sessionStorage.getItem("hs_utm")||"{}")}catch(e){s={}}}if(!Object.keys(s).length)return;function add(u){try{var x=new URL(u);Object.keys(s).forEach(function(k){x.searchParams.set(k,s[k])});return x.toString()}catch(e){return u}}function run(){document.querySelectorAll(\'a[href*="widget.zenbooker.com"]\').forEach(function(a){a.href=add(a.href)});document.querySelectorAll(\'[data-url*="widget.zenbooker.com"]\').forEach(function(w){w.setAttribute("data-url",add(w.getAttribute("data-url")))})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run()})();</script>');
  parts.push('<script>!function(){if(window.Zenbooker&&"function"==typeof window.Zenbooker);else{var e=document.createElement("script");e.src="https://cdn.zenbooker.com/widget/latest/zenbooker.js",document.head.appendChild(e)}}();</script>');
  parts.push('<link rel="stylesheet" href="https://cdn.zenbooker.com/widget/latest/zenbooker.css" media="print" onload="this.media=\'all\'">');
  return parts.join('\n');
}

function businessSchema() {
  const b = {
    '@type': 'HomeAndConstructionBusiness',
    '@id': BIZ_ID,
    name: site.name,
    url: site.baseUrl + '/',
    telephone: site.phoneE164,
    email: site.email,
    image: site.baseUrl + '/assets/img/og-image.jpg',
    logo: site.baseUrl + '/assets/img/logo.webp',
    foundingDate: String(site.since),
    priceRange: '$$',
    areaServed: serviceArea.cities.map((c) => ({ '@type': 'City', name: c.replace(/ \(.*\)$/, '') + ', OR' }))
      .concat(serviceArea.zips.map((z) => ({ '@type': 'PostalCodeSpecification', postalCode: z, addressCountry: 'US' }))),
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' }],
  };
  if (site.rating.verified) b.aggregateRating = { '@type': 'AggregateRating', ratingValue: site.rating.value, reviewCount: String(site.rating.count) };
  return b;
}
const schemaTag = (graph) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;

/* ---------- section builders ---------- */
const footerServices = () =>
  Object.entries(appliances).map(([k, a]) => `<li><a href="/${k}-repair/">${esc(appName(a))} Repair</a></li>`).join('') +
  `<li><a href="${hood.repair.path}">Range Hoods</a></li>`;

function hero({ crumbs, eyebrow, h1, sub, img }) {
  return `<section class="hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) => (c.href && i < crumbs.length - 1 ? `<li><a href="${c.href}">${esc(c.name)}</a></li>` : `<li${i === crumbs.length - 1 ? ' aria-current="page"' : ''}>${esc(c.name)}</li>`)).join('')}</ol></nav>
      <div class="hero-in">
        <div>
          <p class="eyebrow">${esc(eyebrow)}</p>
          <h1>${h1}</h1>
          <p class="hero-sub">${esc(sub)}</p>
          <div class="hero-ctas">
            <a class="btn" href="${esc(site.zenbookerUrl)}" data-book><svg aria-hidden="true"><use href="#cal"/></svg>Book Online</a>
            <a class="btn line" href="tel:${site.phoneE164}"><svg aria-hidden="true"><use href="#phone"/></svg>Call ${esc(site.phone)}</a>
          </div>
          <div class="trust">
            <div class="trust-row"><svg class="ic" aria-hidden="true"><use href="#g"/></svg><b>${esc(site.rating.value)}</b><span class="stars" aria-label="${esc(site.rating.value)} out of 5">${STARS}</span><a href="${esc(site.googleReviewsUrl)}" target="_blank" rel="noopener">${site.rating.count} Google reviews</a></div>
            <div class="trust-row"><svg class="ic chk" aria-hidden="true"><use href="#chk"/></svg>Licensed, Bonded &amp; Insured · ${esc(site.license)}</div>
            <p class="hours"><svg aria-hidden="true"><use href="#clock"/></svg>${esc(site.hours)}</p>
          </div>
        </div>
        <div class="hero-art"><img src="${img.src}" width="${img.w}" height="${img.h}" alt="${esc(img.alt)}" fetchpriority="high"></div>
      </div>
    </div>
  </section>`;
}

function benefits(list) {
  return `<section class="sec" aria-label="Why choose us"><div class="wrap"><div class="benefits">${list.map(([icon, t, d]) =>
    `<div class="ben"><img src="/assets/img/${icon}.webp" width="140" height="140" alt="" loading="lazy"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>`;
}
const APPLIANCE_BENEFITS = [
  ['f-wrench', '$99 Diagnostic', 'Waived if you hire us for the repair'],
  ['f-shield', '60-Day Warranty', 'On both parts and labor'],
  ['f-coins', 'Price Agreed First', 'You approve the price before any work starts'],
  ['f-pin', `Local Since ${site.since}`, 'Serving Milwaukie and Portland, OR'],
];

const probItems = (list, cls = '') => list.map((p) =>
  `<li class="prob${cls}"><svg aria-hidden="true"><use href="#${cls ? 'alert' : 'wrench'}"/></svg><div><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div></li>`).join('');

function problemsSection({ title, lead, items, parts, ctaText = 'Book a Repair Online' }) {
  return `<section class="sec" id="problems"><div class="wrap">
      <h2 class="sec-title">${esc(title)}</h2>
      <p class="sec-lead">${esc(lead)}</p>
      <ul class="problems">${probItems(items)}</ul>
      ${parts ? `<p class="parts"><b>Parts we replace:</b> ${esc(joinList(parts))}.</p>` : ''}
      <div class="prob-cta"><a class="btn" href="${esc(site.zenbookerUrl)}" data-book>${esc(ctaText)}</a><p>Don't see your issue? We fix it too.</p></div>
    </div></section>`;
}

function extraSection(x) {
  if (!x) return '';
  return `<section class="sec"><div class="wrap"><div class="extra">
      <h2>${esc(x.title)}</h2><p>${esc(x.lead)}</p>
      <ul>${x.items.map((i) => `<li><svg aria-hidden="true"><use href="#chk"/></svg><span>${esc(i)}</span></li>`).join('')}</ul>
      ${x.link ? `<a class="more" href="${x.link.href}">${esc(x.link.text)}<svg aria-hidden="true"><use href="#arrow"/></svg></a>` : ''}
    </div></div></section>`;
}

const chipsSection = ({ id, title, lead, items }) => `<section class="sec" id="${id}"><div class="wrap">
      <h2 class="sec-title">${esc(title)}</h2>${lead ? `<p class="sec-lead">${esc(lead)}</p>` : ''}
      <ul class="chips">${items.map((i) => `<li>${i.href ? `<a href="${i.href}">${esc(i.text)}</a>` : `<span>${esc(i.text)}</span>`}</li>`).join('')}</ul>
    </div></section>`;

function howSection(thing, step2 = null, step3 = null) {
  return `<section class="sec" id="how"><div class="wrap">
      <h2 class="sec-title">How it works</h2>
      <div class="steps">
        <div class="step"><span class="step-n" aria-hidden="true">1</span><div class="step-dot">1</div><h3>Book an appointment</h3><p>Book online 24/7 or call / text <b>${esc(site.phone)}</b> Mon–Fri 9 AM – 5 PM. Tell us the appliance, brand and what's going on.</p></div>
        <div class="step"><span class="step-n" aria-hidden="true">2</span><div class="step-dot">2</div><h3>${step2 ? esc(step2[0]) : 'Diagnostics'}</h3><p>${step2 ? esc(step2[1]) : `The technician checks the ${esc(thing)}, explains the problem and agrees the price with you before any work starts. If a part is needed, we order it.`}</p></div>
        <div class="step"><span class="step-n" aria-hidden="true">3</span><div class="step-dot">3</div><h3>${step3 ? esc(step3[0]) : 'Repair'}</h3><p>${step3 ? esc(step3[1]) : 'We complete the work as quickly as possible. Payment of the agreed amount is due when the job is done.'}</p></div>
      </div>
    </div></section>`;
}

function reviewsSection(ids) {
  const cards = ids.map((id) => {
    const r = reviews[id];
    const cut = r.text.endsWith('…');
    return `<article class="rv"><div class="rv-who"><img src="/assets/img/${id}.webp" width="60" height="60" alt="" loading="lazy"><div><b>${esc(r.name)}</b><span>${esc(r.when)}</span></div></div><span class="stars" aria-label="5 stars">${STARS}</span><p>${esc(r.text)}</p><div class="rv-foot"><span><svg aria-hidden="true"><use href="#g"/></svg>Posted on Google</span>${cut ? `<a href="${esc(site.googleReviewsUrl)}" target="_blank" rel="noopener">Read more</a>` : ''}</div></article>`;
  }).join('');
  return `<section class="sec" id="reviews"><div class="wrap">
      <h2 class="sec-title">What our customers say</h2>
      <div class="rv-head"><svg class="gi" aria-hidden="true"><use href="#g"/></svg><span class="num">${esc(site.rating.value)}</span><div><span class="stars" aria-label="${esc(site.rating.value)} out of 5">${STARS}</span><div class="meta">${site.rating.count} reviews on Google · <a href="${esc(site.googleReviewsUrl)}" target="_blank" rel="noopener">Read all</a></div></div></div>
      <div class="reviews">${cards}</div>
    </div></section>`;
}

function areaSection(lead) {
  return `<section class="sec" id="service-area"><div class="wrap">
      <h2 class="sec-title">Service area</h2>
      <p class="sec-lead">${esc(lead)}</p>
      <div class="area">
        <div class="area-box"><h3>Cities</h3><ul class="cities">${serviceArea.cities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
        <div class="area-box"><h3>ZIP codes</h3><ul class="zips">${serviceArea.zips.map((z) => `<li>${z}</li>`).join('')}</ul></div>
      </div>
    </div></section>`;
}

const faqSection = (faqs) => `<section class="sec" id="faq"><div class="wrap">
      <h2 class="sec-title">FAQ</h2>
      <div class="faq">${faqs.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><div class="ans">${a}</div></details>`).join('')}</div>
    </div></section>`;
const faqSchema = (faqs) => ({ '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) });

const finalCta = (title) => `<section class="final"><div class="wrap"><div class="final-box">
      <div><h2>${esc(title)}</h2><p style="margin-top:10px">${esc(site.hours)}</p></div>
      <div class="final-ctas">
        <a class="btn" href="${esc(site.zenbookerUrl)}" data-book><svg aria-hidden="true"><use href="#cal"/></svg>Book Online</a>
        <a class="btn line" href="tel:${site.phoneE164}"><svg aria-hidden="true"><use href="#phone"/></svg>Call ${esc(site.phone)}</a>
      </div>
    </div></div></section>`;

const FAQ_FAST = `Book online 24/7 to see the earliest available appointment, or call/text us during business hours: <b>${esc(site.phone)}</b>, Mon–Fri 9 AM – 5 PM.`;
const GENERIC_DISCLAIMER = `${site.name} is an independent repair company and is not affiliated with, authorized or endorsed by any appliance manufacturer. All brand names and trademarks are the property of their respective owners.`;
const breadcrumbSchema = (crumbs) => ({ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: site.baseUrl + c.href })) });

/* ---------- page renderer ---------- */
const pages = []; // { path, file, sitemap, brandName? }

function render({ path, file, title, description, robots = 'index, follow', canonical = true, graph, main, disclaimer = GENERIC_DISCLAIMER, pageScript = '', sitemap = true, brandName = null }) {
  const vars = {
    TITLE: esc(title), DESCRIPTION: esc(description), ROBOTS: robots,
    CANONICAL_TAG: canonical ? `<link rel="canonical" href="${esc(site.baseUrl + path)}">` : '',
    OG_URL: esc(site.baseUrl + path), BASE_URL: esc(site.baseUrl), SITE_NAME: esc(site.name),
    TRACKING: trackingBlock(), SCHEMA_TAG: graph ? schemaTag(graph) : '',
    PHONE: esc(site.phone), PHONE_E164: site.phoneE164, EMAIL: esc(site.email), LICENSE: esc(site.license),
    SINCE: String(site.since), HOURS: esc(site.hours), ZEN_URL: esc(site.zenbookerUrl), ZEN_EMBED_URL: esc(site.zenbookerEmbedUrl),
    MAIN: main, FOOTER_SERVICES: footerServices(), DISCLAIMER: esc(disclaimer), YEAR: String(YEAR), PAGE_SCRIPT: pageScript,
  };
  const html = TEMPLATE.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`${path}: template variable ${k} has no value`);
    return vars[k];
  });
  const out = join(ROOT, file || join(path, 'index.html'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  pages.push({ path, file: out, sitemap, brandName, html });
}

/* ---------- brand × appliance and appliance pages ---------- */
function appliancePage(appKey, brandSlug = null) {
  const app = appliances[appKey];
  const brand = brandSlug ? brands[brandSlug] : null;
  const B = brand ? brand.name + ' ' : '';
  const name = appName(app), lower = appLower(app);
  const path = brand ? brandPath(brandSlug, appKey) : `/${appKey}-repair/`;
  const generalCrumb = { name: `${name} Repair`, href: `/${appKey}-repair/` };
  const crumbs = brand
    ? [{ name: 'Home', href: '/' }, generalCrumb, { name: `${brand.name} ${name} Repair`, href: path }]
    : [{ name: 'Home', href: '/' }, generalCrumb];
  const otherBrands = app.brandsRepaired.filter((s) => s !== brandSlug).map((s) => brandLong(brands[s]));

  const faqs = [
    [`How much does ${B}${lower} diagnostics cost?`, `Diagnostics is <b>$99 per appliance</b>. The fee is waived if you hire us for the repair.`],
    [`What warranty do you give on ${lower} repairs?`, `Every repair comes with a <b>60-day warranty on parts and labor</b>.`],
    ['How fast can you come out?', FAQ_FAST],
    brand
      ? [`Do you repair other ${lower} brands besides ${brand.name}?`, `Yes. We also repair ${esc(joinList(otherBrands))} ${app.plural}, along with other major brands.`]
      : [`Which ${lower} brands do you repair?`, `We repair ${esc(joinList(otherBrands))} ${app.plural}, along with other major brands.`],
  ];

  const sections = [
    hero({
      crumbs,
      eyebrow: brand ? `${brand.name} ${lower} repair` : `${lower} repair`,
      h1: `<span class="b">${esc(B + name)} Repair</span> in Portland &amp; Milwaukie, OR`,
      sub: brand
        ? `Fast, local repair for all ${brandLong(brand)} ${app.lower} models. Licensed, bonded & insured.`
        : appKey === 'cooktop'
          ? 'Fast, local repair for gas, electric and induction stoves and cooktops. Licensed, bonded & insured.'
          : `Fast, local repair for all major ${app.lower} brands. Licensed, bonded & insured.`,
      img: { src: app.image, w: app.imageW, h: app.imageH, alt: `${name} repair` },
    }),
    benefits(APPLIANCE_BENEFITS),
    problemsSection({
      title: `Common ${B}${lower} problems we fix`,
      lead: app.intro && !brand ? app.intro : brand ? `Our technicians repair these ${brand.name} ${app.lower} issues every week.` : `Our technicians repair these ${lower} issues every week.`,
      items: app.problems,
      parts: app.parts,
    }),
    extraSection(app.extra),
    chipsSection({
      id: 'models',
      title: brand ? `${brand.name} ${app.plural} we repair` : `${name} types we repair`,
      lead: brand ? `We repair all ${brandLong(brand)} ${app.lower} models, including:` : `We repair all common ${lower} types:`,
      items: app.models.map((m) => ({ text: brand ? `${brand.name} ${m.charAt(0).toLowerCase()}${m.slice(1)}` : m })),
    }),
    brand ? '' : chipsSection({
      id: 'brands',
      title: 'Brands we repair',
      lead: `We repair ${app.plural} from all major brands. Pick yours for brand-specific details:`,
      items: app.brandsRepaired.map((s) => ({ text: brandLong(brands[s]), href: hasBrandPage(s, appKey) ? brandPath(s, appKey) : null })),
    }),
    howSection(lower),
    reviewsSection(app.reviews),
    areaSection(`We come to your home for ${B}${lower} repair in Milwaukie, Portland and nearby cities.`),
    faqSection(faqs),
    finalCta(`Need your ${B}${lower} fixed?`),
  ];

  const title = `${B}${name} Repair Portland & Milwaukie, OR | Home-Serv`;
  const description = brand
    ? `${brand.name} ${app.lower} repair in Portland & Milwaukie, OR. We fix all ${brandLong(brand)} ${app.lower} models. $99 diagnostic, 60-day warranty on parts & labor. Book online 24/7.`
    : `${name} repair in Portland & Milwaukie, OR: ${app.problems.slice(0, 2).map((p) => p.t.toLowerCase()).join(', ')} and more. $99 diagnostic, 60-day warranty. Book online 24/7.`;

  render({
    path, title, description, brandName: brand ? brand.name : null,
    graph: [businessSchema(),
      { '@type': 'Service', name: `${B}${name} Repair`, serviceType: `${name} repair`, url: site.baseUrl + path, provider: { '@id': BIZ_ID }, areaServed: ['Portland, OR', 'Milwaukie, OR'],
        offers: { '@type': 'Offer', name: 'Diagnostic visit', price: '99', priceCurrency: 'USD', description: 'Waived if you hire us for the repair' } },
      faqSchema(faqs), breadcrumbSchema(crumbs)],
    main: sections.join('\n'),
    disclaimer: brand
      ? `${site.name} is an independent repair company and is not affiliated with, authorized or endorsed by ${brand.name}. All brand names and trademarks are the property of their respective owners.`
      : GENERIC_DISCLAIMER,
  });
}

/* ---------- range hoods: repair + installation ---------- */
const HOOD_DISCLAIMER = `${site.name} is an independent repair company and is not affiliated with, authorized or endorsed by any of the brands listed. All brand names and trademarks are the property of their respective owners.`;
const hoodBrandsSection = (lead) => chipsSection({ id: 'brands', title: 'Brands we repair', lead,
  items: hood.brands.map((b) => ({ text: b })).concat([{ text: 'and most other brands' }]) });
const hoodImg = { src: hood.image, w: hood.imageW, h: hood.imageH, alt: 'Kitchen range hood' };
const hoodService = (name, path) => ({ '@type': 'Service', name, serviceType: name, url: site.baseUrl + path, provider: { '@id': BIZ_ID }, areaServed: ['Portland, OR', 'Milwaukie, OR'] });

function hoodRepairPage() {
  const r = hood.repair;
  const crumbs = [{ name: 'Home', href: '/' }, { name: 'Range Hood Repair', href: r.path }];
  const faqs = [
    ['How much does range hood diagnostics cost?', 'Diagnostics is <b>$99 per appliance</b>. The fee is waived if you hire us for the repair.'],
    ['What warranty do you give on range hood repairs?', 'Every repair comes with a <b>60-day warranty on parts and labor</b>.'],
    ['Do you repair Broan-NuTone, Zephyr and other range hood brands?', `Yes. We repair ${esc(joinList(hood.brands))} range hoods, and most other brands.`],
    ['Do you also install new range hoods?', `Yes. If repair doesn't make sense, we can replace your hood. See <a href="${hood.install.path}">range hood installation</a>.`],
  ];
  const main = [
    hero({ crumbs, eyebrow: 'Range hood repair', h1: '<span class="b">Range Hood Repair</span> in Portland &amp; Milwaukie, OR',
      sub: 'Kitchen hood fan, light, motor and control repair. Licensed, bonded & insured.', img: hoodImg }),
    benefits(APPLIANCE_BENEFITS),
    problemsSection({ title: 'Common range hood problems we fix', lead: 'Our technicians repair these kitchen hood issues every week.', items: r.problems, parts: r.parts }),
    chipsSection({ id: 'types', title: 'Types we service', lead: 'We repair all common range hood types:', items: r.types.map((t) => ({ text: t })) }),
    hoodBrandsSection('We repair range hoods from all major brands, including:'),
    extraSection({ title: 'Need a new range hood installed?', lead: 'If your hood is too old or too costly to fix, we can remove it and install a new one.',
      items: ['Under-cabinet, wall-mount and island hoods', 'Uses your existing ductwork and wiring', 'Price agreed before work starts'],
      link: { href: hood.install.path, text: 'Range Hood Installation' } }),
    howSection('range hood'),
    reviewsSection(r.reviews),
    areaSection('We come to your home for range hood repair in Milwaukie, Portland and nearby cities.'),
    faqSection(faqs),
    finalCta('Need your range hood fixed?'),
  ].join('\n');
  render({
    path: r.path,
    title: 'Range Hood Repair Portland & Milwaukie, OR | Home-Serv',
    description: 'Range hood repair in Portland & Milwaukie, OR: fan, motor, light and control repair for Broan-NuTone, Zephyr, ZLINE and other brands. 60-day warranty. Book online 24/7.',
    graph: [businessSchema(), { ...hoodService('Range hood repair', r.path), offers: { '@type': 'Offer', name: 'Diagnostic visit', price: '99', priceCurrency: 'USD', description: 'Waived if you hire us for the repair' } }, faqSchema(faqs), breadcrumbSchema(crumbs)],
    main, disclaimer: HOOD_DISCLAIMER,
  });
}

function hoodInstallPage() {
  const ins = hood.install;
  const crumbs = [{ name: 'Home', href: '/' }, { name: 'Range Hood Installation', href: ins.path }];
  const faqs = [
    ['How much does range hood installation cost?', 'The price depends on the hood and your kitchen setup. We agree on the price before any work starts.'],
    ['Can you run a new duct or add a new electrical line?', esc(ins.scopeNote)],
    ['How fast can you come out?', FAQ_FAST],
    ['Do you also repair range hoods?', `Yes. Often a hood can be fixed instead of replaced. See <a href="${hood.repair.path}">range hood repair</a>.`],
  ];
  const main = [
    hero({ crumbs, eyebrow: 'Range hood installation', h1: '<span class="b">Range Hood Installation</span> in Portland &amp; Milwaukie, OR',
      sub: 'Professional install and replacement of under-cabinet, wall and island range hoods.', img: hoodImg }),
    benefits([
      ['f-coins', 'Price Agreed First', 'You approve the price before any work starts'],
      ['f-shield', 'Licensed & Insured', `Bonded and insured, ${site.license}`],
      ['f-wrench', 'Repair Too', "We'll tell you if your old hood can be fixed"],
      ['f-pin', `Local Since ${site.since}`, 'Serving Milwaukie and Portland, OR'],
    ]),
    `<section class="sec" id="included"><div class="wrap"><div class="extra">
      <h2>What's included</h2>
      <ul>${ins.included.map((i) => `<li><svg aria-hidden="true"><use href="#chk"/></svg><span>${esc(i)}</span></li>`).join('')}</ul>
      <p>${esc(ins.scopeNote)}</p>
      <div class="price-note"><b>Price agreed before work starts</b><p>The price depends on the hood and your kitchen setup. You approve it before we begin.</p></div>
    </div></div></section>`,
    `<section class="sec" id="replacement"><div class="wrap">
      <h2 class="sec-title">Range hood replacement</h2>
      <p class="sec-lead">Repair is often the cheaper option. Replacing the hood makes more sense when:</p>
      <ul class="problems">${probItems(ins.replace)}</ul>
      <div class="prob-cta"><a class="btn" href="${esc(site.zenbookerUrl)}" data-book>Book Installation</a><p>Not sure? We'll tell you whether repair or replacement makes more sense.</p></div>
    </div></section>`,
    chipsSection({ id: 'types', title: 'Types we install', items: ins.types.map((t) => ({ text: t })) }),
    hoodBrandsSection('We install and repair range hoods from all major brands, including:'),
    extraSection({ title: 'Hood just needs a fix?', lead: 'A noisy fan, a dead light or unresponsive controls can usually be repaired.',
      items: ['$99 diagnostic, waived if you hire us for the repair', '60-day warranty on parts and labor'],
      link: { href: hood.repair.path, text: 'Range Hood Repair' } }),
    howSection('range hood', ['Estimate', 'We look at your old hood, the new one and the existing ductwork and wiring, then agree the price with you before any work starts.'],
      ['Installation', 'We remove the old hood, install the new one and test it. Payment of the agreed amount is due when the job is done.']),
    reviewsSection(ins.reviews),
    areaSection('We install range hoods in Milwaukie, Portland and nearby cities.'),
    faqSection(faqs),
    finalCta('Book your range hood installation'),
  ].join('\n');
  render({
    path: ins.path,
    title: 'Range Hood Installation Portland & Milwaukie, OR | Home-Serv',
    description: 'Range hood installation and replacement in Portland & Milwaukie, OR: under-cabinet, wall-mount and island hoods. Price agreed before work starts. Book online 24/7.',
    graph: [businessSchema(), hoodService('Range hood installation', ins.path), faqSchema(faqs), breadcrumbSchema(crumbs)],
    main, disclaimer: HOOD_DISCLAIMER,
  });
}

/* ---------- thank-you, privacy, 404 ---------- */
function thankYouPage() {
  const t = site.tracking;
  let pageScript = '';
  if (t.gtagId && t.bookingConversionLabel) {
    pageScript = `<script>(function(){var p=new URLSearchParams(location.search);var id=p.get('transaction_id')||p.get('booking_id')||p.get('job_id')||p.get('appointment_id')||p.get('id')||'';var key='hs_conv_'+(id||'noid');try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(e){}var ev={send_to:'${esc(t.gtagId)}/${esc(t.bookingConversionLabel)}'};if(id)ev.transaction_id=id;if(typeof gtag==='function')gtag('event','conversion',ev);})();</script>`;
  } else {
    pageScript = '<!-- Booking conversion: set site.tracking.gtagId and bookingConversionLabel in src/data.json and run node build.mjs -->';
  }
  render({
    path: '/thank-you/', title: 'Thank You | Home-Serv Appliance Repair', description: 'Your appointment request is received.',
    robots: 'noindex, follow', canonical: false, sitemap: false, pageScript,
    main: `<section class="simple"><div class="wrap"><div class="simple-box">
      <svg class="ok-ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#chk"/></svg>
      <h1>Thank you!</h1>
      <p>Your appointment request is received. We'll confirm shortly.</p>
      <p>Questions? Call or text <b>${esc(site.phone)}</b> · Mon–Fri 9 AM – 5 PM</p>
      <div class="simple-ctas"><a class="btn line" href="tel:${site.phoneE164}"><svg aria-hidden="true"><use href="#phone"/></svg>Call ${esc(site.phone)}</a><a class="btn" href="/">Back to home</a></div>
    </div></div></section>`,
  });
}

function notFoundPage() {
  render({
    path: '/404.html', file: '404.html', title: 'Page Not Found | Home-Serv Appliance Repair', description: 'This page does not exist.',
    robots: 'noindex, follow', canonical: false, sitemap: false,
    main: `<section class="simple"><div class="wrap"><div class="simple-box">
      <h1>Page not found</h1>
      <p>This page doesn't exist or has moved. You can still book a repair online or call us.</p>
      <div class="simple-ctas"><a class="btn" href="${esc(site.zenbookerUrl)}" data-book><svg aria-hidden="true"><use href="#cal"/></svg>Book Online</a><a class="btn line" href="tel:${site.phoneE164}"><svg aria-hidden="true"><use href="#phone"/></svg>Call ${esc(site.phone)}</a></div>
      <div class="simple-links">${Object.entries(appliances).map(([k, a]) => `<a href="/${k}-repair/">${esc(appName(a))} Repair</a>`).join('')}<a href="${hood.repair.path}">Range Hood Repair</a><a href="${hood.install.path}">Range Hood Installation</a><a href="/">Home</a></div>
    </div></div></section>`,
  });
}

function privacyPage() {
  const s = esc(site.name), e = esc(site.email);
  render({
    path: '/privacy-policy/', title: 'Privacy Policy | Home-Serv Appliance Repair', description: `How ${site.name} collects and uses your information.`,
    main: `<div class="wrap"><article class="doc">
      <h1>Privacy Policy</h1>
      <p class="upd">Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p>This policy explains what information ${s} ("we", "us") collects when you visit this website or book a service, and how we use it.</p>
      <h2>Information we collect</h2>
      <ul>
        <li><b>Booking details.</b> When you book online, you enter your name, phone number, email, service address, the appliance and a description of the problem. Online booking is handled by Zenbooker, our scheduling provider.</li>
        <li><b>Calls, texts and emails.</b> If you contact us, we keep your phone number or email and the details you share so we can schedule and complete the service.</li>
        <li><b>Website usage data.</b> Like most websites, we and our providers collect technical data such as your IP address, browser type, pages visited, the page you came from and ad click identifiers (for example, gclid).</li>
      </ul>
      <h2>Cookies and advertising</h2>
      <p>We use Google Ads and the Google tag to measure which ads lead to bookings and calls. These tools use cookies and similar technologies. Zenbooker may also use cookies to record how you found us when you book. You can block or delete cookies in your browser settings. You can control personalized Google ads at <a href="https://adssettings.google.com" target="_blank" rel="noopener">adssettings.google.com</a>. Learn how Google uses data at <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">policies.google.com/technologies/partner-sites</a>.</p>
      <h2>How we use your information</h2>
      <ul>
        <li>To schedule appointments, perform repairs and contact you about your service.</li>
        <li>To provide estimates, invoices and warranty service.</li>
        <li>To measure and improve our website and advertising.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We do not sell your personal information. We share it only with service providers that help us run our business, such as Zenbooker (scheduling) and Google (advertising and measurement), or when required by law.</p>
      <h2>Retention</h2>
      <p>We keep booking and service records as long as needed to provide the service, honor warranties and meet legal and tax requirements.</p>
      <h2>Your choices</h2>
      <p>You can ask us to access, correct or delete your personal information by emailing <a href="mailto:${e}">${e}</a>. We will respond within a reasonable time.</p>
      <h2>Children</h2>
      <p>This website is not directed to children under 13, and we do not knowingly collect their information.</p>
      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows when it last changed.</p>
      <h2>Contact</h2>
      <p>${s} · <a href="mailto:${e}">${e}</a> · <a href="tel:${site.phoneE164}">${esc(site.phone)}</a></p>
    </article></div>`,
  });
}

/* ---------- homepage head refresh ---------- */
function refreshHomepage() {
  const file = join(ROOT, 'index.html');
  let html = readFileSync(file, 'utf8');
  const block = `<!-- HS:HEAD (generated by build.mjs, do not edit by hand) -->
<link rel="canonical" href="${site.baseUrl}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="Appliance Repair in Portland & Milwaukie, OR | Home-Serv">
<meta property="og:url" content="${site.baseUrl}/">
<meta property="og:image" content="${site.baseUrl}/assets/img/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta name="theme-color" content="#001846">
${trackingBlock()}
${schemaTag([businessSchema(), { '@type': 'WebSite', name: site.name, url: site.baseUrl + '/' }])}
<!-- /HS:HEAD -->`;
  const re = /<!-- HS:HEAD[\s\S]*?<!-- \/HS:HEAD -->/;
  if (!re.test(html)) throw new Error('index.html: HS:HEAD markers not found');
  html = html.replace(re, () => block);
  writeFileSync(file, html);
  pages.unshift({ path: '/', file, sitemap: true, html, isHome: true });
}

/* ---------- run ---------- */
// Remove previously generated folders so dropped pages don't linger.
for (const slug of Object.keys(brands)) rmSync(join(ROOT, slug), { recursive: true, force: true });
rmSync(join(ROOT, 'dryer-vent-cleaning'), { recursive: true, force: true }); // service removed: the URL now returns 404

for (const [slug, b] of Object.entries(brands)) for (const appKey of b.pages) {
  if (!appliances[appKey]) throw new Error(`No appliance data for ${appKey}`);
  appliancePage(appKey, slug);
}
for (const appKey of Object.keys(appliances)) appliancePage(appKey);
hoodRepairPage();
hoodInstallPage();
thankYouPage();
privacyPage();
notFoundPage();
refreshHomepage();

writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.filter((p) => p.sitemap).map((p) => `  <url><loc>${site.baseUrl}${p.path}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${site.baseUrl}/sitemap.xml
`);

/* ---------- checks ---------- */
const errors = [];
const visible = (h) => h.replace(/<p class="disclaimer">[\s\S]*?<\/p>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ALWAYS_BANNED = [/authori[sz]ed/i, /\bofficial\b/i, /factory[- ]certified/i, /service cent(er|re)/i, /same[- ]day/i, /\bemergenc/i, /vent[- ]cleaning/i];
for (const p of pages) {
  const html = p.html;
  if (html.includes('#popup:embedcode')) errors.push(`${p.path}: contains #popup:embedcode`);
  if (html.includes('dryer-vent-cleaning')) errors.push(`${p.path}: link to removed /dryer-vent-cleaning/`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(html)) errors.push(`${p.path}: unreplaced placeholder`);
  const text = visible(html);
  for (const re of ALWAYS_BANNED) if (re.test(text)) errors.push(`${p.path}: banned wording ${re}`);
  if (!p.isHome && /\bcertified\b/i.test(text)) errors.push(`${p.path}: "certified" on a landing page`);
  for (const m of text.matchAll(/24\/7/g)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (!/(online booking|book online|booking)\s*$/i.test(before)) errors.push(`${p.path}: "24/7" outside "Online booking 24/7": …${before}24/7`);
  }
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const u = m[1];
    const f = u.endsWith('/') ? join(ROOT, u, 'index.html') : join(ROOT, u);
    if (!existsSync(f)) errors.push(`${p.path}: broken internal link ${u}`);
    if (!u.endsWith('/') && !/\.[a-z0-9]+$/i.test(u)) errors.push(`${p.path}: internal link without trailing slash ${u}`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { errors.push(`${p.path}: invalid JSON-LD`); }
  }
}
const generated = pages.filter((p) => !p.isHome).length;
console.log(`Built ${generated} pages + homepage head refresh = ${generated + 1} pages total. Sitemap: ${pages.filter((p) => p.sitemap).length} URLs.`);
if (errors.length) { console.error('\nCHECKS FAILED:\n' + errors.map((e) => '  ' + e).join('\n')); process.exit(1); }
console.log('All checks passed.');
