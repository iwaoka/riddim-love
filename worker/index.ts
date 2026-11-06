// RIDDIM.LOVE Worker: serves the static app and a small, whitelisted
// read-only relay to the Riddim-ID API v1 (https://api.riddim-id.com/docs).

import type { ApiError, SearchResult, TuneList } from '../shared/types';
import * as P from './project';
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

const UPSTREAM = 'https://api.riddim-id.com/v1';
const USER_AGENT = 'RIDDIM.LOVE/0.1 (+https://riddim.love; independent non-commercial search frontend)';
const UPSTREAM_TIMEOUT_MS = 10_000;
const DEFAULT_TTL = 300;
const SEARCH_LIMIT = 50; // upstream maximum

/** Set when upstream answers 429; requests are refused locally until then. */
let cooldownUntil = 0;

class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function ttlFrom(cacheControl: string | null): number {
  const m = /s-maxage=(\d+)/.exec(cacheControl ?? '') ?? /max-age=(\d+)/.exec(cacheControl ?? '');
  const n = m ? Number(m[1]) : DEFAULT_TTL;
  return Math.min(Math.max(n, 60), 86_400);
}

/** GET an upstream path, through the Cloudflare edge cache. Returns parsed JSON. */
async function upstream(path: string, params: Record<string, string | number | null>, ctx: ExecutionContext): Promise<unknown> {
  const url = new URL(UPSTREAM + path);
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const now = Date.now();
  if (now < cooldownUntil) {
    const wait = Math.ceil((cooldownUntil - now) / 1000);
    throw new UpstreamError(429, 'rate_limited', 'Riddim-ID is rate limiting requests. Please try again shortly.', wait);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError(502, 'upstream_unreachable', 'Could not reach Riddim-ID. Please try again.');
  }

  if (res.status === 429) {
    const ra = Number(res.headers.get('Retry-After')) || 60;
    cooldownUntil = Date.now() + ra * 1000;
    throw new UpstreamError(429, 'rate_limited', 'Riddim-ID is rate limiting requests. Please try again shortly.', ra);
  }
  if (res.status === 404) throw new UpstreamError(404, 'not_found', 'Not found on Riddim-ID.');
  if (res.status === 422) throw new UpstreamError(400, 'invalid_request', 'Riddim-ID rejected the request.');
  if (!res.ok) throw new UpstreamError(502, 'upstream_error', `Riddim-ID returned an error (${res.status}).`);

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new UpstreamError(502, 'upstream_error', 'Riddim-ID returned an unexpected response.');
  }

  const ttl = ttlFrom(res.headers.get('Cache-Control'));
  const toCache = new Response(text, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return body;
}

const data = (body: unknown): unknown => (body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined);

function tuneList(body: unknown): TuneList {
  const meta = (body as { meta?: { total?: unknown; next_cursor?: unknown } })?.meta ?? {};
  return {
    tunes: P.tunes(data(body)),
    total: typeof meta.total === 'number' ? meta.total : null,
    next_cursor: typeof meta.next_cursor === 'string' ? meta.next_cursor : null,
  };
}

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
      names: type === 'tune' ? [] : hits.map(P.nameHit).filter((x) => x !== null && x.type === type) as SearchResult['names'],
      tunes: type === 'tune' ? (hits.map(P.tuneHit).filter((x) => x !== null) as SearchResult['tunes']) : [],
      limit: SEARCH_LIMIT,
    };
    return json(result);
  }

  if ((m = /^\/api\/riddims\/([^/]+)$/.exec(path))) {
    onlyParams(p, []);
    const id = parseId(m[1]);
    const r = P.riddim(data(await upstream(`/riddims/${id}`, {}, ctx)));
    if (!r) throw new UpstreamError(502, 'upstream_error', 'Riddim-ID returned an unexpected response.');
    return json(r);
  }

  if ((m = /^\/api\/riddims\/([^/]+)\/tunes$/.exec(path))) {
    onlyParams(p, ['cursor', 'sort', 'q', 'versions']);
    const id = parseId(m[1]);
    const q = p.get('q') ? parseQuery(p.get('q'), { min: 1, max: 100 }) : null;
    const body = await upstream(
      `/riddims/${id}/tunes`,
      {
        cursor: parseCursor(p.get('cursor')),
        sort: parseEnum(p.get('sort'), RIDDIM_TUNE_SORTS),
        q,
        versions: parseEnum(p.get('versions'), ['include'] as const),
      },
      ctx,
    );
    return json(tuneList(body));
  }

  if ((m = /^\/api\/(artists|producers|labels)\/([^/]+)\/tunes$/.exec(path))) {
    onlyParams(p, ['cursor', 'sort']);
    const id = parseId(m[2]);
    const body = await upstream(
      `/${m[1]}/${id}/tunes`,
      { cursor: parseCursor(p.get('cursor')), sort: parseEnum(p.get('sort'), TUNE_SORTS) },
      ctx,
    );
    return json(tuneList(body));
  }

  if ((m = /^\/api\/tunes\/([^/]+)$/.exec(path))) {
    onlyParams(p, []);
    const id = parseId(m[1]);
    const t = P.tune(data(await upstream(`/tunes/${id}`, {}, ctx)));
    if (!t) throw new UpstreamError(502, 'upstream_error', 'Riddim-ID returned an unexpected response.');
    return json(t);
  }

  return errorResponse(404, 'not_found', 'Unknown API route.');
}

const CANONICAL_ORIGIN = 'https://riddim.love';

/**
 * The HTML shell at "/" (the only document route; everything else under
 * /assets etc. is served by Static Assets without invoking the Worker).
 *
 * - workers.dev / plain http → 301 to the canonical https://riddim.love origin.
 * - Any query-string view (?q=, ?type=, ?riddim=, ?tune=, …) is app state, not a
 *   page of its own yet: send `X-Robots-Tag: noindex, follow` and drop the
 *   canonical tag (which points at "/"), so only the home page is indexed and
 *   links inside rendered views can still be followed.
 */
async function serveShell(request: Request, env: Env, url: URL): Promise<Response> {
  const isWorkersDev = url.hostname.endsWith('.workers.dev');
  // The visitor's scheme comes from Cloudflare's CF-Visitor header (absent in
  // `wrangler dev`, which also rewrites the URL to the production hostname).
  const isHttp = /"scheme":"http"/.test(request.headers.get('CF-Visitor') ?? '');
  if (isWorkersDev || isHttp) {
    return Response.redirect(CANONICAL_ORIGIN + url.pathname + url.search, 301);
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
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) return serveShell(request, env, url);
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'method_not_allowed', 'Only GET is allowed.');
    }
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
