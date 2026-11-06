import { describe, expect, it } from 'vitest';
import { filterWords, fold, matches } from '../shared/filter';

const row = (artist: string, title: string, label: string | null) => ({
  artists: artist ? [{ id: 1, name: artist, url: null }] : [],
  title,
  label: label ? { id: 2, name: label, url: null } : null,
});
const ok = (r: ReturnType<typeof row>, q: string) => matches(r, filterWords(q));

describe('list filter (Artist / Title / Label)', () => {
  const pumpkin = row('Tenor Saw', 'Pumpkin Belly', "Jammy's");
  it('matches artist, title or label', () => {
    expect(ok(pumpkin, 'tenor')).toBe(true);
    expect(ok(pumpkin, 'pumpkin')).toBe(true);
    expect(ok(pumpkin, 'jammy')).toBe(true);
  });
  it('is case-, accent- and apostrophe-insensitive', () => {
    expect(ok(pumpkin, 'JAMMYS')).toBe(true);
    expect(ok(row('Beyoncé', 'Déjà Vu', null), 'beyonce deja')).toBe(true);
  });
  it('needs every word (in any field)', () => {
    expect(ok(pumpkin, 'jammy tenor')).toBe(true);
    expect(ok(pumpkin, 'jammy wayne')).toBe(false);
  });
  it('empty query matches everything; missing label is fine', () => {
    expect(ok(pumpkin, '   ')).toBe(true);
    expect(ok(row('Wayne Smith', 'Under Mi Sleng Teng', null), 'jammy')).toBe(false);
  });
  it('fold', () => {
    expect(fold('  Éclair   Dub ')).toBe('eclair dub');
  });
});
