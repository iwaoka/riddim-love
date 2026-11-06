# RIDDIM.LOVE

**Built for selectors.** A free, non-commercial, ad-free riddim search for reggae and dancehall selectors.

> Selectors don't need recommendations. They need information.

Live: https://riddim.love

Data provided by [Riddim-ID](https://riddim-id.com/) via its public API v1. RIDDIM.LOVE is an independent project and is not affiliated with Riddim-ID.

## Features

- Targeted search: pick **Riddim** (default), **Tune** (titles only), **Artist** or **Label**; one upstream `/search?types=<target>` request, nothing else shown. Typo tolerant
- The chosen target is kept in the URL (`/?type=tune&q=pumpkin+belly`) and remembered for next time
- Compact tune table: copy icon first, then Artist, Title, Riddim, Label, Year
- One-click copy as `Artist - Title`; YouTube search button (`Artist Title`, optionally `+ Riddim`, `+ Label`)
- Tune results sorted client-side by Label → Artist → Title (`Intl.Collator`, case-insensitive, stable, blank labels last). Search hits carry no label, so in practice this is Artist → Title
- Full tune lists per riddim / artist / producer / label with "Load more" (cursor pagination)
- Riddim filter (title or artist), sort, and "include versions"
- Shareable URLs (`/?type=riddim&q=`, `/?riddim=18`, `/?artist=263`, `/?label=61`, `/?tune=759`)
- Keyboard: `/` focuses search, `Enter` searches, `Esc` leaves the box

## Stack

- Vite + TypeScript, no framework, no third-party runtime JS
- One Cloudflare Worker: serves the static build (Static Assets) and a whitelisted relay at `/api/*`
- No database, no accounts, no cookies, no analytics

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
