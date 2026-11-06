// Upstream access to the Riddim-ID API v1, through the Cloudflare edge cache.
// Cache TTL follows the upstream Cache-Control (s-maxage, default 300 s).

import type { TuneList } from '../shared/types';
import * as P from './project';

const UPSTREAM = 'https://api.riddim-id.com/v1';
const USER_AGENT = 'RIDDIM.LOVE/0.1 (+https://riddim.love; independent non-commercial search frontend)';
const UPSTREAM_TIMEOUT_MS = 10_000;
const DEFAULT_TTL = 300;

/** Set when upstream answers 429; requests are refused locally until then. */
let cooldownUntil = 0;

export class UpstreamError extends Error {
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

/** Per-request counters, so callers can log how much upstream work a page cost. */
export interface UpstreamStats {
  hits: number;
  misses: number;
}

/** GET an upstream path, through the Cloudflare edge cache. Returns parsed JSON. */
export async function upstream(
  path: string,
  params: Record<string, string | number | null>,
  ctx: ExecutionContext,
  stats?: UpstreamStats,
): Promise<unknown> {
  const url = new URL(UPSTREAM + path);
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) {
    if (stats) stats.hits++;
    return hit.json();
  }
  if (stats) stats.misses++;

  const now = Date.now();
  if (now < cooldownUntil) {
    const wait = Math.ceil((cooldownUntil - now) / 1000);
    throw new UpstreamError(429, 'rate_limited', 'Riddim-ID is rate limiting requests. Please try again shortly.', wait);
  }

  const get = () =>
    fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  let res: Response;
  try {
    res = await get();
  } catch {
    // One immediate retry for a dropped connection only (never for HTTP errors / 429).
    try {
      res = await get();
    } catch {
      throw new UpstreamError(502, 'upstream_unreachable', 'Could not reach Riddim-ID. Please try again.');
    }
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

export const data = (body: unknown): unknown => (body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined);

export function tuneList(body: unknown): TuneList {
  const meta = (body as { meta?: { total?: unknown; next_cursor?: unknown } })?.meta ?? {};
  return {
    tunes: P.tunes(data(body)),
    total: typeof meta.total === 'number' ? meta.total : null,
    next_cursor: typeof meta.next_cursor === 'string' ? meta.next_cursor : null,
  };
}

export const unexpected = () => new UpstreamError(502, 'upstream_error', 'Riddim-ID returned an unexpected response.');
