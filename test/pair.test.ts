import { describe, expect, it } from 'vitest';
import { sameName, splitArtistTitle, splitByArtistPrefix } from '../shared/pair';

describe('splitArtistTitle', () => {
  it('splits the Copy format', () => {
    expect(splitArtistTitle('Wayne Smith - Under Mi Sleng Teng')).toEqual({ artist: 'Wayne Smith', primary: 'Wayne Smith', title: 'Under Mi Sleng Teng' });
  });
  it('accepts en / em dashes and tabs', () => {
    expect(splitArtistTitle('Wayne Smith – Under Mi Sleng Teng')?.title).toBe('Under Mi Sleng Teng');
    expect(splitArtistTitle('Wayne Smith — Under Mi Sleng Teng')?.artist).toBe('Wayne Smith');
    expect(splitArtistTitle('Wayne Smith\tUnder Mi Sleng Teng')?.title).toBe('Under Mi Sleng Teng');
  });
  it('splits at the first separator only', () => {
    expect(splitArtistTitle('Tenor Saw - Ring The Alarm - Remix')?.title).toBe('Ring The Alarm - Remix');
  });
  it('uses the first artist of several for the lookup', () => {
    expect(splitArtistTitle('Tenor Saw & Buju Banton - Ring The Alarm Quick')?.primary).toBe('Tenor Saw');
    expect(splitArtistTitle('Sean Paul feat. Sasha - I\'m Still In Love')?.primary).toBe('Sean Paul');
    expect(splitArtistTitle('Beenie Man, Mr. Vegas - Bad Man')?.primary).toBe('Beenie Man');
  });
  it('leaves plain titles and hyphenated words alone', () => {
    expect(splitArtistTitle('Under Mi Sleng Teng')).toBeNull();
    expect(splitArtistTitle('Ring-A-Ling')).toBeNull();
    expect(splitArtistTitle(' - Title')).toBeNull();
    expect(splitArtistTitle('Artist - ')).toBeNull();
  });
});

describe('sameName', () => {
  it('ignores case, accents and apostrophes', () => {
    expect(sameName('wayne smith', 'Wayne Smith')).toBe(true);
    expect(sameName('Jammys', "Jammy's")).toBe(true);
    expect(sameName('Wayne Smith', 'Wayne Smith Jr')).toBe(false);
    expect(sameName('Wayne Smith', null)).toBe(false);
  });
});

describe('splitByArtistPrefix', () => {
  const hits = [{ name: 'Tenor' }, { name: 'Tenor Saw' }, { name: 'Tenor Cat' }, { name: 'Wayne Smith' }, { name: 'Super Cat' }, { name: 'Sizzla', matched_name: 'Sizzla Kalonji' }];
  it('takes the longest artist name the query starts with', () => {
    expect(splitByArtistPrefix('Tenor Saw Ring The Alarm', hits)).toEqual({ name: 'Tenor Saw', title: 'Ring The Alarm' });
    expect(splitByArtistPrefix('wayne smith under mi sleng teng', hits)).toEqual({ name: 'Wayne Smith', title: 'under mi sleng teng' });
  });
  it('matches aliases but returns the main name', () => {
    expect(splitByArtistPrefix('Sizzla Kalonji Black Woman And Child', hits)).toEqual({ name: 'Sizzla', title: 'Black Woman And Child' });
  });
  it('needs a whole-word prefix and something left for the title', () => {
    expect(splitByArtistPrefix('Tenors Saw Ring', hits)).toBeNull();
    expect(splitByArtistPrefix('Tenor Saw', hits)).toEqual({ name: 'Tenor', title: 'Saw' }); // then filtered on that page
    expect(splitByArtistPrefix('Super Cat', [{ name: 'Super Cat' }])).toBeNull();
    expect(splitByArtistPrefix('Ring The Alarm Tenor Saw', hits)).toBeNull();
  });
});
