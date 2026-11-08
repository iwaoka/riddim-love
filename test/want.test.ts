import { describe, expect, it } from 'vitest';
import { parseWant, toWantItem, WANT_MAX, wantLine, wantText } from '../shared/want';

const tune = {
  id: 759, title: 'Under Mi Sleng Teng', year: 1985, is_original: true,
  artists: [{ id: 263, name: 'Wayne Smith', url: 'https://riddim-id.com/artists/263/wayne-smith' }],
  riddim: { id: 18, name: 'Sleng Teng', url: 'https://riddim-id.com/riddims/18/sleng-teng', version_of: null },
  label: { id: 61, name: "Jammy's", url: 'https://riddim-id.com/labels/61/jammys' },
};

describe('want list', () => {
  it('keeps only the fields the list shows', () => {
    expect(toWantItem(tune, 5)).toEqual({
      id: 759, title: 'Under Mi Sleng Teng', year: 1985,
      artists: [{ id: 263, name: 'Wayne Smith' }],
      riddim: { id: 18, name: 'Sleng Teng' },
      label: { id: 61, name: "Jammy's" },
      added: 5,
    });
  });

  it('memo lines', () => {
    expect(wantLine(toWantItem(tune))).toBe("Wayne Smith - Under Mi Sleng Teng (Sleng Teng Riddim, Jammy's, 1985)");
    const bare = toWantItem({ id: 1, title: 'Dub', year: null, artists: [], riddim: null, label: null });
    expect(wantLine(bare)).toBe('Dub');
    const two = toWantItem({ ...tune, artists: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], label: null, year: null });
    expect(wantLine(two)).toBe('A & B - Under Mi Sleng Teng (Sleng Teng Riddim)');
    expect(wantText([toWantItem(tune), bare])).toBe(wantLine(toWantItem(tune)) + '\nDub');
  });

  it('round-trips and drops broken or duplicate entries', () => {
    const item = toWantItem(tune, 1);
    expect(parseWant(JSON.stringify([item]))).toEqual([item]);
    expect(parseWant(null)).toEqual([]);
    expect(parseWant('{not json')).toEqual([]);
    expect(parseWant('{"a":1}')).toEqual([]);
    const junk = [item, item, { id: 'x', title: 'bad' }, { id: 2, title: 'no artists' }, { ...item, id: 3, riddim: { id: 0, name: 'x' }, added: 'later' }];
    const out = parseWant(JSON.stringify(junk));
    expect(out.map((w) => w.id)).toEqual([759, 3]);
    expect(out[1].riddim).toBeNull();
    expect(out[1].added).toBe(0);
  });

  it('caps the list', () => {
    const many = Array.from({ length: WANT_MAX + 5 }, (_, i) => ({ ...toWantItem(tune), id: i + 1 }));
    expect(parseWant(JSON.stringify(many))).toHaveLength(WANT_MAX);
  });
});
