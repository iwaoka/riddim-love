// Listen: streaming services to hear a tune on. Configuration only, like the
// Dig shops (shared/dig.ts) — each entry is a plain search-results URL built in
// the browser from "Artist Title". No API calls, no affiliate or tracking
// parameters. Add a service here and the Listen menu picks it up.
// (YouTube stays its own button beside the menu.)

import type { CountryCode } from './dig';

export interface ListenProvider {
  id: string;
  name: string;
  /** `country`: the visitor's ISO code, for services with per-country stores. */
  buildSearchUrl(query: string, country: CountryCode): string;
}

const q = encodeURIComponent;

/** Display order = array order. */
export const LISTEN_PROVIDERS: readonly ListenProvider[] = [
  { id: 'spotify', name: 'Spotify', buildSearchUrl: (s) => `https://open.spotify.com/search/${q(s)}` },
  {
    id: 'applemusic',
    name: 'Apple Music',
    // The visitor's own storefront (music.apple.com/jp/…); without a country,
    // music.apple.com/search redirects to the US store.
    buildSearchUrl: (s, c) => `https://music.apple.com/${c && /^[A-Za-z]{2}$/.test(c) ? c.toLowerCase() + '/' : ''}search?term=${q(s)}`,
  },
  { id: 'soundcloud', name: 'SoundCloud', buildSearchUrl: (s) => `https://soundcloud.com/search?q=${q(s)}` },
  { id: 'bandcamp', name: 'Bandcamp', buildSearchUrl: (s) => `https://bandcamp.com/search?q=${q(s)}` },
  { id: 'audiomack', name: 'Audiomack', buildSearchUrl: (s) => `https://audiomack.com/search?q=${q(s)}` },
];
