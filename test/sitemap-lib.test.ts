import { describe, expect, it } from 'vitest';
import {
  countLocs, duplicateNames, indexXml, isPlaceholder, pageUrl, pickPage, splitFiles, tuneCount, urlsetXml, validateSet,
} from '../scripts/sitemap-lib';

const riddim = (id: number, name: string, slug: string, tunes: number, withVersions = tunes) => ({ id, name, slug, counts: { tunes, tunes_including_versions: withVersions } });

describe('sitemap: which pages', () => {
  it('reads the count that matches each page', () => {
    expect(tuneCount('riddim', { counts: { tunes: 5, tunes_including_versions: 9 } })).toBe(5);
    expect(tuneCount('artist', { counts: { tunes_as_artist: 4, tunes_as_producer: 50 } })).toBe(4);
    expect(tuneCount('producer', { counts: { tunes_as_artist: 4, tunes_as_producer: 50 } })).toBe(50);
    expect(tuneCount('label', {})).toBeNull();
  });

  it('skips placeholder records', () => {
    for (const n of ['[Dub]', '[Unknown]', '~Unknown (027)', '~Unknown', 'Unknown', 'Unknown (12)', '', null]) expect(isPlaceholder(n)).toBe(true);
    for (const n of ['Sleng Teng', 'Unknown Soldier', "'D' Tape", '@', '#Hashtag', '[Dub] Plate']) expect(isPlaceholder(n)).toBe(false);
  });

  it('builds the canonical URL like the Worker does', () => {
    expect(pageUrl('riddim', { id: 18, slug: 'sleng-teng' })).toBe('https://riddim.love/riddim/18/sleng-teng');
    expect(pageUrl('label', { id: '61', slug: 'jammys' })).toBe('https://riddim.love/label/61/jammys');
    expect(pageUrl('artist', { id: 7, slug: 'Bad Slug!' })).toBe('https://riddim.love/artist/7');
    for (const bad of [0, -1, 1.5, 'x', null]) expect(pageUrl('riddim', { id: bad, slug: 'a' })).toBeNull();
  });

  it('lists by the page’s own count, stops only when the sort count is under the minimum', () => {
    const page = [
      riddim(1, 'A', 'a', 10),
      riddim(2, '~Unknown (001)', 'unknown-001', 5),
      riddim(6, 'Parent', 'parent', 1, 40), // tunes are on its versions: skipped, walk goes on
      riddim(3, 'B', 'b', 2),
      riddim(4, 'C', 'c', 1), // sort count 1 < 2: stop here
      riddim(5, 'D', 'd', 9),
    ];
    const got = pickPage('riddim', page);
    expect(got.urls).toEqual(['https://riddim.love/riddim/1/a', 'https://riddim.love/riddim/3/b']);
    expect(got.stop).toBe(true);
    const artist = (tunes: number, withAliases: number) => ({ id: 1, name: 'X', slug: 'x', counts: { tunes_as_artist: tunes, tunes_as_artist_including_aliases: withAliases } });
    expect(pickPage('artist', [artist(1, 50)])).toEqual({ urls: [], names: [], stop: false });
    expect(pickPage('artist', [artist(3, 3)]).urls).toHaveLength(1);
    expect(pickPage('artist', [artist(2, 2)]).stop).toBe(true);
  });
});

describe('sitemap: files', () => {
  it('writes urlset and index documents without lastmod', () => {
    const xml = urlsetXml(['https://riddim.love/label/1/a', 'https://riddim.love/x?a=1&b=2']);
    expect(xml).toContain('<loc>https://riddim.love/x?a=1&amp;b=2</loc>');
    expect(xml).not.toContain('lastmod');
    expect(countLocs(xml)).toBe(2);
    expect(indexXml(['https://riddim.love/sitemaps/riddim.xml'])).toContain('<sitemapindex');
  });

  it('splits at the protocol limit', () => {
    expect(splitFiles('artist', ['a', 'b', 'c'], 2).map((f) => [f.name, f.urls.length])).toEqual([['artist-1.xml', 2], ['artist-2.xml', 1]]);
    expect(splitFiles('label', ['a'], 2)[0].name).toBe('label.xml');
  });

  it('refuses duplicates, foreign URLs, empty kinds and a big drop from the last run', () => {
    const ok = { name: 'riddim.xml', xml: urlsetXml(['https://riddim.love/riddim/1/a']) };
    expect(validateSet([ok], { riddim: 1 }, {})).toEqual([]);
    const dup = { name: 'label.xml', xml: urlsetXml(['https://riddim.love/riddim/1/a', 'https://example.com/x']) };
    const problems = validateSet([ok, dup], { riddim: 1, label: 0 }, { riddim: 10 });
    expect(problems.some((p) => p.includes('duplicate'))).toBe(true);
    expect(problems.some((p) => p.includes('not a riddim.love URL'))).toBe(true);
    expect(problems.some((p) => p.includes('label: no URLs'))).toBe(true);
    expect(problems.some((p) => p.includes('under 80%'))).toBe(true);
    expect(validateSet([{ name: 'cut.xml', xml: '<?xml version="1.0"?>\n<urlset>' }], {}, {})[0]).toContain('not a complete XML');
  });

  it('finds names that several pages share', () => {
    expect(duplicateNames(['Storm', 'storm', "Jammy's", 'Jammys', 'Solo'])).toEqual(['storm', 'jammys']);
  });
});
