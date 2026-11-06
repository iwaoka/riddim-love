// Client-side filter for tune lists: Artist, Title and Label.
// Case- and accent-insensitive; every word typed must appear somewhere
// (in any of the three fields), so "jammy tenor" finds Tenor Saw on Jammy's.

import { artistNames } from './format';
import type { Ref } from './types';

export interface Filterable {
  artists: Ref[];
  title: string;
  label?: Ref | null;
}

/** "Éclair  Dub" → "eclair dub" (no accents, lower-case, single spaces). */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '') // "Jammy's" matches "jammys"
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words of a filter query, folded. Empty → no filter. */
export function filterWords(query: string): string[] {
  return fold(query).split(' ').filter(Boolean);
}

const cache = new WeakMap<object, string>();

/** The searchable text of one row (folded once per row and reused while typing). */
export function haystack(row: Filterable): string {
  let text = cache.get(row);
  if (text === undefined) {
    text = fold([artistNames(row.artists), row.title, row.label?.name ?? ''].join(' '));
    cache.set(row, text);
  }
  return text;
}

export function matches(row: Filterable, words: readonly string[]): boolean {
  if (!words.length) return true;
  const text = haystack(row);
  return words.every((w) => text.includes(w));
}
