// /og/<kind>/<id>.png — the page's OGP image, drawn ahead of time by
// scripts/og/generate.mjs (GitHub Actions) and kept in R2.
//
// R2 is read only here, when an image itself is fetched (by SNS crawlers,
// mostly) — never while rendering a page's HTML: the page just names this URL.
//
// - Generated, and its hash matches ?v=: the image, cached for a long time
//   (the URL changes whenever the card does).
// - Generated, but older than ?v= (name or design changed, not yet redrawn):
//   the old image, cached briefly.
// - Not generated (or no R2 bound): the common /ogp.png, cached briefly, so a
//   card that appears later is picked up soon. Never a 404: an SNS gets an
//   image for every URL it was given.

import { OG_TTL, ogKey, type OgKind } from '../shared/og';

export interface OgEnv {
  ASSETS: Fetcher;
  /** R2 bucket of the generated images (absent: every image falls back). */
  OG?: R2Bucket;
}

const cacheControl = (ttl: number) => `public, max-age=${ttl}`;

export async function serveOg(request: Request, env: OgEnv, ctx: ExecutionContext, url: URL, page: { kind: OgKind; id: number }): Promise<Response> {
  const v = url.searchParams.get('v') ?? '';
  // One cache entry per image and version; other query parameters are ignored.
  const cacheKey = new Request(`${url.origin}${url.pathname}?v=${encodeURIComponent(v.slice(0, 16))}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;

  let res: Response;
  const obj = env.OG ? await env.OG.get(ogKey(page.kind, page.id)) : null;
  if (obj) {
    const current = !!v && obj.customMetadata?.hash === v;
    res = new Response(obj.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': cacheControl(current ? OG_TTL.image : OG_TTL.fallback),
        ETag: obj.httpEtag,
        'X-OG': current ? 'image' : 'stale',
      },
    });
  } else {
    const common = await env.ASSETS.fetch(new Request(new URL('/ogp.png', url)));
    res = new Response(common.body, {
      status: common.ok ? 200 : 404,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl(OG_TTL.fallback), 'X-OG': 'fallback' },
    });
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  if (res.ok) ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return request.method === 'HEAD' ? new Response(null, res) : res;
}
