#!/usr/bin/env node
// Local preview of the OGP cards: writes og-samples/*.png (git-ignored).
//   node scripts/og/sample.mjs          # the six page kinds, from real API data
//   node scripts/og/sample.mjs --bench  # also 100 cards: time, size, memory
// Reads the Riddim-ID API only (a handful of requests, 1 s apart). Writes nothing to R2.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cards, renderPng } from './template.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'og-samples');
const UA = 'RIDDIM.LOVE/0.1 (+https://riddim.love; independent non-commercial search frontend; OGP preview)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  await sleep(1000);
  const res = await fetch('https://api.riddim-id.com/v1' + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data;
}

async function main() {
  await mkdir(out, { recursive: true });
  const riddim = await api('/riddims/18');
  const samples = {
    'home': cards.home(),
    'riddim-18-sleng-teng': cards.riddim(riddim),
    'artist-263-wayne-smith': cards.artist(await api('/artists/263')),
    'producer-595-king-jammy': cards.producer(await api('/producers/595')),
    'label-61-jammys': cards.label(await api('/labels/61')),
    'tune-759-under-mi-sleng-teng': cards.tune(await api('/tunes/759')),
  };
  for (const [name, card] of Object.entries(samples)) {
    const { png, missing, layout } = await renderPng(card);
    if (!png) { console.log(`${name}: skipped, no font for ${missing.join(' ')}`); continue; }
    await writeFile(join(out, `${name}.png`), png);
    console.log(`${name}.png  ${(png.length / 1024).toFixed(1)} KB  ${layout.size}px x${layout.lines.length}`);
  }

  if (!process.argv.includes('--bench')) return;
  // 100 real cards: the first page of riddims sorted by name (short and long names, symbols).
  const list = await fetch('https://api.riddim-id.com/v1/riddims?sort=name', { headers: { 'User-Agent': UA } }).then((r) => r.json());
  await mkdir(join(out, 'bench'), { recursive: true });
  const sizes = [];
  let peak = process.memoryUsage().rss;
  const t0 = performance.now();
  for (const r of list.data) {
    const { png } = await renderPng(cards.riddim(r));
    if (!png) continue;
    sizes.push(png.length);
    await writeFile(join(out, 'bench', `riddim-${r.id}.png`), png);
    peak = Math.max(peak, process.memoryUsage().rss);
  }
  const ms = performance.now() - t0;
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  console.log(`\nbench: ${sizes.length} cards in ${(ms / 1000).toFixed(1)} s (${(ms / sizes.length).toFixed(0)} ms each)`);
  console.log(`size: avg ${(avg / 1024).toFixed(1)} KB, min ${(Math.min(...sizes) / 1024).toFixed(1)} KB, max ${(Math.max(...sizes) / 1024).toFixed(1)} KB`);
  console.log(`memory: peak RSS ${(peak / 1024 / 1024).toFixed(0)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
