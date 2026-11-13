#!/usr/bin/env node
// Draws the per-page OGP images and stores them where the Worker serves them
// from (R2 key og/<kind>/<id>.png, see shared/og.ts).
//
//   node scripts/og/generate.mjs [options]
//     --kind riddim,artist   page kinds (default: riddim,artist,producer,label,tune)
//     --id 18,759            only these ids (needs exactly one --kind)
//     --max 500              stop after this many images drawn (0 = no limit)
//     --force                redraw even when unchanged
//     --out <dir>            write files under <dir> instead of R2 (local check)
//     --local                write to the local R2 of `wrangler dev` (tests)
//     --dry-run              list and compare only: draw and write nothing
//   R2 (default target): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET (default riddim-love-og), from the environment (GitHub Secrets).
//
// Differential: a manifest per kind (og/_manifest/<kind>.json: id → hash of
// the drawn title + template version) is read first; a page whose hash is
// unchanged is skipped. The manifest is saved every 200 images and at the end,
// so a stopped run resumes where it left off. Nothing is ever deleted: when the
// API fails, the run stops for that kind and every existing image stays.
// Riddim-ID API: one list request (100 items) at a time, ≥ 1.1 s apart.

import { createHash, createHmac } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { OG_KINDS, ogHash, ogKey } from '../../shared/og.ts';
import { cards, renderPng } from './template.mjs';

// OG_API_BASE: tests only (e.g. an unreachable host, to check the API-down path).
const API = process.env.OG_API_BASE || 'https://api.riddim-id.com/v1';
const UA = 'RIDDIM.LOVE/0.1 (+https://riddim.love; independent non-commercial search frontend; OGP image generator)';
const PATHS = { riddim: 'riddims', artist: 'artists', producer: 'producers', label: 'labels', tune: 'tunes' };
const GAP_MS = 1100;
const SAVE_EVERY = 200;
const UPLOADS = 6; // parallel writes

