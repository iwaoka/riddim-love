import { describe, expect, it } from 'vitest';
import { copyText, displayText, EXTERNAL_SEARCHES, externalSearchUrl, searchText, youtubeUrl } from '../shared/format';

const ws = [{ id: 263, name: 'Wayne Smith', url: null }];

describe('format', () => {
  it('copy text is "Artist - Title"', () => {
    expect(copyText(ws, 'Under Mi Sleng Teng')).toBe('Wayne Smith - Under Mi Sleng Teng');
    expect(copyText([], 'Dub')).toBe('Dub');
  });
  it('joins several artists with &', () => {
    expect(copyText([...ws, { id: 1, name: 'Tenor Saw', url: null }], 'X')).toBe('Wayne Smith & Tenor Saw - X');
  });
  it('display text is one string "Artist – Title"', () => {
    expect(displayText(ws, 'Under Mi Sleng Teng')).toBe('Wayne Smith – Under Mi Sleng Teng');
    expect(displayText([], 'Dub')).toBe('Dub');
  });
  it('youtube searches "Artist Title"', () => {
    expect(searchText(ws, 'Under Mi Sleng Teng')).toBe('Wayne Smith Under Mi Sleng Teng');
    expect(youtubeUrl(searchText(ws, 'Under Mi Sleng Teng'))).toBe('https://www.youtube.com/results?search_query=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(externalSearchUrl('youtube', ws, 'Under Mi Sleng Teng')).toBe('https://www.youtube.com/results?search_query=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
  });
  it('youtube url is encoded', () => {
    expect(youtubeUrl('A & B #1 / ?x')).toBe('https://www.youtube.com/results?search_query=A%20%26%20B%20%231%20%2F%20%3Fx');
  });
  it('apple music searches "Artist Title" in the visitor’s store', () => {
    expect(externalSearchUrl('applemusic', ws, 'Under Mi Sleng Teng', 'JP')).toBe('https://music.apple.com/jp/search?term=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(externalSearchUrl('applemusic', ws, 'Under Mi Sleng Teng', null)).toBe('https://music.apple.com/search?term=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(externalSearchUrl('applemusic', ws, 'X', '../evil')).toBe('https://music.apple.com/search?term=Wayne%20Smith%20X');
  });
  it('no affiliate or tracking parameters on any external search', () => {
    for (const s of EXTERNAL_SEARCHES) expect([...new URL(s.url('x')).searchParams.keys()]).toHaveLength(1);
  });
});
