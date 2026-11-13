// OGP card template (1200×630) for RIDDIM.LOVE, rendered with satori (layout →
// SVG) and resvg (SVG → PNG). The face of the page, not a data card: the logo,
// the page kind, the page's own title, a short red line and "riddim.love".
// Nothing else (no counts, no original tune, no descriptions).
//
//   [♥R] RIDDIM.LOVE                            RIDDIM
//
//   SLENG TENG
//   ────
//
//   riddim.love
//
// The title is laid out here, from the real advance widths of the glyphs that
// will be drawn (scripts/og/fonts.mjs): the largest size that fits two lines
// without breaking a word, then a smaller size on three lines, and only for
// extreme titles a break inside a word. Each line is then drawn as is.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { fontsFor, measure } from './fonts.mjs';
import { OG_TEMPLATE_VERSION, ogTitle } from '../../shared/og.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = 1200;
const H = 630;
const PAD = { top: 64, right: 80, bottom: 58, left: 80 };
const CONTENT_W = W - PAD.left - PAD.right; // 1040
/** Bump OG_TEMPLATE_VERSION (shared/og.ts) with every design change: every card is redrawn. */
export const TEMPLATE_VERSION = OG_TEMPLATE_VERSION;

const C = { bg: '#fafaf8', ink: '#111111', red: '#d8283a', grey: '#5c6166', soft: '#7d8288' };

// The existing logo asset (public/icon-512.png), used as is — not redrawn.
const LOGO = `data:image/png;base64,${readFileSync(join(root, 'public', 'icon-512.png')).toString('base64')}`;

const TITLE = { weight: 800, lineHeight: 1.16, tracking: -0.015 };
/** Vertical room for the title (the image minus header, footer, red line and breathing space). */
const TITLE_MAX_H = 300;

const el = (type, style, ...children) => ({ type, props: { style, children: children.length <= 1 ? children[0] : children } });

// ---------- title layout ----------