const { values: opt } = parseArgs({
  options: {
    kind: { type: 'string' },
    id: { type: 'string' },
    max: { type: 'string', default: '0' },
    force: { type: 'boolean', default: false },
    out: { type: 'string' },
    local: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
const kinds = opt.kind ? opt.kind.split(',').map((k) => k.trim()).filter(Boolean) : [...OG_KINDS];
for (const k of kinds) if (!OG_KINDS.includes(k)) fail(`unknown kind: ${k}`);
const ids = opt.id ? opt.id.split(',').map((x) => Number(x.trim())) : null;
if (ids && (kinds.length !== 1 || ids.some((n) => !Number.isInteger(n) || n < 1))) fail('--id needs exactly one --kind and positive ids');
const max = Number(opt.max) || 0;
const dry = opt['dry-run'];

function fail(msg) {
  console.error(msg);
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- storage targets ----------

/** R2 through its S3 API, signed with AWS Signature V4 (no SDK). */
function r2Store() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: keyId, R2_SECRET_ACCESS_KEY: secret } = process.env;
  const bucket = process.env.R2_BUCKET || 'riddim-love-og';
  if (!account || !keyId || !secret) fail('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are needed (or use --out / --local)');
  const host = `${account}.r2.cloudflarestorage.com`;
  const sha = (d) => createHash('sha256').update(d).digest('hex');
  const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
  async function call(method, key, body, headers = {}) {
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = now.slice(0, 8);
    const path = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const h = { host, 'x-amz-date': now, 'x-amz-content-sha256': sha(body ?? ''), ...headers };
    const names = Object.keys(h).map((n) => n.toLowerCase()).sort();
    const canon = [method, path, '', ...names.map((n) => `${n}:${String(h[Object.keys(h).find((k) => k.toLowerCase() === n)]).trim()}`), '', names.join(';'), h['x-amz-content-sha256']].join('\n');
    const scope = `${date}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', now, scope, sha(canon)].join('\n');
    const kSign = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), 'auto'), 's3'), 'aws4_request');
    const auth = `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${createHmac('sha256', kSign).update(toSign).digest('hex')}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://${host}${path}`, { method, body, headers: { ...h, authorization: auth } });
      if (res.status < 500 || attempt >= 3) return res;
      await sleep(2000 * 3 ** attempt);
    }
  }
  return {
    name: `R2 bucket ${bucket}`,
    async get(key) {
      const res = await call('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET ${key}: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async put(key, data, type, meta = {}) {
      const headers = { 'content-type': type };
      for (const [k, v] of Object.entries(meta)) headers[`x-amz-meta-${k}`] = v;
      const res = await call('PUT', key, data, headers);
      if (!res.ok) throw new Error(`R2 PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** Plain files (local check: open them in an image viewer). */
function dirStore(root) {
  return {
    name: `folder ${root}`,
    async get(key) {
      const f = join(root, key);
      return existsSync(f) ? readFileSync(f) : null;
    },
    async put(key, data) {
      const f = join(root, key);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, data);
    },
  };
}

/** The local R2 of `wrangler dev` (its binding OG, through wrangler's platform proxy). */
async function localStore() {
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy();
  const bucket = proxy.env.OG;
  if (!bucket) fail('no OG binding in wrangler.jsonc');
  process.on('exit', () => void proxy.dispose());
  return {
    name: 'local R2 (wrangler dev)',
    async get(key) {
      const obj = await bucket.get(key);
      return obj ? Buffer.from(await obj.arrayBuffer()) : null;
    },
    async put(key, data, type, meta = {}) {
      await bucket.put(key, data, { httpMetadata: { contentType: type }, customMetadata: meta });
    },
  };
}

const store = opt.out ? dirStore(opt.out) : opt.local ? await localStore() : r2Store();

// ---------- Riddim-ID API ----------

class ApiDown extends Error {}
let lastCall = 0;
async function api(path) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(API + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch (e) {
      res = { ok: false, status: 0, headers: new Headers(), statusText: String(e) };
    }
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt >= 3 || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new ApiDown(`${path}: HTTP ${res.status}`);
    const after = Number(res.headers.get('retry-after')) || 5 * 3 ** attempt;
    console.log(`  API ${res.status || 'network error'}, retry in ${after} s`);
    await sleep(after * 1000);
  }
}

/** Pages of items: the given ids one by one, or the whole list (100 per page). */
async function* pages(kind) {
  if (ids) {
    for (const id of ids) {
      const body = await api(`/${PATHS[kind]}/${id}`);
      if (body?.data) yield [body.data];
      else console.log(`  ${kind} ${id}: not found`);
    }
    return;
  }
  let cursor = null;
  do {
    const body = await api(`/${PATHS[kind]}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!body) return;
    yield body.data ?? [];
    cursor = body.meta?.next_cursor ?? null;
  } while (cursor);
}

// ---------- run ----------

const total = { drawn: 0, unchanged: 0, unrenderable: 0, failed: 0 };
const report = [];
let apiFailed = false;

async function runKind(kind) {
  const mKey = `og/_manifest/${kind}.json`;
  const manifest = JSON.parse((await store.get(mKey))?.toString('utf8') ?? '{"items":{}}');
  const items = manifest.items;
  const n = { listed: 0, drawn: 0, unchanged: 0, unrenderable: 0, failed: 0 };
  let sinceSave = 0;
  const save = async () => {
    if (!dry) await store.put(mKey, Buffer.from(JSON.stringify({ updated: new Date().toISOString(), items })), 'application/json');
    sinceSave = 0;
  };
  const inFlight = new Set();
  const limitReached = () => max && total.drawn >= max;

  try {
    for await (const page of pages(kind)) {
      for (const data of page) {
        n.listed++;
        const card = cards[kind](data);
        const hash = ogHash(kind, card.title);
        const prev = items[data.id];
        if (!opt.force && (prev === hash || prev === `!${hash}`)) {
          n.unchanged++;
          continue;
        }
        if (limitReached()) break;
        if (dry) {
          n.drawn++;
          total.drawn++;
          continue;
        }
        let png;
        try {
          const r = await renderPng(card);
          png = r.png;
          if (!png) {
            // No font for a character, or no title: the page keeps the common image.
            n.unrenderable++;
            items[data.id] = `!${hash}`;
            console.log(`  ${kind} ${data.id}: not drawn (${r.reason ?? 'no font for ' + r.missing.join(' ')})`);
            continue;
          }
        } catch (e) {
          n.failed++;
          console.log(`  ${kind} ${data.id}: draw failed: ${e.message}`);
          continue;
        }
        n.drawn++;
        total.drawn++;
        const job = store
          .put(ogKey(kind, data.id), png, 'image/png', { hash })
          .then(() => {
            items[data.id] = hash;
            sinceSave++;
          })
          .catch((e) => {
            n.failed++;
            n.drawn--;
            total.drawn--;
            console.log(`  ${kind} ${data.id}: upload failed: ${e.message}`);
          })
          .finally(() => inFlight.delete(job));
        inFlight.add(job);
        if (inFlight.size >= UPLOADS) await Promise.race(inFlight);
        if (sinceSave >= SAVE_EVERY) await save();
      }
      console.log(`  ${kind}: ${n.listed} listed, ${n.drawn} drawn, ${n.unchanged} unchanged, ${n.unrenderable} not drawable, ${n.failed} failed`);
      if (limitReached()) {
        console.log(`  --max ${max} reached`);
        break;
      }
    }
  } catch (e) {
    if (!(e instanceof ApiDown)) throw e;
    apiFailed = true;
    console.log(`  ${kind}: API unavailable (${e.message}); stopping this kind, existing images kept`);
  } finally {
    await Promise.allSettled(inFlight);
    await save();
  }
  total.unchanged += n.unchanged;
  total.unrenderable += n.unrenderable;
  total.failed += n.failed;
  report.push({ kind, ...n });
}

const t0 = Date.now();
console.log(`OGP images → ${dry ? '(dry run) ' : ''}${store.name}; kinds ${kinds.join(', ')}${ids ? `; ids ${ids.join(', ')}` : ''}${max ? `; max ${max}` : ''}${opt.force ? '; force' : ''}`);
for (const kind of kinds) {
  console.log(`${kind}:`);
  await runKind(kind);
  if (max && total.drawn >= max) break;
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
const line = `drawn ${total.drawn}, unchanged ${total.unchanged}, not drawable ${total.unrenderable}, failed ${total.failed} (${mins} min)`;
console.log(`\nTotal: ${line}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.map((r) => `| ${r.kind} | ${r.listed} | ${r.drawn} | ${r.unchanged} | ${r.unrenderable} | ${r.failed} |`).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## OGP images${dry ? ' (dry run)' : ''}\n\n| kind | listed | drawn | unchanged | not drawable | failed |\n|---|---|---|---|---|---|\n${rows}\n\n${line}${apiFailed ? '\n\n**Riddim-ID API unavailable: run stopped early, existing images kept.**' : ''}\n`,
  );
}
process.exitCode = apiFailed || total.failed ? 1 : 0;
if (opt.local) process.exit();
