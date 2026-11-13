#!/usr/bin/env node
// The home page's OGP card ("Just find it."), a static file deployed with the
// site: public/og-home.png. index.html names it for "/" and every page without
// a card of its own (search views, /want, /dig). Run after a design change and
// bump the ?v= in index.html.
import { writeFileSync } from 'node:fs';
import { cards, renderPng } from './template.mjs';

const { png } = await renderPng(cards.home());
writeFileSync(new URL('../../public/og-home.png', import.meta.url), png);
console.log(`public/og-home.png ${(png.length / 1024).toFixed(1)} KB`);
