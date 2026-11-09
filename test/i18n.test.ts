import { describe, expect, it } from 'vitest';
import { pickLang, stringsFor } from '../shared/i18n';

describe('language for notes and hints', () => {
  it('a saved choice wins; else the browser’s first language; else English', () => {
    expect(pickLang('ja', ['en-US'])).toBe('ja');
    expect(pickLang('en', ['ja-JP'])).toBe('en');
    expect(pickLang(null, ['ja-JP', 'en'])).toBe('ja');
    expect(pickLang(null, ['ja'])).toBe('ja');
    expect(pickLang(null, ['en-GB', 'ja'])).toBe('en'); // only the first preference counts
    expect(pickLang('fr', ['jam'])).toBe('en'); // unknown saved value ignored; "jam" is not Japanese
    expect(pickLang(undefined, [])).toBe('en');
  });

  it('every English string has a Japanese one', () => {
    const en = stringsFor('en');
    const ja = stringsFor('ja');
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ja[k], k).not.toBe(en[k]);
  });

  it('Japanese texts agreed for the notes', () => {
    const ja = stringsFor('ja');
    expect(ja.digEmpty).toBe('まだありません。Dig から検索した曲がここに残ります。');
    expect(ja.appNote).toBe('アプリが開いたら：タップした時点で検索語をコピーしています。アプリの検索欄に貼り付けてください。');
    expect(ja.savedCount(3, true)).toBe('3 曲 · 新しい順 · このブラウザにだけ保存');
    expect(ja.savedCount(0, false)).toBe('このブラウザにだけ保存');
    expect(ja.count('riddim', 12, 50)).toBe('12 件の Riddim。開くと全曲を表示します。');
    expect(ja.count('artist', 50, 50)).toBe('上位 50 件です（検索は最大 50 件まで）。言葉を足して絞り込んでください。開くと全曲を表示します。');
    expect(ja.noMatch('tune', 'xyz')).toBe('「xyz」に一致する曲名はありません。');
  });

  it('English keeps today’s wording', () => {
    const en = stringsFor('en');
    expect(en.count('riddim', 12, 50)).toBe('12 riddims. Open one to see all its tunes.');
    expect(en.count('riddim', 1, 50)).toBe('1 riddim. Open one to see all its tunes.');
    expect(en.count('tune', 1, 50)).toBe('1 title match. Searching tune titles only. Click a column to sort.');
    expect(en.count('tune', 50, 50)).toBe('Top 50 title matches (search returns at most 50). Refine the search to narrow it down. Searching tune titles only. Click a column to sort.');
    expect(en.savedCount(1, false)).toBe('1 tune · saved in this browser only');
    expect(en.noMatch('label', 'x')).toBe('No labels match “x”.');
  });
});
