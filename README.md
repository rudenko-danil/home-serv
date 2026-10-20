# Home-Serv Appliance Repair

Landing page for Home-Serv Appliance Repair (Milwaukie & Portland, OR).

- `index.html` — the whole page (styles and scripts inline)
- `img/` — images
- Booking: Zenbooker inline widget inside the popup (`#popup:embedcode`)

Deploy: Netlify, publish directory is the repo root (see `netlify.toml`).

## Landing pages (brand × appliance)

Generated from data, never edited by hand:

- `src/data.json` — business info, brands, appliances (problems, models, reviews), service area, tracking IDs
- `src/templates/landing.html` — the page template
- `assets/css/landing.css`, `assets/js/landing.js` — shared styles and booking popup / phone tracking
- `build.mjs` — `node build.mjs` builds the pages listed in `build`; `node build.mjs --all` builds every brand × appliance page that has appliance data

The homepage (`/index.html`) is not touched by the build. Generated pages are committed, so Netlify needs no build step.
