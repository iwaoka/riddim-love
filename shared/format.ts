import type { Ref } from './types';

/** "Wayne Smith", or "Artist A & Artist B" for several. */
export function artistNames(artists: Ref[]): string {
  return artists.map((a) => a.name).join(' & ');
}

/** Clipboard format: "Artist - Title" (title alone when there is no artist). */
export function copyText(artists: Ref[], title: string): string {
  return [artistNames(artists), title].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
}

/** Plain "Artist Title" search words (used for YouTube). */
export function searchText(artists: Ref[], title: string): string {
  return [artistNames(artists), title].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Display format: "Artist – Title". */
export function displayText(artists: Ref[], title: string): string {
  const a = artistNames(artists);
  return a ? `${a} – ${title}` : title;
}

export interface YoutubeOptions {
  riddim: boolean;
  label: boolean;
}

/** Riddim name with " Riddim" appended unless it already says so. */
export function riddimTerm(name: string): string {
  return /\briddim\b/i.test(name) ? name : `${name} Riddim`;
}

export function youtubeQuery(
  t: { artists: Ref[]; title: string; riddim: Ref | null; label?: Ref | null },
  opts: YoutubeOptions,
): string {
  const parts = [searchText(t.artists, t.title)];
  if (opts.riddim && t.riddim?.name) parts.push(riddimTerm(t.riddim.name));
  if (opts.label && t.label?.name) parts.push(t.label.name);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function youtubeUrl(query: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
}
