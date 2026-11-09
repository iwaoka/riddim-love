// Query validation for the /api/* routes. Anything not listed is rejected,
// so the Worker can never be used as a generic proxy.

export class BadRequest extends Error {}

const ID_RE = /^[1-9]\d{0,8}$/;
const CURSOR_RE = /^[A-Za-z0-9_\-=.]{1,2000}$/;

export function parseId(raw: string): number {
  if (!ID_RE.test(raw)) throw new BadRequest('Invalid id.');
  return Number(raw);
}

export function parseQuery(raw: string | null, { min = 2, max = 100 } = {}): string {
  const q = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < min) throw new BadRequest(`Search needs at least ${min} characters.`);
  if (q.length > max) throw new BadRequest(`Search is limited to ${max} characters.`);
  return q;
}

export function parseCursor(raw: string | null): string | null {
  if (raw == null || raw === '') return null;
  if (!CURSOR_RE.test(raw)) throw new BadRequest('Invalid cursor.');
  return raw;
}

export function parseEnum<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
  if (raw == null || raw === '') return null;
  if (!(allowed as readonly string[]).includes(raw)) throw new BadRequest('Invalid parameter value.');
  return raw as T;
}

/** Rejects unknown query parameters. */
export function onlyParams(params: URLSearchParams, allowed: readonly string[]): void {
  for (const key of params.keys()) {
    if (!allowed.includes(key)) throw new BadRequest(`Unknown parameter: ${key.slice(0, 40)}`);
  }
}

export const SEARCH_TYPES = ['riddim', 'tune', 'artist', 'label', 'producer'] as const;
export const RIDDIM_TUNE_SORTS = ['site', 'title', 'artist', 'year', '-year'] as const;
export const TUNE_SORTS = ['site', 'title', 'year', '-year'] as const;
