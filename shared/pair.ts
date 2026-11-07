// "Artist - Title" pasted into the tune search (beta).
// The Riddim-ID search only matches tune titles, so a pasted "Artist - Title"
// is split here: the artist is looked up by name, then that artist's own
// page is opened, filtered by the title (the whole list, no 50-hit cap).

import { fold } from './filter';

export interface ArtistTitle {
  /** The artist part as typed, e.g. "Tenor Saw & Buju Banton". */
  artist: string;
  /** The first named artist, used for the lookup, e.g. "Tenor Saw". */
  primary: string;
  title: string;
}

// Hyphen / en dash / em dash with spaces around it ("Ring-A-Ling" stays one
// title), or a tab (pasted from a spreadsheet).
const SEPARATOR = /\s+[-–—]\s+|\t+/;
// Joins between several artists: "&", ",", "and", "feat.", "ft.", "x", "vs".
const JOINS = /\s*(?:&|,|\+|\/)\s*|\s+(?:and|feat\.?|ft\.?|featuring|x|vs\.?)\s+/i;

/** Splits "Artist - Title"; null when there is no separator or either side is empty. */
export function splitArtistTitle(query: string): ArtistTitle | null {
  const q = query.replace(/\s+/g, (s) => (s.includes('\t') ? '\t' : ' ')).trim();
  const m = SEPARATOR.exec(q);
  if (!m) return null;
  const artist = q.slice(0, m.index).trim();
  const title = q.slice(m.index + m[0].length).trim();
  if (!artist || !title) return null;
  return { artist, primary: primaryArtist(artist), title };
}

/** "Title - Artist": the same split read the other way round. */
export function swapArtistTitle(p: ArtistTitle): ArtistTitle {
  return { artist: p.title, primary: primaryArtist(p.title), title: p.artist };
}

function primaryArtist(artist: string): string {
  return artist.split(JOINS).map((s) => s.trim()).find(Boolean) ?? artist;
}

/**
 * "Artist Title" with no separator: the longest artist name (from an artist
 * search on the whole query) that the query starts with, word for word.
 * Returns that name and the rest as the title; null when none fits or
 * nothing is left over for the title.
 */
export function splitByArtistPrefix(
  query: string,
  artists: readonly { name: string; matched_name?: string | null }[],
): { name: string; title: string } | null {
  return splitByArtistName(query, artists, 'start');
}

/** "Title Artist": the longest artist name the query ends with; the rest is the title. */
export function splitByArtistSuffix(
  query: string,
  artists: readonly { name: string; matched_name?: string | null }[],
): { name: string; title: string } | null {
  return splitByArtistName(query, artists, 'end');
}

function splitByArtistName(
  query: string,
  artists: readonly { name: string; matched_name?: string | null }[],
  at: 'start' | 'end',
): { name: string; title: string } | null {
  const words = query.trim().split(/\s+/);
  const folded = words.map(fold);
  let best: { name: string; title: string; n: number } | null = null;
  for (const a of artists) {
    for (const name of [a.name, a.matched_name]) {
      if (!name) continue;
      const nameWords = fold(name).split(' ').filter(Boolean);
      const n = nameWords.length;
      if (!n || n >= words.length || (best && n <= best.n)) continue;
      const offset = at === 'start' ? 0 : words.length - n;
      // Compare word by word on folded text ("Jammy's" = "Jammys").
      if (nameWords.every((w, i) => folded[offset + i] === w)) {
        const title = at === 'start' ? words.slice(n) : words.slice(0, words.length - n);
        best = { name: a.name, title: title.join(' '), n };
      }
    }
  }
  return best && { name: best.name, title: best.title };
}

/** Same name, ignoring case, accents and apostrophes. */
export function sameName(a: string, b: string | null | undefined): boolean {
  return !!b && fold(a) === fold(b);
}
