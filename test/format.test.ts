import { describe, expect, it } from 'vitest';
import { copyText, DIG_SEARCHES, displayText, EXTERNAL_SEARCHES, externalSearchUrl, searchText, youtubeUrl } from '../shared/format';

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
  });
  it('youtube url is encoded', () => {
    expect(youtubeUrl('A & B #1 / ?x')).toBe('https://www.youtube.com/results?search_query=A%20%26%20B%20%231%20%2F%20%3Fx');
  });
  it('external searches share "Artist Title"; copy stays "Artist - Title"', () => {
    expect(externalSearchUrl('youtube', ws, 'Under Mi Sleng Teng')).toBe('https://www.youtube.com/results?search_query=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(externalSearchUrl('discogs', ws, 'Under Mi Sleng Teng')).toBe('https://www.discogs.com/search/?q=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(copyText(ws, 'Under Mi Sleng Teng')).toBe('Wayne Smith - Under Mi Sleng Teng');
  });
  it('discogs url is encoded', () => {
    const a = [{ id: 1, name: 'Bounty Killer & Wayne Smith', url: null }];
    expect(externalSearchUrl('discogs', a, 'Sleng Teng #1 / Ting?')).toBe('https://www.discogs.com/search/?q=Bounty%20Killer%20%26%20Wayne%20Smith%20Sleng%20Teng%20%231%20%2F%20Ting%3F');
  });
  it('dig menu: Discogs, Mercari, Yahoo! Auctions with the shared "Artist Title" words', () => {
    expect(DIG_SEARCHES.map((s) => s.id)).toEqual(['discogs', 'mercari', 'yahoo']);
    expect(externalSearchUrl('mercari', ws, 'Under Mi Sleng Teng')).toBe('https://jp.mercari.com/search?keyword=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
    expect(externalSearchUrl('yahoo', ws, 'Under Mi Sleng Teng')).toBe('https://auctions.yahoo.co.jp/search/search?p=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng');
  });
  it('no affiliate or tracking parameters: each URL has exactly one query parameter', () => {
    for (const s of EXTERNAL_SEARCHES) expect([...new URL(s.url('x')).searchParams.keys()]).toHaveLength(1);
  });
});
