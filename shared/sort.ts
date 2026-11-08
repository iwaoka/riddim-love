import { artistNames } from './format';
import type { Ref } from './types';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export interface Sortable {
  artists: Ref[];
  title: string;
  riddim?: Ref | null;
  label?: Ref | null;
  year?: number | null;
}

export type SortKey = 'artist' | 'title' | 'riddim' | 'label' | 'year';
export type SortDir = 'asc' | 'desc';
export const SORT_KEYS: readonly SortKey[] = ['artist', 'title', 'riddim', 'label', 'year'];

const text = (row: Sortable, key: Exclude<SortKey, 'year'>): string => {
  if (key === 'artist') return artistNames(row.artists).trim();
  if (key === 'title') return row.title.trim();
  return (row[key]?.name ?? '').trim();
};

/** Tie-break order after the chosen column. */
const TIE: Exclude<SortKey, 'year'>[] = ['label', 'artist', 'title'];

/**
 * Sorts by one column, ascending or descending (Intl.Collator, case-insensitive,
 * numbers in natural order). Empty values always go last, whatever the direction.
 * Ties fall back to Label → Artist → Title (ascending), then the original order.
 * Returns a new array; the input is untouched.
 */
export function sortRows<T extends Sortable>(rows: readonly T[], key: SortKey, dir: SortDir = 'asc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      let primary = 0;
      if (key === 'year') {
        const ya = a.row.year ?? null;
        const yb = b.row.year ?? null;
        if ((ya === null) !== (yb === null)) return ya === null ? 1 : -1;
        primary = ya !== null && yb !== null ? (ya - yb) * sign : 0;
      } else {
        const ta = text(a.row, key);
        const tb = text(b.row, key);
        if (!ta !== !tb) return ta ? -1 : 1;
        primary = collator.compare(ta, tb) * sign;
      }
      if (primary) return primary;
      for (const k of TIE) {
        if (k === key) continue;
        const ta = text(a.row, k);
        const tb = text(b.row, k);
        if (!ta !== !tb) return ta ? -1 : 1;
        const c = collator.compare(ta, tb);
        if (c) return c;
      }
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/** Label → Artist → Title, ascending; blank labels last; stable. */
export function sortByLabelArtistTitle<T extends Sortable>(rows: readonly T[]): T[] {
  return sortRows(rows, 'label', 'asc');
}

/** URL form of a column sort: "year" (ascending) / "-year" (descending). */
export function formatSort(s: { key: SortKey; dir: SortDir } | null): string | null {
  return s ? (s.dir === 'desc' ? '-' : '') + s.key : null;
}

/** Reads ?sort=; null for a missing or unknown value. */
export function parseSort(v: string | null | undefined): { key: SortKey; dir: SortDir } | null {
  if (!v) return null;
  const desc = v.startsWith('-');
  const key = (desc ? v.slice(1) : v) as SortKey;
  return SORT_KEYS.includes(key) ? { key, dir: desc ? 'desc' : 'asc' } : null;
}
