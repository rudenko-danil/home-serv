# Home-Serv Appliance Repair

Landing page for Home-Serv Appliance Repair (Milwaukie & Portland, OR).

- `index.html` — the whole page (styles and scripts inline)
- `img/` — images
- Booking: Zenbooker inline widget inside the popup (`#popup:embedcode`)

Deploy: Netlify, publish directory is the repo root (see `netlify.toml`).

## How the site is built

- `index.html` — homepage, edited by hand. Its `<head>` block between `<!-- HS:HEAD -->` markers is refreshed by the build.
- `src/data.json` — all content and settings: business info, tracking IDs, brands and their pages, appliances (symptoms, parts, models, reviews), dryer vent cleaning, service area.
- `src/templates/page.html` — the one page template.
- `build.mjs` — `node build.mjs` generates every other page (brand × appliance, appliance, dryer vent cleaning, thank-you, privacy policy, 404), `sitemap.xml` and `robots.txt`, then checks all pages for banned Ads wording, broken internal links and leftover placeholders. It exits with an error if a check fails.

Generated files are committed, so Netlify needs no build step.

### Tracking setup
In `src/data.json` → `site.tracking` set `gtagId` (AW-…), `bookingConversionLabel` and `phoneConversionLabel`, then run `node build.mjs` and push.

### Booking
`site.bookingMode`: `"popup"` opens the Zenbooker inline widget in a popup; `"link"` opens the Zenbooker booking page directly. Every booking button links to the booking page either way.
