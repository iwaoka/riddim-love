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
  const primary = artist.split(JOINS).map((s) => s.trim()).find(Boolean) ?? artist;
  return { artist, primary, title };
}

/** Same name, ignoring case, accents and apostrophes. */
export function sameName(a: string, b: string | null | undefined): boolean {
  return !!b && fold(a) === fold(b);
}
