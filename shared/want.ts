// Want list and Dig history: tunes kept only in the visitor's own browser
// (localStorage, one key each); the site stores nothing. Each item is a small
// snapshot of what the list shows, so these pages need no API requests.
//  - Want: tunes the visitor wants to find on record (added by hand).
//  - Dig: tunes they searched record shops for from the Dig menu (added on
//    the tap; the record of a search link opened, not of a visit or purchase).

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

/** The tune fields both lists keep. */
export type TuneSnapshot = Omit<WantItem, 'added'>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Reads a stored list, dropping anything malformed (hand-edited or from an
 * older version) and repeated ids; `extra` adds the list's own fields.
 */
function parseList<T extends TuneSnapshot>(raw: string | null, max: number, extra: (o: Record<string, unknown>) => Omit<T, keyof TuneSnapshot>): T[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const out: T[] = [];
  for (const v of data) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (!isId(o.id) || typeof o.title !== 'string' || seen.has(o.id)) continue;
    if (!Array.isArray(o.artists) || !o.artists.every(isRef)) continue;
    seen.add(o.id);
    const base: TuneSnapshot = {
      id: o.id,
      title: o.title,
      year: Number.isInteger(o.year) ? (o.year as number) : null,
      artists: (o.artists as WantRef[]).map((a) => ({ id: a.id, name: a.name })),
      riddim: isRef(o.riddim) ? ref(o.riddim) : null,
      label: isRef(o.label) ? ref(o.label) : null,
    };
    out.push({ ...base, ...extra(o) } as T);
    if (out.length >= max) break;
  }
  return out;
}

/** Reads the stored Want list. */
export function parseWant(raw: string | null): WantItem[] {
  return parseList<WantItem>(raw, WANT_MAX, (o) => ({ added: num(o.added) }));
}

// ---------- Dig history ----------

export interface DigItem extends TuneSnapshot {
  /** Last time a Dig search was opened for this tune (ms since epoch); newest first. */
  dug: number;
  /** Where that last search went: a Dig provider id ("discogs", "mercari", …). */
  service: string;
}

export const DIG_KEY = 'riddim.love:dig';
/** Oldest entries drop off past this. */
export const DIG_MAX = 500;

const SERVICE_RE = /^[a-z0-9-]{1,40}$/;

/** Reads the stored Dig history, newest first. */
export function parseDig(raw: string | null): DigItem[] {
  return parseList<DigItem>(raw, DIG_MAX, (o) => ({
    dug: num(o.dug),
    service: typeof o.service === 'string' && SERVICE_RE.test(o.service) ? o.service : '',
  })).sort((a, b) => b.dug - a.dug);
}

/**
 * A Dig search was opened: the tune goes to the top with this time and service.
 * One entry per tune id (same artist + title under another id is another tune).
 */
export function recordDig(list: readonly DigItem[], t: Parameters<typeof toWantItem>[0], service: string, now = Date.now()): DigItem[] {
  const { added: _added, ...snap } = toWantItem(t, now);
  const item: DigItem = { ...snap, dug: now, service: SERVICE_RE.test(service) ? service : '' };
  return [item, ...list.filter((d) => d.id !== t.id)].slice(0, DIG_MAX);
}

export function removeDig(list: readonly DigItem[], id: number): DigItem[] {
  return list.filter((d) => d.id !== id);
}

/** One line per tune for a memo: "Artist - Title (Sleng Teng Riddim, Jammy's, 1985)". */
export function wantLine(w: TuneSnapshot): string {
  const head = [w.artists.map((a) => a.name).join(' & '), w.title].filter(Boolean).join(' - ');
  const extra = [w.riddim ? riddimName(w.riddim.name) : '', w.label?.name ?? '', w.year ? String(w.year) : ''].filter(Boolean);
  return (extra.length ? `${head} (${extra.join(', ')})` : head).replace(/\s+/g, ' ').trim();
}

export function wantText(items: readonly TuneSnapshot[]): string {
  return items.map(wantLine).join('\n');
}
