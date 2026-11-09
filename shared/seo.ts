// URLs, slugs, titles and descriptions for detail pages.
// Shared by the Worker (server-rendered HTML) and the browser app, so links,
// canonical URLs and <title>s are identical whichever side builds them.

import { fold } from './filter';
import { artistNames, displayText } from './format';
import type { Ref, Tune } from './types';

export const ORIGIN = 'https://riddim.love';
export const SITE = 'RIDDIM.LOVE';

export type PageKind = 'riddim' | 'artist' | 'producer' | 'label' | 'tune';
export const PAGE_KINDS: readonly PageKind[] = ['riddim', 'artist', 'producer', 'label', 'tune'];

/** Pages search engines may index. Tune pages are thin (one row each) and stay noindex for now. */
export const INDEXABLE: Readonly<Record<PageKind, boolean>> = { riddim: true, artist: true, producer: true, label: true, tune: false };

/** "Under Mi Sleng Teng" → "under-mi-sleng-teng". ASCII only; may be "". */
export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Last path segment of a riddim-id.com URL, e.g. ".../riddims/18/sleng-teng" → "sleng-teng". */
export function slugFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    // A bare number is the id, not a slug (".../riddims/18").
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seg) && !/^\d+$/.test(seg) ? seg : '';
  } catch {
    return '';
  }
}

export function pagePath(kind: PageKind, id: number, slug = ''): string {
  return `/${kind}/${id}${slug ? `/${slug}` : ''}`;
}

/** Path for a riddim / artist / producer / label reference carried inside tune data. */
export function refPath(kind: Exclude<PageKind, 'tune'>, ref: Pick<Ref, 'id' | 'url'>): string {
  return pagePath(kind, ref.id, slugFromUrl(ref.url));
}

export function tunePath(t: { id: number; title: string }): string {
  return pagePath('tune', t.id, slugify(t.title));
}

/** "/riddim/18/sleng-teng" → { kind, id, slug } (slug may be ""). */
export function parsePagePath(pathname: string): { kind: PageKind; id: number; slug: string } | null {
  const m = /^\/(riddim|artist|producer|label|tune)\/([1-9]\d{0,8})(?:\/([^/]*))?\/?$/.exec(pathname);
  return m ? { kind: m[1] as PageKind, id: Number(m[2]), slug: m[3] ?? '' } : null;
}

/** "Sleng Teng" → "Sleng Teng Riddim"; leaves names that already say "riddim". */
export function riddimName(name: string): string {
  return /\briddim\b/i.test(name) ? name : `${name} Riddim`;
}

const clip = (s: string, n = 158) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

/** A few "Artist – Title" examples for descriptions. */
function examples(tunes: Tune[], n = 3): string {
  return tunes
    .slice(0, n)
    .map((t) => displayText(t.artists, t.title))
    .join(', ');
}

export interface PageMeta {
  title: string;
  description: string;
  h1: string;
}

// No year / producer: a riddim list also holds later same-name re-licks
// (other years, other producers), so the original's facts would mislead.
export function riddimMeta(r: { name: string }, total: number | null, tunes: Tune[]): PageMeta {
  const h1 = riddimName(r.name);
  const count = total != null ? ` – ${total} ${total === 1 ? 'Tune' : 'Tunes'}` : '';
  const ex = examples(tunes);
  return {
    title: `${h1}${count} | ${SITE}`,
    description: clip(`${h1}${count}. Tune list with artist, label and year${ex ? `: ${ex}` : ''}.`),
    h1,
  };
}

export function personMeta(role: 'artist' | 'producer', name: string, tunes: Tune[]): PageMeta {
  const ex = tunes
    .slice(0, 3)
    .map((t) => `${t.title}${t.riddim ? ` (${riddimName(t.riddim.name)})` : ''}`)
    .join(', ');
  const what = role === 'artist' ? `Tunes by ${name}` : `Tunes produced by ${name}`;
  return {
    title: role === 'artist' ? `${name} – Tunes & Riddims | ${SITE}` : `${name} – Producer: Tunes & Riddims | ${SITE}`,
    description: clip(`${what} with riddim, label and year${ex ? `: ${ex}` : ''}.`),
    h1: name,
  };
}

export function labelMeta(l: { name: string; founded_year: number | null }, tunes: Tune[]): PageMeta {
  const ex = examples(tunes);
  return {
    title: `${l.name} – Label: Tunes & Riddims | ${SITE}`,
    description: clip(`Tunes released on ${l.name}${l.founded_year ? ` (founded ${l.founded_year})` : ''} with artist, riddim and year${ex ? `: ${ex}` : ''}.`),
    h1: l.name,
  };
}

export function tuneMeta(t: Tune): PageMeta {
  const at = displayText(t.artists, t.title);
  const rid = t.riddim ? riddimName(t.riddim.name) : null;
  const paren = [rid, t.year ? String(t.year) : null].filter(Boolean).join(', ');
  const bits = [
    rid ? `on the ${rid}` : null,
    t.label ? `released on ${t.label.name}` : null,
    t.producers.length ? `produced by ${artistNames(t.producers)}` : null,
  ].filter(Boolean);
  return {
    title: `${at}${paren ? ` (${paren})` : ''} | ${SITE}`,
    description: clip(`${at}${t.year ? ` (${t.year})` : ''}${bits.length ? `, ${bits.join(', ')}` : ''}.`),
    h1: at,
  };
}

// ---------- riddim page head (shared by the Worker and the app) ----------

/** "Wayne Smith – Under Mi Sleng Teng (1985)": the year belongs to the tune, not the riddim. */
export function originalTuneText(t: Pick<Tune, 'artists' | 'title' | 'year'>): string {
  return displayText(t.artists, t.title) + (t.year ? ` (${t.year})` : '');
}

export const ORIGINAL_TUNES_MAX = 3;
export const ALT_NAMES_MAX = 5;

/**
 * Alternate names worth showing: not the riddim's own name again (ignoring
 * case, accents, apostrophes and the word "Riddim"), no repeats, at most `max`.
 */
export function altNames(name: string, alts: readonly string[], max = ALT_NAMES_MAX): { shown: string[]; more: number } {
  const key = (s: string) => fold(s).replace(/\briddim\b/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Set([key(name)]);
  const kept: string[] = [];
  for (const a of alts) {
    const k = key(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    kept.push(a.trim());
  }
  return { shown: kept.slice(0, max), more: Math.max(0, kept.length - max) };
}
