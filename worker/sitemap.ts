// /sitemap.xml — built from a small, fixed number of list requests, never by
// walking the whole catalogue: the most-recorded riddims (5 pages × 100) and
// the labels and artists with the most tunes (2 pages × 100 each) = 9 upstream
// requests, at most once a day. Everything else is found via internal links.

import { ORIGIN, pagePath } from '../shared/seo';
import { upstream } from './upstream';

const SITEMAP_TTL = 86_400; // one day
const CACHE_KEY = 'https://riddim.love/__internal/sitemap-v1.xml';

const PLAN = [
  { kind: 'riddim', path: '/riddims', pages: 5 },
  { kind: 'label', path: '/labels', pages: 2 },
  { kind: 'artist', path: '/artists', pages: 2 },
] as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function collect(ctx: ExecutionContext): Promise<string[]> {
  const urls = new Set<string>([ORIGIN + '/']);
  for (const step of PLAN) {
    let cursor: string | null = null;
    for (let page = 0; page < step.pages; page++) {
      let body: unknown;
      try {
        body = await upstream(step.path, { sort: '-tunes', cursor }, ctx);
      } catch (e) {
        console.error('sitemap: stopped at', step.path, page, e);
        break; // keep what we have; never retry in a loop
      }
      const b = body as { data?: unknown[]; meta?: { next_cursor?: unknown } };
      for (const item of b.data ?? []) {
        const it = item as { id?: unknown; slug?: unknown; name?: unknown };
        const id = typeof it.id === 'string' ? Number(it.id) : it.id;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) continue;
        // Placeholder credits such as "[Dub]" or "[Unknown]" are not real artists.
        if (typeof it.name === 'string' && it.name.startsWith('[')) continue;
        const slug = typeof it.slug === 'string' && SLUG_RE.test(it.slug) ? it.slug : '';
        urls.add(ORIGIN + pagePath(step.kind, id, slug));
      }
      cursor = typeof b.meta?.next_cursor === 'string' ? b.meta.next_cursor : null;
      if (!cursor) break;
    }
  }
  return [...urls];
}

export async function serveSitemap(ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(CACHE_KEY);
  const hit = await cache.match(key);
  if (hit) return hit;

  const urls = await collect(ctx);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${xmlEsc(u)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  // A partial sitemap (upstream trouble) is only kept briefly.
  const ttl = urls.length > 100 ? SITEMAP_TTL : 300;
  const res = new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${Math.min(ttl, 3600)}`, 'X-Sitemap-Urls': String(urls.length) },
  });
  const toCache = new Response(xml, { headers: { ...Object.fromEntries(res.headers), 'Cache-Control': `public, max-age=${ttl}` } });
  ctx.waitUntil(cache.put(key, toCache));
  return res;
}
