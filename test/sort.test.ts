import { describe, expect, it } from 'vitest';
import { sortByLabelArtistTitle } from '../shared/sort';

const r = (id: number, label: string | null, artist: string, title: string) => ({
  id,
  title,
  artists: artist ? [{ id, name: artist, url: null }] : [],
  label: label === null ? null : { id, name: label, url: null },
});
const ids = (rows: { id: number }[]) => rows.map((x) => x.id);

describe('sortByLabelArtistTitle', () => {
  it('orders by label, then artist, then title', () => {
    const rows = [r(1, 'Jammys', 'Wayne Smith', 'B'), r(2, 'Greensleeves', 'Tenor Saw', 'A'), r(3, 'Jammys', 'Wayne Smith', 'A'), r(4, 'Jammys', 'Anthony Red Rose', 'Z')];
    expect(ids(sortByLabelArtistTitle(rows))).toEqual([2, 4, 3, 1]);
  });
  it('ignores case', () => {
    expect(ids(sortByLabelArtistTitle([r(1, 'jammys', 'b', 't'), r(2, 'Jammys', 'A', 't')]))).toEqual([2, 1]);
  });
  it('puts missing or blank labels last', () => {
    const rows = [r(1, null, 'A', 'a'), r(2, 'Z Label', 'Z', 'z'), r(3, '  ', 'A', 'a'), r(4, 'A Label', 'Z', 'z')];
    expect(ids(sortByLabelArtistTitle(rows))).toEqual([4, 2, 1, 3]);
  });
  it('is stable for equal keys and does not mutate input', () => {
    const rows = [r(1, 'L', 'A', 'T'), r(2, 'L', 'a', 't'), r(3, 'L', 'A', 'T')];
    const copy = [...rows];
    expect(ids(sortByLabelArtistTitle(rows))).toEqual([1, 2, 3]);
    expect(rows).toEqual(copy);
  });
  it('handles Japanese and accents via Intl.Collator', () => {
    const out = ids(sortByLabelArtistTitle([r(1, 'L', 'éclair', 't'), r(2, 'L', 'Eclair', 'a'), r(3, 'L', 'ミighty', 't')]));
    expect(out.slice(0, 2)).toEqual([2, 1]);
    expect(out).toContain(3);
  });
});
