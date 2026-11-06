import { artistNames } from './format';
import type { Ref } from './types';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true, ignorePunctuation: false });

interface Sortable {
  artists: Ref[];
  title: string;
  label?: Ref | null;
}

/**
 * Label → Artist → Title, ascending, case-insensitive (Intl.Collator).
 * Rows without a label go last. Ties keep their original order.
 * Returns a new array; the input is untouched.
 */
export function sortByLabelArtistTitle<T extends Sortable>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i, label: row.label?.name?.trim() ?? '', artist: artistNames(row.artists).trim() }))
    .sort((a, b) => {
      if (!a.label !== !b.label) return a.label ? -1 : 1;
      return (
        collator.compare(a.label, b.label) ||
        collator.compare(a.artist, b.artist) ||
        collator.compare(a.row.title, b.row.title) ||
        a.i - b.i
      );
    })
    .map((x) => x.row);
}
