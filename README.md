# RIDDIM.LOVE

**Built for selectors.** A fast riddim search for reggae and dancehall selectors.

> Selectors don't need recommendations. They need information.

Live: https://riddim.love

Data provided by [Riddim-ID](https://riddim-id.com/) via its public API v1. RIDDIM.LOVE is an independent project and is not affiliated with Riddim-ID.

## Features

- Targeted search: pick **Riddim** (default), **Tune** (titles only), **Artist** or **Label**; one upstream `/search?types=<target>` request, nothing else shown. Typo tolerant
- The chosen target is kept in the URL (`/?type=tune&q=pumpkin+belly`) and remembered for next time
- Compact tune table: Artist, Title, Riddim, Label, Year, then row actions on the right: **YouTube → Discogs → Info → Copy**
- YouTube and Discogs open a search-results page for `Artist Title` (shared builder in `shared/format.ts`, `EXTERNAL_SEARCHES`; no API calls). Copy puts `Artist - Title` on the clipboard
- Click a column header (Artist, Title, Riddim, Label, Year) to sort; click again to reverse. Client-side over the rows on screen (`Intl.Collator`, case-insensitive, blanks last, ties → Label → Artist → Title, stable). No extra requests: on paged lists only loaded rows are sorted, and the page says so. Tune search defaults to Artist → Title (search hits carry no label)
- Full tune lists per riddim / artist / producer / label with "Load more" (cursor pagination)
- Riddim filter (title or artist), sort, and "include versions"
- Page URLs: `/riddim/18/sleng-teng`, `/artist/263/wayne-smith`, `/producer/595/king-jammy`, `/label/61/jammys`, `/tune/759/under-mi-sleng-teng`; search stays at `/?type=riddim&q=`. Old `/?riddim=18`-style links 301 to the page URL
- Keyboard: `/` focuses search, `Enter` searches, `Esc` leaves the box

## SEO

- Detail pages are server-rendered by the Worker (`worker/pages.ts`): real `<title>`, description, canonical, H1, the first 100 tunes as HTML, and JSON-LD that mirrors the page (BreadcrumbList + CollectionPage/ItemList, MusicGroup, Organization/Person, MusicRecording). The page embeds the API data it used, so the app starts without refetching.
- Indexed: home, riddim, artist, producer, label pages. `noindex, follow`: tune pages (thin), search views (`/?q=`). Filter/sort params keep the base canonical. Unknown ids → 404 (noindex); wrong/missing slug → 301.
- `/sitemap.xml`: home + top 500 riddims, 200 labels, 200 artists by tune count — 9 upstream list requests, cached for a day. No catalogue crawling.
- workers.dev and plain-http visitors → 301 to https://riddim.love.

## Stack

- Vite + TypeScript, no framework, no third-party runtime JS
- One Cloudflare Worker: serves the static build (Static Assets) and a whitelisted relay at `/api/*`
- No database, no accounts
- Analytics: Google Tag Manager `GTM-KCMD2C2M` (GA4 configured in GTM) via `public/analytics.js`, with Consent Mode v2: EU/EEA, UK and CH visitors see a consent banner and analytics cookies stay off until they accept (the Worker marks them with `<html data-consent="required">`); ad storage is always denied. In-app page changes push `rl_page_view` to the dataLayer. See `/privacy.html`

## API relay (`worker/`)

| Route | Upstream |
|---|---|
| `GET /api/search?type=riddim|tune|artist|label&q=` | `/v1/search?types=<type>&limit=50` (one request) |
| `GET /api/riddims/:id` | `/v1/riddims/:id` |
| `GET /api/riddims/:id/tunes?cursor=&sort=&q=&versions=include` | `/v1/riddims/:id/tunes` |
| `GET /api/{artists,producers,labels}/:id/tunes?cursor=&sort=` | same path upstream |
| `GET /api/tunes/:id` | `/v1/tunes/:id` |

- GET/HEAD only; unknown routes and parameters are rejected (not a generic proxy)
- Responses are projected to a small typed shape (`shared/types.ts`)
- Edge cache via the Cache API, TTL taken from upstream `Cache-Control` (`s-maxage`, default 300 s)
- Upstream `429` → local cool-down honouring `Retry-After`
- No bulk fetching or storage of the dataset

Icons: [Lucide](https://lucide.dev) (ISC), inlined as SVG.

## Development

```bash
npm install
npm test          # unit tests (vitest)
npm run build     # typecheck + vite build to dist/
npx wrangler dev  # Worker + assets on http://localhost:8787
npm run deploy    # build + wrangler deploy
```
