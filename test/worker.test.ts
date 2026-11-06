import { describe, expect, it } from 'vitest';
import { BadRequest, onlyParams, parseCursor, parseEnum, parseId, parseQuery, TUNE_SORTS } from '../worker/validate';
import * as P from '../worker/project';

describe('validate', () => {
  it('ids', () => {
    expect(parseId('18')).toBe(18);
    for (const bad of ['0', '-1', 'abc', '1e3', '../x', '1234567890']) expect(() => parseId(bad)).toThrow(BadRequest);
  });
  it('query length 2..100, whitespace collapsed', () => {
    expect(parseQuery('  sleng   teng ')).toBe('sleng teng');
    expect(() => parseQuery('a')).toThrow(BadRequest);
    expect(() => parseQuery('x'.repeat(101))).toThrow(BadRequest);
  });
  it('cursor charset', () => {
    expect(parseCursor('eyJzIjoiLXR1bmVzIi')).toBe('eyJzIjoiLXR1bmVzIi');
    expect(parseCursor(null)).toBeNull();
    expect(() => parseCursor('a/b?c')).toThrow(BadRequest);
  });
  it('enum and unknown params', () => {
    expect(parseEnum('-year', TUNE_SORTS)).toBe('-year');
    expect(() => parseEnum('artist', TUNE_SORTS)).toThrow(BadRequest);
    expect(() => onlyParams(new URLSearchParams('q=x&url=http://evil'), ['q'])).toThrow(BadRequest);
  });
});

describe('project (real response shapes, 2026-11-06)', () => {
  const rawTune = {
    id: 759, title: 'Under Mi Sleng Teng', year: 1985, is_original: true,
    artists: [{ id: 263, name: 'Wayne Smith', url: 'https://riddim-id.com/artists/263/wayne-smith', api_url: 'x' }],
    producers: [{ id: 1732, name: 'Prince Jammy', url: 'https://riddim-id.com/producers/1732/prince-jammy', api_url: 'x' }],
    riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng', api_url: 'x', version_of: null },
    label: { id: 61, name: "Jammy's", url: 'https://riddim-id.com/labels/61/jammys', api_url: 'x' },
    created_at: null, updated_at: null,
  };
  it('tune', () => {
    expect(P.tune(rawTune)).toEqual({
      id: 759, title: 'Under Mi Sleng Teng', year: 1985, is_original: true,
      artists: [{ id: 263, name: 'Wayne Smith', url: 'https://riddim-id.com/artists/263/wayne-smith' }],
      producers: [{ id: 1732, name: 'Prince Jammy', url: 'https://riddim-id.com/producers/1732/prince-jammy' }],
      riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng', version_of: null },
      label: { id: 61, name: "Jammy's", url: 'https://riddim-id.com/labels/61/jammys' },
    });
  });
  it('tolerates missing/odd fields and drops non riddim-id urls', () => {
    const t = P.tune({ id: 1, title: 'X', artists: [{ id: 2, name: 'A', url: 'javascript:alert(1)' }], riddim: null, label: null });
    expect(t?.artists[0].url).toBeNull();
    expect(t?.year).toBeNull();
    expect(P.tune({ title: 'no id' })).toBeNull();
  });
  it('search hits', () => {
    expect(P.nameHit({ type: 'riddim', id: 2343, name: 'Sleng Teng Refuelled', url: 'https://riddim-id.com/riddims/2343/sleng-teng-refuelled', year: 2009, is_version: true, version_of: 'Sleng Teng', matched_name: null })?.version_of).toBe('Sleng Teng');
    expect(P.nameHit({ type: 'engineer', id: 1, name: 'x', url: null })).toBeNull();
    expect(P.tuneHit({ type: 'tune', id: 672, name: 'Pumpkin Belly', url: null, year: 1985, artists: [{ id: 310, name: 'Tenor Saw', url: 'https://riddim-id.com/artists/310/tenor-saw' }], riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng' } })).toEqual({
      id: 672, title: 'Pumpkin Belly', year: 1985,
      artists: [{ id: 310, name: 'Tenor Saw', url: 'https://riddim-id.com/artists/310/tenor-saw' }],
      riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng', version_of: null },
    });
  });
});
