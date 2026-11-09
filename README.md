# RIDDIM.LOVE

**Built for selectors.** A fast riddim search for reggae and dancehall selectors.

> Selectors don't need recommendations. They need information.

Live: https://riddim.love

Data provided by [Riddim-ID](https://riddim-id.com/) via its public API v1. RIDDIM.LOVE is an independent project and is not affiliated with Riddim-ID.

## Features

- Targeted search: pick **Riddim** (default), **Tune** (titles only), **Artist**, **Label** or **Producer**; one upstream `/search?types=<target>` request, nothing else shown. Typo tolerant
- The chosen target is kept in the URL (`/?type=tune&q=pumpkin+belly`) and remembered for next time
- Compact tune table: Artist, Title, Riddim, Label, Year, then row actions: **YouTube / Listen / Dig**, then **Copy / Want** as icons only (labelled on the tune page); the whole row opens the tune page (artist / riddim / label are plain text in lists, linked on the tune page)
- YouTube: search results for `Artist Title` (new tab). Copy: `Artist - Title` to the clipboard. Tune search (beta): paste `Artist - Title` or `Title - Artist` (also `–`, `—`, or tab-separated) and it opens that artist’s page filtered by the title — the whole list, so no 50-hit cap (`shared/pair.ts`). If several artists share the name, pick one; if none matches, the title alone is searched and hits by matching artists are shown. Without a separator, `Artist Title` or `Title Artist` is tried when no title matches: an artist search on the whole query (longest artist name the query starts with), then on its last word alone (longest name it ends with); the whole query being an artist name opens that artist.
- Dig: a small menu (one shared popover, fixed position, keyboard + Escape/outside-click to close) with record-shop searches for `Artist Title`, by the visitor's country: everywhere **Discogs, eBay**; Japan adds **Mercari, Yahoo! Auctions, Record City**. Providers are config data in `shared/dig.ts` (`DIG_PROVIDERS`, `countries: ["*"] | ["JP"] | [...REGIONS.EU]`); `digProvidersFor(country)` is a pure function (ready for a manual region switch). Plain search URLs built in the browser — no API calls, no affiliate parameters
- Listen: the same kind of menu (the same popover) with streaming-service searches for `Artist Title`: **Spotify, Apple Music, SoundCloud, Bandcamp, Audiomack**, config data in `shared/listen.ts` (`LISTEN_PROVIDERS`). Apple Music opens the visitor's own store (`music.apple.com/<country>/search?term=`, from the Worker's country stamp; without one, Apple sends it to the US store). On the tune page Listen and Dig are laid out open, like Dig before
- Phones: store apps (Spotify, Apple Music, SoundCloud, Discogs, eBay…) open from these links but ignore the search in the URL, so on touch screens (`pointer: coarse`) a tap on a Listen / Dig link also copies `Artist Title` to the clipboard ; a red note under the song name in the Listen / Dig menu (and under Listen / Dig on the tune page) says so before the tap — touch screens only, by CSS `(pointer: coarse)`. Both happen synchronously inside the tap (hidden read-only textarea + `execCommand`, then the Clipboard API as a second try): once the app opens the page is in the background and phones refuse a later, awaited clipboard write. Desktop browsers keep the search, so nothing is copied there
- Country: the Worker stamps `<html data-country="JP">` from `request.cf.country` on the final HTML response (after the HTML cache, so cached pages stay country-neutral), marked `Cache-Control: private, no-cache` with no ETag. No IP lookup, nothing stored. Local testing: `.dev.vars` with `DEV_COUNTRY_OVERRIDE=1`, then `?country=JP|US|GB|none`
- Click a column header (Artist, Title, Riddim, Label, Year) to sort; click again to reverse (`Intl.Collator`, case-insensitive, blanks last, ties → Label → Artist → Title, stable). On riddim / artist / producer / label lists the sort covers the **whole list**: lists load whole in the background right after the first 100 are shown (cap 1,500; 99.6% of riddims fit in one page, so usually no extra request; each upstream page is cached 5 minutes by the Worker). Tune search defaults to Artist → Title (search hits carry no label)
- List filter: live, as you type, over Artist / Title / Label (case-, accent- and apostrophe-insensitive; every word must match; `shared/filter.ts`). Kept in the URL as `?f=`; also triggers loading the whole list
- The column sort is kept in the URL too (`?sort=year`, `?sort=-year` for descending), so Back from a tune page, a reload or a shared link shows the same order. Back / Forward also return to the same scroll position (kept in `history.state`, applied after the view is rebuilt and again once a sorted list has every page; any scroll or tap cancels it). The row of the tune just come back from — or whose YouTube / Copy / Dig / Want was just pressed — is marked like a hovered row (kept through sort / filter repaints); on Back its title is focused
- Riddim page head (server-rendered and in the app, from the riddim record already fetched — no extra request): "Version of", **Original tune(s)** from upstream `original_tunes` (`Artist – Title (year)`, linked to the tune page, up to 3; the year is the tune's, never shown as the riddim's), "Also known as" (alternate names minus the riddim's own name, case/accent/"Riddim"-insensitive, up to 5 + "+N more"), and the versions. No riddim year or producer, and upstream `summary` is not used (it counts tunes on versions and carries the original's year/producers)
- Full tune lists per riddim / artist / producer / label, loaded whole after the first page (cursor pagination; "Load more" remains as a retry after a failed load)
- Page URLs: `/riddim/18/sleng-teng`, `/artist/263/wayne-smith`, `/producer/595/king-jammy`, `/label/61/jammys`, `/tune/759/under-mi-sleng-teng`; search stays at `/?type=riddim&q=`. Old `/?riddim=18`-style links 301 to the page URL
- Want list: ☆ **Want** on every tune row and tune page; `/want` lists them (sortable) and **Copy list as text** puts one line per tune on the clipboard for a memo app: `Artist - Title (Sleng Teng Riddim, Jammy's, 1985)`. Kept only in the visitor's browser (`localStorage` key `riddim.love:want`, a small snapshot per tune, up to 2,000; `shared/want.ts`), so the page makes no API requests and the site stores nothing; other open tabs follow changes. `/want` is the app shell with `noindex, nofollow`
- Dig history: opening a record-shop search from Dig (row menu or the tune page; not Listen, and not just opening the menu) notes the tune in `/dig`, last searched first — the record of a search link opened, not of a visit or purchase. One entry per tune id (a repeat search moves it to the top with the new time and shop; same artist + title under another id is another tune), up to 500 (oldest drop off), `localStorage` key `riddim.love:dig`, same snapshot fields as Want plus `dug` (time) and `service` (shop id). Saving is synchronous and wrapped, so it never stands in the link's way. The page is the Want table: ☆ moves a tune to Want in one tap, Dig searches again, ✕ drops it from the history, **Copy list as text**, **Clear history** (asks first). Want and Dig never touch each other's data. Header: **Dig | Want** side by side (top right). `/dig` is the app shell with `noindex, nofollow`
- Keyboard: `/` focuses search, `Enter` searches, `Esc` leaves the box

