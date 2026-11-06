// RIDDIM.LOVE Worker: serves the static app, server-rendered detail pages,
// a daily sitemap, and a small, whitelisted read-only relay to the Riddim-ID
// API v1 (https://api.riddim-id.com/docs).

import { ORIGIN, PAGE_KINDS, pagePath, parsePagePath, type PageKind } from '../shared/seo';
import type { ApiError, SearchResult } from '../shared/types';
import { loadEntity, loadRiddim, loadTune, loadTunes } from './data';
import { servePage } from './pages';
import * as P from './project';
import { serveSitemap } from './sitemap';
import { data, UpstreamError, upstream } from './upstream';
import {
  BadRequest,
  onlyParams,
  parseCursor,
  parseEnum,
  parseId,
  parseQuery,
  RIDDIM_TUNE_SORTS,
  SEARCH_TYPES,
  TUNE_SORTS,
} from './validate';

export interface Env {
  ASSETS: Fetcher;
}

const SEARCH_LIMIT = 50; // upstream maximum

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
      'X-Robots-Tag': 'noindex',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

function errorResponse(status: number, code: string, message: string, retryAfter?: number): Response {
  const body: ApiError = { error: { code, message, ...(retryAfter ? { retry_after: retryAfter } : {}) } };
  return json(body, status, retryAfter ? { 'Retry-After': String(retryAfter) } : {});
}

async function handleApi(url: URL, ctx: ExecutionContext): Promise<Response> {
  const p = url.searchParams;
  const path = url.pathname.replace(/\/+$/, '');
  let m: RegExpExecArray | null;

  if (path === '/api/search') {
    onlyParams(p, ['q', 'type']);
    const q = parseQuery(p.get('q'));
    const type = parseEnum(p.get('type'), SEARCH_TYPES) ?? 'riddim';
    // One upstream request, restricted to the selected type.
    const body = await upstream('/search', { q, types: type, limit: SEARCH_LIMIT }, ctx);
    const hits = Array.isArray(data(body)) ? (data(body) as unknown[]) : [];
    const result: SearchResult = {
      query: q,
      type,
      // Filter again by type, so nothing outside the selection can leak through.
      names: type === 'tune' ? [] : (hits.map(P.nameHit).filter((x) => x !== null && x.type === type) as SearchResult['names']),
      tunes: type === 'tune' ? (hits.map(P.tuneHit).filter((x) => x !== null) as SearchResult['tunes']) : [],
      limit: SEARCH_LIMIT,
    };
    return json(result);
  }

  if ((m = /^\/api\/riddims\/([^/]+)$/.exec(path))) {
    onlyParams(p, []);
    return json(await loadRiddim(parseId(m[1]), ctx));
  }

  if ((m = /^\/api\/riddims\/([^/]+)\/tunes$/.exec(path))) {
    onlyParams(p, ['cursor', 'sort', 'q', 'versions']);
    const id = parseId(m[1]);
    const q = p.get('q') ? parseQuery(p.get('q'), { min: 1, max: 100 }) : null;
    return json(
      await loadTunes(
        'riddim',
        id,
        {
          cursor: parseCursor(p.get('cursor')),
          sort: parseEnum(p.get('sort'), RIDDIM_TUNE_SORTS),
          q,
          versions: parseEnum(p.get('versions'), ['include'] as const),
        },
        ctx,
      ),
    );
  }

  if ((m = /^\/api\/(artists|producers|labels)\/([^/]+)\/tunes$/.exec(path))) {
    onlyParams(p, ['cursor', 'sort']);
    const kind = m[1].slice(0, -1) as 'artist' | 'producer' | 'label';
    return json(
      await loadTunes(kind, parseId(m[2]), { cursor: parseCursor(p.get('cursor')), sort: parseEnum(p.get('sort'), TUNE_SORTS) }, ctx),
    );
  }

  if ((m = /^\/api\/(artists|producers|labels)\/([^/]+)$/.exec(path))) {
    onlyParams(p, []);
    return json(await loadEntity(m[1].slice(0, -1) as 'artist' | 'producer' | 'label', parseId(m[2]), ctx));
  }

  if ((m = /^\/api\/tunes\/([^/]+)$/.exec(path))) {
    onlyParams(p, []);
    return json(await loadTune(parseId(m[1]), ctx));
  }

  return errorResponse(404, 'not_found', 'Unknown API route.');
}

/** workers.dev and plain-http visitors → the canonical https://riddim.love. */
function canonicalRedirect(request: Request, url: URL): Response | null {
  const isWorkersDev = url.hostname.endsWith('.workers.dev');
  // The visitor's scheme comes from Cloudflare's CF-Visitor header (absent in
  // `wrangler dev`, which also rewrites the URL to the production hostname).
  const isHttp = /"scheme":"http"/.test(request.headers.get('CF-Visitor') ?? '');
  return isWorkersDev || isHttp ? Response.redirect(ORIGIN + url.pathname + url.search, 301) : null;
}

const LIST_PARAMS = ['f', 'sort', 'versions'];

/**
 * The HTML shell at "/": the home page and the search view (?type=&q=).
 * - Old query-string detail URLs (?riddim=18, ?tune=759, …) → 301 to the
 *   path URL (which then settles the slug).
 * - Search views are app state: `X-Robots-Tag: noindex, follow`, no canonical.
 */
async function serveShell(env: Env, url: URL, request: Request): Promise<Response> {
  for (const kind of PAGE_KINDS) {
    const id = url.searchParams.get(kind);
    if (id && /^[1-9]\d{0,8}$/.test(id)) {
      const keep = new URLSearchParams();
      if (kind !== 'tune') for (const k of LIST_PARAMS) if (url.searchParams.get(k)) keep.set(k, url.searchParams.get(k)!);
      const qs = keep.toString();
      return Response.redirect(ORIGIN + pagePath(kind as PageKind, Number(id)) + (qs ? `?${qs}` : ''), 301);
    }
  }
  const res = await env.ASSETS.fetch(request);
  if (!url.search || res.status !== 200) return res;

  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex, follow');
  return new HTMLRewriter()
    .on('link[rel="canonical"]', {
      element(el) {
        el.remove();
      },
    })
    .transform(out);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isRead = request.method === 'GET' || request.method === 'HEAD';

    if (!url.pathname.startsWith('/api/')) {
      if (!isRead) return env.ASSETS.fetch(request);
      const redirect = canonicalRedirect(request, url);
      if (redirect) return redirect;
      if (url.pathname === '/') return serveShell(env, url, request);
      if (url.pathname === '/sitemap.xml') return serveSitemap(ctx);
      const page = parsePagePath(url.pathname);
      if (page) return servePage(request, env, ctx, url, page);
      return env.ASSETS.fetch(request);
    }

    if (!isRead) return errorResponse(405, 'method_not_allowed', 'Only GET is allowed.');
    let res: Response;
    try {
      res = await handleApi(url, ctx);
    } catch (e) {
      if (e instanceof BadRequest) res = errorResponse(400, 'invalid_request', e.message);
      else if (e instanceof UpstreamError) res = errorResponse(e.status, e.code, e.message, e.retryAfter);
      else {
        console.error(e);
        res = errorResponse(500, 'internal_error', 'Something went wrong.');
      }
    }
    return request.method === 'HEAD' ? new Response(null, res) : res;
  },
} satisfies ExportedHandler<Env>;

