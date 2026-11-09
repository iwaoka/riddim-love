import { describe, expect, it } from 'vitest';
import { LISTEN_PROVIDERS } from '../shared/listen';

const url = (id: string, q: string, country: string | null = null) => LISTEN_PROVIDERS.find((p) => p.id === id)!.buildSearchUrl(q, country);
const q = 'Wayne Smith Under Mi Sleng Teng';
const enc = 'Wayne%20Smith%20Under%20Mi%20Sleng%20Teng';

describe('Listen menu', () => {
  it('lists the five services in order', () => {
    expect(LISTEN_PROVIDERS.map((p) => p.name)).toEqual(['Spotify', 'Apple Music', 'SoundCloud', 'Bandcamp', 'Audiomack']);
  });

  it('builds plain search URLs for "Artist Title"', () => {
    expect(url('spotify', q)).toBe(`https://open.spotify.com/search/${enc}`);
    expect(url('soundcloud', q)).toBe(`https://soundcloud.com/search?q=${enc}`);
    expect(url('bandcamp', q)).toBe(`https://bandcamp.com/search?q=${enc}`);
    expect(url('audiomack', q)).toBe(`https://audiomack.com/search?q=${enc}`);
  });

  it('opens Apple Music in the visitor’s store; falls back to Apple’s default', () => {
    expect(url('applemusic', q, 'JP')).toBe(`https://music.apple.com/jp/search?term=${enc}`);
    expect(url('applemusic', q, null)).toBe(`https://music.apple.com/search?term=${enc}`);
    expect(url('applemusic', 'X', '../evil')).toBe('https://music.apple.com/search?term=X');
  });

  it('encodes the query and adds no tracking parameters', () => {
    expect(url('spotify', 'A & B / #1')).toBe('https://open.spotify.com/search/A%20%26%20B%20%2F%20%231');
    for (const p of LISTEN_PROVIDERS) {
      const u = new URL(p.buildSearchUrl('x', 'GB'));
      expect(u.protocol).toBe('https:');
      expect([...u.searchParams.keys()].length).toBeLessThanOrEqual(1);
    }
  });
});
