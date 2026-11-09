#!/usr/bin/env node
// Builds the static sitemap: public/sitemap.xml (index) + public/sitemaps/*.xml.
//
//   npm run sitemap            # fetch, check, write
//   npm run sitemap -- --dry   # fetch and check only, write nothing
//
// Reads the Riddim-ID API v1 list endpoints sorted by tune count and stops at
// the first item under the minimum (see scripts/sitemap-lib.ts), politely:
// one request at a time, 1 s apart, honouring 429 Retry-After. Nothing is
// written unless the whole run succeeded and the result passes the checks,
// so a failed run leaves the last good sitemap in place.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countLocs, duplicateNames, indexXml, KINDS, LIST_PATH, MIN_TUNES, ORIGIN, pickPage, splitFiles, urlsetXml, validateSet,
} from './sitemap-lib.ts';

const UPSTREAM = 'https://api.riddim-id.com/v1';
const USER_AGENT = 'RIDDIM.LOVE/0.1 (+https://riddim.love; independent non-commercial search frontend; sitemap build)';
const GAP_MS = 1000; // between requests
const TIMEOUT_MS = 20_000;
const MAX_TRIES = 4; // first try + 3 retries
const MAX_PAGES = 200; // per kind; a guard against a cursor that never ends

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const outDir = join(publicDir, 'sitemaps');
const dry = process.argv.includes('--dry');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let last = 0;

async function getJson(path, params) {
  const url = new URL(UPSTREAM + path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    requests++;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt >= MAX_TRIES) throw new Error(`${url}: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
      await sleep(5000 * 3 ** (attempt - 1));
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_TRIES) {
      const ra = Number(res.headers.get('Retry-After'));
      const ms = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 300) * 1000 : 5000 * 3 ** (attempt - 1);
      console.warn(`  ${res.status} on ${url.pathname}; waiting ${Math.round(ms / 1000)} s`);
      await sleep(ms);
      continue;
    }
    throw new Error(`${url}: HTTP ${res.status}`);
  }
}

async function collect(kind) {
  const urls = [];
  const names = [];
  let cursor = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await getJson(LIST_PATH[kind], { sort: '-tunes', cursor });
    if (!Array.isArray(body?.data)) throw new Error(`${kind} page ${page}: unexpected response`);
    const got = pickPage(kind, body.data);
    urls.push(...got.urls);
    names.push(...got.names);
    cursor = typeof body.meta?.next_cursor === 'string' ? body.meta.next_cursor : null;
    process.stdout.write(`\r  ${kind}: page ${page}, ${urls.length} URLs`);
    if (got.stop || !cursor) {
      process.stdout.write('\n');
      return { urls: [...new Set(urls)], names, total: body.meta?.total ?? null };
    }
  }
  throw new Error(`${kind}: more than ${MAX_PAGES} pages; stopped`);
}

async function previousCounts() {
  const prev = {};
  let files = [];
  try {
    files = await readdir(outDir);
  } catch {
    return prev; // first run
  }
  for (const f of files) {
    const m = /^(riddim|artist|label|producer)(?:-\d+)?\.xml$/.exec(f);
    if (m) prev[m[1]] = (prev[m[1]] ?? 0) + countLocs(await readFile(join(outDir, f), 'utf8'));
  }
  return prev;
}

async function main() {
  const started = Date.now();
  console.log(`Sitemap build (min tunes: ${KINDS.map((k) => `${k} ${MIN_TUNES[k]}`).join(', ')})`);
  const files = [];
  const totals = {};
  const report = [];
  for (const kind of KINDS) {
    const { urls, names, total } = await collect(kind);
    totals[kind] = urls.length;
    const dups = duplicateNames(names);
    report.push(`  ${kind.padEnd(8)} ${String(urls.length).padStart(6)} URLs of ${total ?? '?'} records; ${dups.length} names shared by more than one page`);
    for (const f of splitFiles(kind, urls)) files.push({ name: f.name, xml: urlsetXml(f.urls) });
  }
  files.unshift({ name: 'pages.xml', xml: urlsetXml([ORIGIN + '/']) });
  const index = { name: 'sitemap.xml', xml: indexXml(files.map((f) => `${ORIGIN}/sitemaps/${f.name}`)) };

  const problems = validateSet([...files, index], totals, await previousCounts());
  console.log(report.join('\n'));
  const all = files.reduce((n, f) => n + countLocs(f.xml), 0);
  console.log(`  total    ${String(all).padStart(6)} URLs in ${files.length} files; ${requests} upstream requests; ${Math.round((Date.now() - started) / 1000)} s`);
  if (problems.length) {
    console.error('Not written — problems found:\n  ' + problems.slice(0, 20).join('\n  '));
    process.exit(1);
  }
  if (dry) {
    console.log('Dry run: nothing written.');
    return;
  }
  // Write the new set beside the old one, then swap, so a crash never leaves half a set.
  const tmp = outDir + '.tmp';
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (const f of files) await writeFile(join(tmp, f.name), f.xml);
  await rm(outDir, { recursive: true, force: true });
  await rename(tmp, outDir);
  await writeFile(join(publicDir, index.name), index.xml);
  console.log(`Written: public/sitemap.xml + public/sitemaps/ (${files.map((f) => f.name).join(', ')})`);
}

main().catch((e) => {
  console.error('\nSitemap build failed; the previous sitemap is unchanged.\n ', e.message);
  process.exit(1);
});
