import { describe, expect, it } from 'vitest';
import { copyText, displayText, riddimTerm, youtubeQuery, youtubeUrl } from '../shared/format';

const ws = [{ id: 263, name: 'Wayne Smith', url: null }];
const t = { artists: ws, title: 'Under Mi Sleng Teng', riddim: { id: 18, name: 'Sleng Teng', url: null }, label: { id: 61, name: "Jammy's", url: null } };

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
  it('youtube query toggles riddim and label independently', () => {
    expect(youtubeQuery(t, { riddim: false, label: false })).toBe('Wayne Smith Under Mi Sleng Teng');
    expect(youtubeQuery(t, { riddim: true, label: false })).toBe('Wayne Smith Under Mi Sleng Teng Sleng Teng Riddim');
    expect(youtubeQuery(t, { riddim: false, label: true })).toBe("Wayne Smith Under Mi Sleng Teng Jammy's");
    expect(youtubeQuery(t, { riddim: true, label: true })).toBe("Wayne Smith Under Mi Sleng Teng Sleng Teng Riddim Jammy's");
    expect(youtubeQuery({ ...t, label: null }, { riddim: false, label: true })).toBe('Wayne Smith Under Mi Sleng Teng');
  });
  it('does not double the word riddim', () => {
    expect(riddimTerm('Real Rock Riddim')).toBe('Real Rock Riddim');
  });
  it('youtube url is encoded', () => {
    expect(youtubeUrl('A & B #1 / ?x')).toBe('https://www.youtube.com/results?search_query=A%20%26%20B%20%231%20%2F%20%3Fx');
  });
});
