// Fonts for the OGP cards (all SIL Open Font License 1.1, via @fontsource):
//  - Inter: every card, always loaded (Latin, Latin Extended, Greek, Cyrillic, Vietnamese).
//  - Noto Sans JP, Noto Sans Symbols 2: fallbacks, loaded only for the
//    characters a card needs (they come split into many unicode-range files).
// A character no font covers is reported, so the caller can skip that card
// (the page then keeps the common OGP image) instead of drawing a "no glyph" box.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const nm = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '@fontsource');

/** One @font-face of a fontsource CSS file: its .woff file and unicode ranges. */
function faces(pkg, cssFile) {
  const css = readFileSync(join(nm, pkg, cssFile), 'utf8');
  const out = [];
  for (const block of css.split('@font-face').slice(1)) {
    const woff = /url\(\.\/files\/([^)]+\.woff)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (!woff) continue;
    const ranges = (range ?? 'U+0-10FFFF').split(',').map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    out.push({ file: join(nm, pkg, 'files', woff), ranges });
  }
  return out;
}

const covers = (face, cp) => face.ranges.some(([a, b]) => cp >= a && cp <= b);

// name / weights used / css file per weight
const BASE = { name: 'Inter', pkg: 'inter', weights: [500, 600, 800] };
const FALLBACKS = [
  { name: 'Noto Sans JP', pkg: 'noto-sans-jp', weights: [500, 700, 800] },
  { name: 'Noto Sans Symbols 2', pkg: 'noto-sans-symbols-2', weights: [400] },
];

const load = (() => {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(file));
    return cache.get(file);
  };
})();

// Latin first: satori draws a character with the first font of the family that has it,
// so the Latin files must come before Inter's Cyrillic / Greek / Vietnamese ones.
const rank = (file) => (/-latin-\d/.test(file) ? 0 : /-latin-ext-/.test(file) ? 1 : 2);
const baseFaces = BASE.weights.map((w) => ({ weight: w, faces: faces(BASE.pkg, `${w}.css`).sort((x, y) => rank(x.file) - rank(y.file)) }));
const fallbackFaces = FALLBACKS.map((f) => ({ ...f, byWeight: f.weights.map((w) => ({ weight: w, faces: faces(f.pkg, `${w}.css`) })) }));

// satori uses only the first file registered under a family name, so every
// unicode-range file gets a family of its own ("inter-latin", "noto-sans-jp-12",
// the same name across weights) and the card lists them all in order.
const family = (file) => file.replace(/^.*[\\/]/, '').replace(/-\d{3}-normal\.woff$/, '');

const BASE_FONTS = baseFaces.flatMap(({ weight, faces: fs }) => fs.map((f) => ({ name: family(f.file), weight, style: 'normal', data: load(f.file) })));
const BASE_FAMILIES = [...new Set(BASE_FONTS.map((f) => f.name))];

/**
 * Fonts for a card's text: Inter, plus the fallback files that hold any
 * character Inter lacks. `families`: the font-family list for the card, in
 * order. `missing`: characters no font has (skip the card).
 */
export function fontsFor(text) {
  const fonts = [...BASE_FONTS];
  const families = [...BASE_FAMILIES];
  const missing = new Set();
  const added = new Set();
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x20 || /\p{M}/u.test(ch)) continue; // spaces, controls, combining marks
    if (baseFaces[0].faces.some((f) => covers(f, cp))) continue;
    let found = false;
    for (const fam of fallbackFaces) {
      for (const { weight, faces: fs } of fam.byWeight) {
        const face = fs.find((f) => covers(f, cp));
        if (!face) continue;
        found = true;
        if (!added.has(face.file)) {
          added.add(face.file);
          const name = family(face.file);
          fonts.push({ name, weight, style: 'normal', data: load(face.file) });
          if (!families.includes(name)) families.push(name);
        }
      }
      if (found) break;
    }
    if (!found) missing.add(ch);
  }
  return { fonts, families, missing: [...missing] };
}

// ---------- measuring: the real advance widths of the glyphs that will be drawn ----------

const parsed = new Map();
const parse = (font) => {
  if (!parsed.has(font.data)) parsed.set(font.data, opentype.parse(font.data.buffer.slice(font.data.byteOffset, font.data.byteOffset + font.data.byteLength)));
  return parsed.get(font.data);
};

/**
 * Width of `text` in px at `size`, using for each character the first font of
 * `fonts` (in `families` order, nearest weight) that has it — the same choice
 * the renderer makes. `tracking` is letter spacing in em.
 */
export function measure(text, size, { fonts, families, weight = 800, tracking = 0 }) {
  const adv = advances(fonts, families, weight);
  let em = 0;
  let n = 0;
  for (const ch of text) {
    let a = adv.get(ch);
    if (a === undefined) {
      const font = adv.order.find((f) => f.charToGlyph(ch).index !== 0) ?? adv.order[0];
      a = font.charToGlyph(ch).advanceWidth / font.unitsPerEm;
      adv.set(ch, a);
    }
    em += a;
    n++;
  }
  return (em + n * tracking) * size;
}

// Per card (its font list) and weight: the fonts in drawing order, and each character's advance in em.
const advCache = new WeakMap();
function advances(fonts, families, weight) {
  let byWeight = advCache.get(fonts);
  if (!byWeight) advCache.set(fonts, (byWeight = new Map()));
  let adv = byWeight.get(weight);
  if (adv) return adv;
  const byFamily = new Map();
  for (const f of fonts) {
    const list = byFamily.get(f.name) ?? [];
    list.push(f);
    byFamily.set(f.name, list);
  }
  const pick = (list) => list.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  adv = new Map();
  adv.order = families.map((n) => byFamily.get(n)).filter(Boolean).map(pick).map(parse);
  byWeight.set(weight, adv);
  return adv;
}
