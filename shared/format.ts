import type { Ref } from './types';

/** "Wayne Smith", or "Artist A & Artist B" for several. */
export function artistNames(artists: Ref[]): string {
  return artists.map((a) => a.name).join(' & ');
}

/** Clipboard format: "Artist - Title" (title alone when there is no artist). */
export function copyText(artists: Ref[], title: string): string {
  return [artistNames(artists), title].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();
}

/** Plain "Artist Title" search words, shared by every external search. */
export function searchText(artists: Ref[], title: string): string {
  return [artistNames(artists), title].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * External search services. Each one only builds a search-results URL from the
 * shared "Artist Title" words: no API calls, no links to specific releases.
 * Add a service here and it appears wherever tunes are listed.
 */
export interface ExternalSearch {
  id: 'youtube' | 'discogs' | 'mercari' | 'yahoo';
  name: string;
  /** "listen" = YouTube button; "dig" = entries of the Dig menu (record shops / marketplaces). */
  group: 'listen' | 'dig';
  url(query: string): string;
}

// Plain search-results URLs only: no affiliate or tracking parameters.
export const EXTERNAL_SEARCHES: readonly ExternalSearch[] = [
  { id: 'youtube', name: 'YouTube', group: 'listen', url: (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) },
  { id: 'discogs', name: 'Discogs', group: 'dig', url: (q) => 'https://www.discogs.com/search/?q=' + encodeURIComponent(q) },
  { id: 'mercari', name: 'Mercari', group: 'dig', url: (q) => 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(q) },
  { id: 'yahoo', name: 'Yahoo! Auctions', group: 'dig', url: (q) => 'https://auctions.yahoo.co.jp/search/search?p=' + encodeURIComponent(q) },
];

/** The Dig menu, in display order. */
export const DIG_SEARCHES: readonly ExternalSearch[] = EXTERNAL_SEARCHES.filter((s) => s.group === 'dig');

export function externalSearchUrl(id: ExternalSearch['id'], artists: Ref[], title: string): string {
  const service = EXTERNAL_SEARCHES.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown external search: ${id}`);
  return service.url(searchText(artists, title));
}

/** Display format: "Artist – Title". */
export function displayText(artists: Ref[], title: string): string {
  const a = artistNames(artists);
  return a ? `${a} – ${title}` : title;
}

/** YouTube search results URL for the given words (e.g. "Artist Title"). */
export function youtubeUrl(query: string): string {
  return EXTERNAL_SEARCHES[0].url(query);
}
