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
  id: 'youtube' | 'applemusic';
  name: string;
  /** `country`: the visitor's ISO code, for services with per-country stores. */
  url(query: string, country?: string | null): string;
}

// Plain search-results URLs only: no affiliate or tracking parameters.
// (Record shops / marketplaces for the Dig menu live in shared/dig.ts.)
export const EXTERNAL_SEARCHES: readonly ExternalSearch[] = [
  { id: 'youtube', name: 'YouTube', url: (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) },
  // The visitor's own storefront (music.apple.com/jp/…); without a country,
  // music.apple.com/search redirects to the US store.
  {
    id: 'applemusic',
    name: 'Apple Music',
    url: (q, c) => `https://music.apple.com/${c && /^[A-Za-z]{2}$/.test(c) ? c.toLowerCase() + '/' : ''}search?term=` + encodeURIComponent(q),
  },
];

export function externalSearchUrl(id: ExternalSearch['id'], artists: Ref[], title: string, country?: string | null): string {
  const service = EXTERNAL_SEARCHES.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown external search: ${id}`);
  return service.url(searchText(artists, title), country);
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
