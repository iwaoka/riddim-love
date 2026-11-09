import { describe, expect, it } from 'vitest';
import { DIG_KEY, DIG_MAX, parseDig, parseWant, recordDig, removeDig, toWantItem, WANT_MAX, wantLine, wantText } from '../shared/want';

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

describe('dig history', () => {
  const other = { ...tune, id: 760, title: 'Under Mi Sleng Teng' }; // same artist + title, another tune id

  it('one entry per tune id: a repeat search moves it to the top with the new time and shop', () => {
    let list = recordDig([], tune, 'discogs', 100);
    list = recordDig(list, other, 'ebay', 200);
    expect(list.map((d) => [d.id, d.dug, d.service])).toEqual([[760, 200, 'ebay'], [759, 100, 'discogs']]);
    list = recordDig(list, tune, 'mercari', 300);
    expect(list.map((d) => [d.id, d.dug, d.service])).toEqual([[759, 300, 'mercari'], [760, 200, 'ebay']]);
    expect(list[0]).toMatchObject({ title: 'Under Mi Sleng Teng', label: { id: 61, name: "Jammy's" }, riddim: { id: 18, name: 'Sleng Teng' } });
    expect('added' in list[0]).toBe(false);
  });

  it('removes one tune, caps the history, and reads back newest first', () => {
    let list = recordDig([], tune, 'discogs', 1);
    list = recordDig(list, other, 'ebay', 2);
    expect(removeDig(list, 759).map((d) => d.id)).toEqual([760]);
    const many = Array.from({ length: DIG_MAX + 3 }, (_, i) => ({ ...tune, id: i + 1 })).reduce((l, t, i) => recordDig(l, t, 'discogs', i), [] as ReturnType<typeof parseDig>);
    expect(many).toHaveLength(DIG_MAX);
    expect(many[0].id).toBe(DIG_MAX + 3);
    const stored = JSON.stringify([{ ...list[1] }, { ...list[0] }, { id: 'bad' }, { ...list[0], service: 'Bad Service!' }]);
    expect(parseDig(stored).map((d) => [d.id, d.service])).toEqual([[760, 'ebay'], [759, 'discogs']]);
    expect(parseDig('nope')).toEqual([]);
  });

  it('never reads the Want key, and Want data still reads as before', () => {
    expect(DIG_KEY).not.toBe('riddim.love:want');
    const w = toWantItem(tune, 5);
    expect(parseWant(JSON.stringify([w]))).toEqual([w]);
  });
});
