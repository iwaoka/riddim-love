import { describe, expect, it } from 'vitest';
import { formatSort, parseSort, sortByLabelArtistTitle, sortRows } from '../shared/sort';

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

describe('sortRows (column sort)', () => {
  const row = (id: number, artist: string, title: string, riddim: string | null, label: string | null, year: number | null) => ({
    id, title, year,
    artists: artist ? [{ id, name: artist, url: null }] : [],
    riddim: riddim === null ? null : { id, name: riddim, url: null },
    label: label === null ? null : { id, name: label, url: null },
  });
  const rows = [
    row(1, 'Tenor Saw', 'Pumpkin Belly', 'Sleng Teng', 'Jammys', 1985),
    row(2, 'anthony red rose', 'Tempo', 'Tempo', null, 1985),
    row(3, 'Wayne Smith', 'Under Mi Sleng Teng', 'Sleng Teng', 'Jammys', null),
    row(4, 'Cocoa Tea', 'Rocking Dolly', 'Rockfort Rock', 'Greensleeves', 1991),
  ];
  const ids = (r: { id: number }[]) => r.map((x) => x.id);

  it('artist asc / desc, case-insensitive', () => {
    expect(ids(sortRows(rows, 'artist', 'asc'))).toEqual([2, 4, 1, 3]);
    expect(ids(sortRows(rows, 'artist', 'desc'))).toEqual([3, 1, 4, 2]);
  });
  it('title', () => {
    expect(ids(sortRows(rows, 'title'))).toEqual([1, 4, 2, 3]);
  });
  it('riddim, ties broken by label → artist → title', () => {
    expect(ids(sortRows(rows, 'riddim'))).toEqual([4, 1, 3, 2]);
  });
  it('label: blanks last in both directions', () => {
    expect(ids(sortRows(rows, 'label', 'asc'))).toEqual([4, 1, 3, 2]);
    expect(ids(sortRows(rows, 'label', 'desc'))).toEqual([1, 3, 4, 2]);
  });
  it('year numeric; unknown year last in both directions', () => {
    expect(ids(sortRows(rows, 'year', 'asc'))).toEqual([1, 2, 4, 3]); // 1985 tie → label (blank last)
    expect(ids(sortRows(rows, 'year', 'desc'))).toEqual([4, 1, 2, 3]);
  });
});

describe('sort in the URL', () => {
  it('round-trips and rejects unknown values', () => {
    expect(formatSort({ key: 'year', dir: 'desc' })).toBe('-year');
    expect(formatSort({ key: 'artist', dir: 'asc' })).toBe('artist');
    expect(formatSort(null)).toBeNull();
    expect(parseSort('-year')).toEqual({ key: 'year', dir: 'desc' });
    expect(parseSort('label')).toEqual({ key: 'label', dir: 'asc' });
    for (const bad of [null, '', '-', 'bpm', '--year', 'Year']) expect(parseSort(bad)).toBeNull();
  });
});
