// Want list: tunes the visitor wants to find on record. Kept only in their
// own browser (localStorage); the site stores nothing. Each item is a small
// snapshot of what the list shows, so the Want page needs no API requests.

import { riddimName } from './seo';

export interface WantRef {
  id: number;
  name: string;
}

export interface WantItem {
  id: number;
  title: string;
  year: number | null;
  artists: WantRef[];
  riddim: WantRef | null;
  label: WantRef | null;
  /** When it was added (ms since epoch); newest first on the Want page. */
  added: number;
}

export const WANT_KEY = 'riddim.love:want';
export const WANT_MAX = 2000;

type TuneLike = {
  id: number;
  title: string;
  year: number | null;
  artists: { id: number; name: string }[];
  riddim: { id: number; name: string } | null;
  label?: { id: number; name: string } | null;
};

const ref = (r: { id: number; name: string } | null | undefined): WantRef | null => (r ? { id: r.id, name: r.name } : null);

export function toWantItem(t: TuneLike, added = Date.now()): WantItem {
  return {
    id: t.id,
    title: t.title,
    year: t.year ?? null,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
    riddim: ref(t.riddim),
    label: ref(t.label),
    added,
  };
}

const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isRef = (v: unknown): v is WantRef =>
  !!v && typeof v === 'object' && isId((v as WantRef).id) && typeof (v as WantRef).name === 'string';

/** Reads stored JSON, dropping anything malformed (hand-edited or from an older version). */
export function parseWant(raw: string | null): WantItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const out: WantItem[] = [];
  for (const v of data) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (!isId(o.id) || typeof o.title !== 'string' || seen.has(o.id)) continue;
    if (!Array.isArray(o.artists) || !o.artists.every(isRef)) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      title: o.title,
      year: Number.isInteger(o.year) ? (o.year as number) : null,
      artists: (o.artists as WantRef[]).map((a) => ({ id: a.id, name: a.name })),
      riddim: isRef(o.riddim) ? ref(o.riddim) : null,
      label: isRef(o.label) ? ref(o.label) : null,
      added: typeof o.added === 'number' && Number.isFinite(o.added) ? o.added : 0,
    });
    if (out.length >= WANT_MAX) break;
  }
  return out;
}

/** One line per tune for a memo: "Artist - Title (Sleng Teng Riddim, Jammy's, 1985)". */
export function wantLine(w: WantItem): string {
  const head = [w.artists.map((a) => a.name).join(' & '), w.title].filter(Boolean).join(' - ');
  const extra = [w.riddim ? riddimName(w.riddim.name) : '', w.label?.name ?? '', w.year ? String(w.year) : ''].filter(Boolean);
  return (extra.length ? `${head} (${extra.join(', ')})` : head).replace(/\s+/g, ' ').trim();
}

export function wantText(items: readonly WantItem[]): string {
  return items.map(wantLine).join('\n');
}