## SEO

- Detail pages are server-rendered by the Worker (`worker/pages.ts`): real `<title>`, description, canonical, H1, the first 100 tunes as HTML, and JSON-LD that mirrors the page (BreadcrumbList + CollectionPage/ItemList, MusicGroup, Organization/Person, MusicRecording). The page embeds the API data it used, so the app starts without refetching.
- Indexed: home, riddim, artist, producer, label pages. `noindex, follow`: tune pages (thin), search views (`/?q=`). Filter/sort params keep the base canonical. Unknown ids → 404 (noindex); wrong/missing slug → 301.
- Sitemap: `/sitemap.xml` is a sitemap index over static files in `/sitemaps/` (`pages`, `riddim`, `artist`, `label`, `producer`), pre-built by `npm run sitemap` (`scripts/sitemap.mjs`, rules in `scripts/sitemap-lib.ts`) and committed, so every deploy ships the last good set and serving it calls no API.
  - Listed: detail pages with at least 2 tunes (riddims) or 3 tunes (artists, labels, producers); placeholder records (`[Dub]`, `~Unknown (027)`) left out; canonical URLs only; no `lastmod` (no reliable per-page update time upstream). 2026-11-09: 16,355 URLs.
  - The build reads the list endpoints sorted by tune count and stops once the sort count is under the minimum: ~175 requests, one per second (~3 min), 429 `Retry-After` honoured. It writes nothing unless the run completes and passes its checks (well-formed, ≤ 50,000 URLs per file, no duplicates, riddim.love URLs only, no kind under 80% of the previous run), so a failed run keeps the last good set.
  - Refresh now and then (e.g. weekly): `npm run sitemap`, commit, deploy. If the static index is missing, the Worker still builds the old top-900 sitemap (`worker/sitemap.ts`).
- workers.dev and plain-http visitors → 301 to https://riddim.love.

## Stack

- Vite + TypeScript, no framework, no third-party runtime JS
- One Cloudflare Worker: serves the static build (Static Assets) and a whitelisted relay at `/api/*`
- No database, no accounts
- Analytics: Google Tag Manager `GTM-5BWJVSLC` (GA4 configured in GTM) via `public/analytics.js`, with Consent Mode v2: EU/EEA, UK and CH visitors see a consent banner and analytics cookies stay off until they accept (the Worker marks them with `<html data-consent="required">`); ad storage is always denied. In-app page changes push `rl_page_view` to the dataLayer. See `/privacy`

## API relay (`worker/`)

| Route | Upstream |
|---|---|
| `GET /api/search?type=riddim|tune|artist|label&q=` | `/v1/search?types=<type>&limit=50` (one request) |
| `GET /api/suggest?q=` | `/v1/search?types=riddim,tune,artist,label&limit=50` — only after a search found nothing, for “Did you mean” |
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
npm run deploy:www  # www.riddim.love → https://riddim.love (301; redirect-only Worker in www-redirect/)
```
