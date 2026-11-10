// Explanatory text and notices in English or Japanese. Only notes, hints and
// messages change; tabs, buttons, data, <title>s and the server-rendered HTML
// stay English (the words selectors share, and one page for search engines).
//
// Language: a choice saved in this browser (footer "English / 日本語"), else
// the browser's first preferred language ("ja…" → Japanese), else English.
// A string missing in Japanese falls back to English.

export type Lang = 'en' | 'ja';
export const LANG_KEY = 'riddim.love:lang';

/** Saved choice first, then the browser's first preferred language. */
export function pickLang(saved: string | null | undefined, preferred: readonly string[]): Lang {
  if (saved === 'en' || saved === 'ja') return saved;
  return /^ja\b/i.test(preferred[0] ?? '') ? 'ja' : 'en';
}

type TypeKey = 'riddim' | 'tune' | 'artist' | 'label' | 'producer';
/** Shown inside sentences (Japanese keeps the English type words, as on the tabs). */
const TYPE_PLURAL: Record<TypeKey, string> = { riddim: 'riddims', tune: 'tunes', artist: 'artists', label: 'labels', producer: 'producers' };
const TYPE_NAME: Record<TypeKey, string> = { riddim: 'Riddim', tune: 'Tune', artist: 'Artist', label: 'Label', producer: 'Producer' };

const en = {
  placeholder: {
    riddim: 'Riddim name, e.g. Sleng Teng',
    tune: 'Title or Artist - Title',
    artist: 'Artist name, e.g. Tenor Saw',
    label: 'Label name, e.g. Jammys',
    producer: 'Producer name, e.g. King Jammy',
  } as Record<TypeKey, string>,
  /** Home hint; the two keys are shown as <kbd>. */
  hint: ['Pick what to search, type, press ', 'Enter', '. ', '/', ' jumps to search. Typos are OK.'],
  minChars: 'Type at least 2 characters.',
  /** Search result count. */
  count: (type: TypeKey, n: number, limit: number): string => {
    const noun = type === 'tune' ? 'title matches' : TYPE_PLURAL[type];
    const head = n >= limit ? `Top ${limit} ${noun} (search returns at most ${limit}). Refine the search to narrow it down.` : `${n} ${n === 1 ? noun.replace(/s$/, '').replace(/matche$/, 'match') : noun}.`;
    return head + (type === 'tune' ? ' Searching tune titles only. Click a column to sort.' : ' Open one to see all its tunes.');
  },
  noMatch: (type: TypeKey, q: string): string => (type === 'tune' ? `No tune titles match “${q}”.` : `No ${TYPE_PLURAL[type]} match “${q}”.`),
  noMatchTip: {
    riddim: 'Try another spelling or fewer words. Riddim names often drop the word “Riddim”.',
    tune: 'Tune search looks at titles. “Artist - Title” or “Artist Title” also works (beta), or switch to Artist.',
    artist: 'Try another spelling, or the artist’s best-known name.',
    label: 'Try another spelling, or the label’s short name.',
    producer: 'Try another spelling, or the name the producer is credited under (e.g. Prince Jammy / King Jammy).',
  } as Record<TypeKey, string>,
  noArtistEither: (name: string): string => `No artist page is named “${name}” either. Check the spelling, or search the title alone.`,
  didYouMean: 'Did you mean:',
  editSearch: 'Edit search',
  filter: (labelPage: boolean): string => (labelPage ? 'Filter by artist or title' : 'Filter by artist, title or label'),
  noFilterMatch: 'No tunes match this filter.',
  loadingAll: (held: number, total: number | null): string => `loading all tunes… ${held}${total != null ? `/${total}` : ''}`,
  loadFailed: 'could not load every tune — try again',
  appNote: 'Opens the app? The search is copied when you tap — paste it into the app’s search.',
  /** Empty Want list; the star is shown between the two parts. */
  wantEmpty: ['Nothing here yet. Press ', ' Want on any tune to keep it here.'],
  digEmpty: 'Nothing here yet. Searches you open from Dig are kept here.',
  savedCount: (n: number, newestFirst: boolean): string =>
    n ? `${n} tune${n === 1 ? '' : 's'}${newestFirst ? ' · last searched first' : ''} · saved in this browser only` : 'Saved in this browser only',
  clearConfirm: 'Clear the whole Dig history? Your Want list stays as it is.',
  cannotSave: 'Could not save: this browser blocks site storage',
  somethingWrong: 'Something went wrong.',
  network: 'Network error. Check your connection and try again.',
  tryAgain: 'Try again',
  /** Tag on the row of the tune last opened (its page, or YouTube / Listen / Dig). */
  lastOpened: 'Last opened',
};

