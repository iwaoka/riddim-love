import { describe, expect, it } from 'vitest';
import { altNames, originalTuneText, pagePath, parsePagePath, refPath, riddimMeta, riddimName, slugFromUrl, slugify, tuneMeta, tunePath } from '../shared/seo';
import type { Tune } from '../shared/types';

const tune: Tune = {
  id: 759,
  title: 'Under Mi Sleng Teng',
  year: 1985,
  is_original: true,
  artists: [{ id: 263, name: 'Wayne Smith', url: 'https://riddim-id.com/artists/263/wayne-smith' }],
  producers: [{ id: 1732, name: 'Prince Jammy', url: 'https://riddim-id.com/producers/1732/prince-jammy' }],
  riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng', version_of: null },
  label: { id: 61, name: "Jammy's", url: 'https://riddim-id.com/labels/61/jammys' },
};

describe('slugs and paths', () => {
  it('slugify', () => {
    expect(slugify('Under Mi Sleng Teng')).toBe('under-mi-sleng-teng');
    expect(slugify("Jammy's A Shine (Version)")).toBe('jammy-s-a-shine-version');
    expect(slugify('Éclair & Dub')).toBe('eclair-and-dub');
    expect(slugify('レゲエ')).toBe('');
  });
  it('slug from riddim-id url', () => {
    expect(slugFromUrl('https://riddim-id.com/riddims/18/sleng-teng')).toBe('sleng-teng');
    expect(slugFromUrl('https://riddim-id.com/riddims/18')).toBe('');
    expect(slugFromUrl(null)).toBe('');
  });
  it('paths', () => {
    expect(pagePath('riddim', 18, 'sleng-teng')).toBe('/riddim/18/sleng-teng');
    expect(refPath('label', tune.label!)).toBe('/label/61/jammys');
    expect(tunePath(tune)).toBe('/tune/759/under-mi-sleng-teng');
    expect(pagePath('tune', 5)).toBe('/tune/5');
  });
  it('parsePagePath', () => {
    expect(parsePagePath('/riddim/18/sleng-teng')).toEqual({ kind: 'riddim', id: 18, slug: 'sleng-teng' });
    expect(parsePagePath('/artist/263')).toEqual({ kind: 'artist', id: 263, slug: '' });
    expect(parsePagePath('/tune/759/x/')).toEqual({ kind: 'tune', id: 759, slug: 'x' });
    for (const bad of ['/riddim/0', '/riddim/abc', '/riddims/18', '/riddim/18/a/b', '/engineer/1']) expect(parsePagePath(bad)).toBeNull();
  });
});

describe('page meta', () => {
  it('riddim name', () => {
    expect(riddimName('Sleng Teng')).toBe('Sleng Teng Riddim');
    expect(riddimName('Real Rock Riddim')).toBe('Real Rock Riddim');
  });
  it('riddim title/description/h1', () => {
    const m = riddimMeta({ name: 'Sleng Teng' }, 313, [tune]);
    expect(m.title).toBe('Sleng Teng Riddim – 313 Tunes | RIDDIM.LOVE');
    expect(m.description).not.toMatch(/1985|King Jammy/);
    expect(m.h1).toBe('Sleng Teng Riddim');
    expect(m.description).toContain('Wayne Smith – Under Mi Sleng Teng');
    expect(m.description.length).toBeLessThanOrEqual(158);
  });
  it('tune title', () => {
    expect(tuneMeta(tune).title).toBe('Wayne Smith – Under Mi Sleng Teng (Sleng Teng Riddim, 1985) | RIDDIM.LOVE');
    expect(tuneMeta(tune).description).toBe("Wayne Smith – Under Mi Sleng Teng (1985), on the Sleng Teng Riddim, released on Jammy's, produced by Prince Jammy.");
  });
});

describe('riddim head', () => {
  it('original tune: the year is the tune’s, shown only when known', () => {
    const artists = [{ id: 263, name: 'Wayne Smith', url: null }];
    expect(originalTuneText({ artists, title: 'Under Mi Sleng Teng', year: 1985 })).toBe('Wayne Smith – Under Mi Sleng Teng (1985)');
    expect(originalTuneText({ artists, title: 'X', year: null })).toBe('Wayne Smith – X');
    expect(originalTuneText({ artists: [], title: 'Dub', year: null })).toBe('Dub');
  });

  it('alternate names: no repeat of the riddim name, no duplicates, capped', () => {
    expect(altNames('Sleng Teng', ['Sleng Teng Riddim', 'sleng teng', 'Under Mi Sleng Teng'])).toEqual({ shown: ['Under Mi Sleng Teng'], more: 0 });
    expect(altNames('Heavenless', ['Live Blanket', 'live blanket', 'Lìve Blanket'])).toEqual({ shown: ['Live Blanket'], more: 0 });
    expect(altNames('A', ['B', 'C', 'D', 'E', 'F', 'G', 'H'])).toEqual({ shown: ['B', 'C', 'D', 'E', 'F'], more: 2 });
    expect(altNames('A', [' ', 'Riddim'])).toEqual({ shown: [], more: 0 });
  });
});