// Japanese: kanji / hiragana may break between any two characters; a katakana
// word (with its ー) stays whole. Kinsoku: closing marks never start a line,
// opening marks never end one.
const KATA = /[\p{Script=Katakana}ー]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}　-〿＀-￯]/u;
const NO_START = /^[、。，．・：；？！ー〜～）」』】〕〉》"'’”)\]}!?,.:;-]/u;
const NO_END = /[（「『【〔〈《“‘(\[{]$/u;

/** Break points as tokens: { text, space } — `space`: a space precedes it. */
function tokens(text) {
  const raw = [];
  // Split at ordinary spaces only: U+00A0 holds an artist's name together.
  for (const m of text.matchAll(/([ \t\n]*)([^ \t\n]+)/gu)) {
    let space = m[1].length > 0;
    let buf = '';
    const push = () => {
      if (!buf) return;
      raw.push({ text: buf, space });
      buf = '';
      space = false;
    };
    for (const ch of m[2]) {
      const kata = KATA.test(ch);
      const prevKata = buf && KATA.test([...buf].pop());
      if (CJK.test(ch) || (kata && !prevKata) || (!kata && prevKata)) push();
      buf += ch;
      if (CJK.test(ch)) push();
    }
    push();
  }
  // Kinsoku: glue a token that may not start a line to the one before it,
  // and a token that may not end a line to the one after it. The " - " and " & " between
  // artist and title stays at the end of the first line.
  const out = [];
  for (const t of raw) {
    const prev = out[out.length - 1];
    if (prev && ((!t.space && NO_START.test(t.text)) || NO_END.test(prev.text) || /^[-–—&]$/.test(t.text))) prev.text += (t.space ? ' ' : '') + t.text;
    else out.push({ ...t });
  }
  return out;
}

/** Greedy line fill to `width`; null when one token is wider (unless `splitWords`). */
function wrap(toks, size, m, width, splitWords) {
  const w = (t) => measure(t, size, m);
  const lines = [];
  let line = '';
  for (const t of toks) {
    const next = line ? line + (t.space ? ' ' : '') + t.text : t.text;
    if (w(next) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (w(t.text) <= width) {
      line = t.text;
      continue;
    }
    if (!splitWords) return null;
    // Extreme case only: a word longer than the line is cut between characters.
    let part = '';
    for (const ch of t.text) {
      if (part && w(part + ch) > width) {
        lines.push(part);
        part = '';
      }
      part += ch;
    }
    line = part;
  }
  if (line) lines.push(line);
  return lines;
}

/** Same number of lines, as even as possible (no lone word on the last line). */
function balance(toks, size, m, lines) {
  if (lines.length < 2) return lines;
  let lo = CONTENT_W / lines.length;
  let hi = CONTENT_W;
  let best = lines;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const l = wrap(toks, size, m, mid, false);
    if (l && l.length === lines.length) {
      best = l;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

/**
 * The largest size (step 2 px) at which the title fits, trying in turn:
 * 2 lines of whole words; 3 lines of whole words; words cut between characters.
 * Never drops a character: an absurdly long title just gets smaller.
 */
export function layoutTitle(title, m, opts = {}) {
  // Names held together first; if that cannot fit, the same title with ordinary spaces.
  if (title.includes('\u00a0')) return layoutTitleWith(title, m, opts, true) ?? layoutTitleWith(title.replaceAll('\u00a0', ' '), m, opts, false);
  return layoutTitleWith(title, m, opts, false);
}

function layoutTitleWith(title, m, { max = 120, min2 = 56, min3 = 40, floor = 20 } = {}, grouped) {
  const toks = tokens(title);
  const fits = (lines, s) => lines.length * s * TITLE.lineHeight <= TITLE_MAX_H;
  const tryRange = (from, to, maxLines, split) => {
    for (let s = from; s >= to; s -= 2) {
      const lines = wrap(toks, s, m, CONTENT_W, split);
      if (lines && lines.length <= maxLines && fits(lines, s)) return { size: s, lines: split ? lines : balance(toks, s, m, lines) };
    }
    return null;
  };
  // A short title stays on one line if that costs at most a fifth of the size.
  const one = tryRange(max, Math.round(max * 0.8), 1, false);
  if (one) return one;
  // A little smaller (to 48 px) rather than an artist's name split over two lines.
  if (grouped) return tryRange(max, Math.min(min2, 48), 2, false);
  return (
    tryRange(max, min2, 2, false) ??
    tryRange(Math.min(max, min2), min3, 3, false) ??
    tryRange(Math.min(max, min2), floor, 2, true) ??
    tryRange(Math.min(max, min3), floor, Infinity, true) ?? { size: floor, lines: wrap(toks, floor, m, CONTENT_W, true) }
  );
}

// ---------- card ----------

/** card: { kind: 'RIDDIM' | 'TUNE' | … | '', title, sub? (TOP only), upper?, max? } */
export function cardTree(card, families, layout) {
  return el(
    'div',
    // satori adds padding to width / height (content-box): the box is the image minus the padding.
    {
      width: W - PAD.left - PAD.right, height: H - PAD.top - PAD.bottom, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      background: C.bg, paddingTop: PAD.top, paddingRight: PAD.right, paddingBottom: PAD.bottom, paddingLeft: PAD.left, fontFamily: families.join(', '), color: C.ink,
    },
    el(
      'div',
      { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      el(
        'div',
        { display: 'flex', alignItems: 'center' },
        { type: 'img', props: { src: LOGO, width: 58, height: 58, style: { marginRight: 14 } } },
        el('div', { fontSize: 34, fontWeight: 800, color: C.red, letterSpacing: '0.01em' }, 'RIDDIM.LOVE'),
      ),
      el('div', { fontSize: 26, fontWeight: 600, color: C.grey, letterSpacing: '0.08em' }, card.kind || ''),
    ),
    el(
      'div',
      { display: 'flex', flexDirection: 'column' },
      ...layout.lines.map((line) =>
        el('div', { display: 'flex', fontSize: layout.size, fontWeight: TITLE.weight, lineHeight: TITLE.lineHeight, letterSpacing: `${TITLE.tracking}em`, whiteSpace: 'pre' }, line),
      ),
      // TOP only: a subtitle under the title.
      ...(card.sub ? [el('div', { fontSize: 40, fontWeight: 500, color: C.grey, marginTop: 14, letterSpacing: '-0.005em' }, card.sub)] : []),
      el('div', { width: 190, height: 10, borderRadius: 5, background: C.red, marginTop: 30 }),
    ),
    el('div', { fontSize: 26, fontWeight: 600, color: C.soft }, 'riddim.love'),
  );
}

/** What is drawn: `text` (the title with names held together) or the title; upper case is display only. */
export const displayTitle = (card) => {
  const t = card.text ?? card.title;
  return card.upper === false ? t : t.toUpperCase();
};

/**
 * PNG for a card, or png: null with the characters no font has (the page then
 * keeps the common OGP image rather than showing broken boxes).
 */
export async function renderPng(card) {
  if (!card?.title?.trim()) return { png: null, missing: [], reason: 'no title' }; // API data missing: keep the common image
  const title = displayTitle(card);
  const { fonts, families, missing } = fontsFor(['RIDDIM.LOVE riddim.love', card.kind, title, card.sub].filter(Boolean).join(' '));
  if (missing.length) return { png: null, missing };
  const layout = layoutTitle(title, { fonts, families, weight: TITLE.weight, tracking: TITLE.tracking }, { max: card.max ?? 120 });
  const svg = await satori(cardTree(card, families, layout), { width: W, height: H, fonts });
  // satori already turned the text into paths: no system fonts to scan (that alone took ~0.6 s a card).
  return { png: new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: false } }).render().asPng(), missing: [], layout };
}

// ---------- page → card (the API's own names, unchanged) ----------

// The title of each card is ogTitle() (shared/og.ts), the same text the page's
// og:image hash is made of. For a tune, `text` is that title with each artist's
// name held together on one line (U+00A0 between its words; drawn as a space).
const held = (name) => name.replace(/ /g, '\u00a0');

export const cards = {
  home: () => ({ kind: '', title: 'Just find it.', sub: 'Go deeper into reggae.', upper: false, max: 132 }),
  riddim: (r) => ({ kind: 'RIDDIM', title: ogTitle('riddim', r) }),
  artist: (a) => ({ kind: 'ARTIST', title: ogTitle('artist', a) }),
  producer: (p) => ({ kind: 'PRODUCER', title: ogTitle('producer', p) }),
  label: (l) => ({ kind: 'LABEL', title: ogTitle('label', l) }),
  // "Artist - Title"; several artists in the API's order, joined with " & ".
  tune: (t) => {
    const title = ogTitle('tune', t);
    const artists = (t.artists ?? []).map((x) => ogTitle('artist', x)).filter(Boolean);
    const name = ogTitle('artist', { name: t.title });
    const text = artists.length && name ? `${artists.map(held).join(' & ')} - ${name}` : title;
    return { kind: 'TUNE', title, text, upper: false, max: 104 };
  },
};
