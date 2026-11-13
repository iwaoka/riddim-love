#!/usr/bin/env node
// The home page's OGP card ("Just find it."), static files deployed with the site:
//  - public/og-home.png: named by index.html for "/" and every page without a
//    card of its own (search views, /want, /dig).
//  - public/ogp.png: the same card, as the common image — what /og/* returns
//    for a page whose card is not generated yet (worker/og.ts), and what links
//    shared before the per-page cards still point at.
// Run after a design change and bump the ?v= in index.html.
import { writeFileSync } from 'node:fs';
import { cards, renderPng } from './template.mjs';

const { png } = await renderPng(cards.home());
for (const name of ['og-home.png', 'ogp.png']) {
  writeFileSync(new URL(`../../public/${name}`, import.meta.url), png);
  console.log(`public/${name} ${(png.length / 1024).toFixed(1)} KB`);
}
