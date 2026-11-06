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

/** YouTube search results URL for the given words (e.g. "Artist Title"). */
export function youtubeUrl(query: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
}