export type Strings = typeof en;

const ja: Partial<Strings> = {
  placeholder: {
    riddim: 'Riddim 名（例：Sleng Teng）',
    tune: '曲名、または アーティスト - 曲名',
    artist: 'アーティスト名（例：Tenor Saw）',
    label: 'レーベル名（例：Jammys）',
    producer: 'プロデューサー名（例：King Jammy）',
  },
  hint: ['検索する種類を選んで入力し、', 'Enter', ' で検索。', '/', ' キーで検索欄へ。多少のスペルミスも大丈夫です。'],
  minChars: '2 文字以上入力してください。',
  count: (type, n, limit) => {
    const head = n >= limit ? `上位 ${limit} 件です（検索は最大 ${limit} 件まで）。言葉を足して絞り込んでください。` : type === 'tune' ? `${n} 件の曲名が一致。` : `${n} 件の ${TYPE_NAME[type]}。`;
    return head + (type === 'tune' ? '曲名だけを検索しています。列見出しで並べ替えできます。' : '開くと全曲を表示します。');
  },
  noMatch: (type, q) => (type === 'tune' ? `「${q}」に一致する曲名はありません。` : `「${q}」に一致する ${TYPE_NAME[type]} はありません。`),
  noMatchTip: {
    riddim: '別のつづりや、少ない語で試してください。Riddim 名には「Riddim」が付かないことが多いです。',
    tune: '曲名を検索します。「アーティスト - 曲名」「アーティスト 曲名」でも探せます（β）。Artist に切り替えるのも手です。',
    artist: '別のつづりや、よく知られた名前で試してください。',
    label: '別のつづりや、よく知られた名前で試してください。',
    producer: '別のつづりや、クレジットされている名前（例：Prince Jammy / King Jammy）で試してください。',
  },
  noArtistEither: (name) => `「${name}」というアーティストも見つかりません。つづりを確認するか、曲名だけで検索してください。`,
  didYouMean: 'もしかして：',
  editSearch: '検索をやり直す',
  filter: (labelPage) => (labelPage ? 'アーティスト・曲名で絞り込み' : 'アーティスト・曲名・レーベルで絞り込み'),
  noFilterMatch: '条件に合う曲はありません。',
  loadingAll: (held, total) => `全曲を読み込み中… ${held}${total != null ? `/${total}` : ''}`,
  loadFailed: '一部を読み込めませんでした（再試行してください）',
  appNote: 'アプリが開いたら：タップした時点で検索語をコピーしています。アプリの検索欄に貼り付けてください。',
  wantEmpty: ['まだありません。曲の ', ' を押すとここに保存されます。'],
  digEmpty: 'まだありません。Dig から検索した曲がここに残ります。',
  savedCount: (n, newestFirst) => (n ? `${n} 曲${newestFirst ? ' · 新しい順' : ''} · このブラウザにだけ保存` : 'このブラウザにだけ保存'),
  clearConfirm: 'Dig 履歴をすべて消しますか？ Want はそのまま残ります。',
  cannotSave: '保存できません：このブラウザはサイトの保存を許可していません',
  somethingWrong: '問題が発生しました。',
  network: '通信エラーです。接続を確認してもう一度お試しください。',
  tryAgain: '再試行',
  lastOpened: '最後に開いた曲',
};

/** The strings for a language; anything not translated comes from English. */
export function stringsFor(lang: Lang): Strings {
  return lang === 'ja' ? { ...en, ...ja } : en;
}
