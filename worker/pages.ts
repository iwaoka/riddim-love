// Server-rendered detail pages: /riddim/:id/:slug, /artist/…, /producer/…,
// /label/…, /tune/…  The Worker fills the app's index.html with a real <title>,
// description, canonical, H1 and the first page of tunes as plain HTML, plus
// JSON-LD that mirrors what is on the page. The browser app then takes over,
// starting from the embedded data (no second request).

import { displayText } from '../shared/format';
import {
  INDEXABLE,
  labelMeta,
  ORIGIN,
  pagePath,
  personMeta,
  refPath,
  riddimMeta,
  riddimName,
  SITE,
  slugify,
  tuneMeta,
  type PageKind,
  type PageMeta,
} from '../shared/seo';
import type { Entity, Ref, Riddim, SsrData, Tune, TuneList } from '../shared/types';
import { apiPath, loadEntity, loadRiddim, loadTune, loadTunes } from './data';
import { UpstreamError, type UpstreamStats } from './upstream';

export interface PageEnv {
  ASSETS: Fetcher;
}

// ---------- HTML helpers ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** JSON safe inside <script>: no "</script>", no "<!--". */
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
const a = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const ext = (href: string | null, text: string) =>
  href && href.startsWith('https://riddim-id.com/') ? `<a href="${esc(href)}" rel="noopener" target="_blank">${esc(text)}</a>` : '';
const joinRefs = (refs: Ref[], kind: 'artist' | 'producer') => refs.map((r) => a(refPath(kind, r), r.name)).join(' &amp; ');
const yearSpan = (y: number | null) => (y ? ` <span class="muted">${y}</span>` : '');

// ---------- page parts ----------
type ListKind = 'riddim' | 'artist' | 'producer' | 'label';

function tuneTable(tunes: Tune[], hide: { riddim?: boolean; label?: boolean }): string {
  const th = (cls: string, t: string) => `<th scope="col" class="${cls}">${t}</th>`;
  const head = [th('c-artist', 'Artist'), th('c-title', 'Title'), hide.riddim ? '' : th('c-riddim', 'Riddim'), hide.label ? '' : th('c-label', 'Label'), th('c-year', 'Year')].join('');
  const rows = tunes
    .map((t) => {
      const cells = [
        `<td class="c-artist">${t.artists.length ? joinRefs(t.artists, 'artist') : '—'}</td>`,
        `<td class="c-title">${esc(t.title)}${t.is_original ? ' <span class="badge">Original</span>' : ''}</td>`,
        hide.riddim ? '' : `<td class="c-riddim">${t.riddim ? a(refPath('riddim', t.riddim), t.riddim.name) : '—'}</td>`,
        hide.label ? '' : `<td class="c-label">${t.label ? a(refPath('label', t.label), t.label.name) : '—'}</td>`,
        `<td class="c-year">${t.year ?? ''}</td>`,
      ];
      return `<tr${t.is_original ? ' class="orig"' : ''}>${cells.join('')}</tr>`;
    })
    .join('');
  return `<div class="tunes-wrap"><table class="tunes"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function countLine(list: TuneList): string {
  const n = list.tunes.length;
  return `<p class="count muted">${list.total != null ? `${n} of ${list.total} tunes` : `${n} tunes`}</p>`;
}

const KIND_LABEL: Record<PageKind, string> = { riddim: 'Riddim', artist: 'Artist', producer: 'Producer', label: 'Label', tune: 'Tune' };

function listHead(kind: ListKind, meta: PageMeta, extra: string[], src: string | null, year: number | null = null): string {
  return (
    `<header class="list-head"><p class="kind">${KIND_LABEL[kind]}</p><h1>${esc(meta.h1)}${yearSpan(year)}</h1>` +
    extra.filter(Boolean).join('') +
    (src ? `<p class="src">${ext(src, 'View on Riddim-ID ↗')}</p>` : '') +
    `</header>`
  );
}

// ---------- JSON-LD (only what the page shows) ----------
const crumbs = (items: { name: string; url: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [{ name: SITE, url: ORIGIN + '/' }, ...items].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});
const performer = (r: Ref) => ({ '@type': 'MusicGroup', name: r.name, url: ORIGIN + refPath('artist', r) }); // MusicGroup: "can also be a solo musician"
const recording = (t: Tune) => ({
  '@type': 'MusicRecording',
  name: t.title,
  ...(t.artists.length ? { byArtist: t.artists.map(performer) } : {}),
  ...(t.year ? { datePublished: String(t.year) } : {}),
});
const itemList = (list: TuneList) => ({
  '@type': 'ItemList',
  numberOfItems: list.total ?? list.tunes.length,
  itemListElement: list.tunes.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: recording(t) })),
});

// ---------- page builders ----------
interface Built {
  canonicalPath: string;
  meta: PageMeta;
  main: string;
  jsonLd: unknown[];
  ssr: SsrData;
}

async function buildRiddim(id: number, ctx: ExecutionContext, stats: UpstreamStats): Promise<Built> {
  const [r, list] = await Promise.all([loadRiddim(id, ctx, stats), loadTunes('riddim', id, {}, ctx, stats)]);
  const meta = riddimMeta(r, list.total, list.tunes);
  const canonicalPath = pagePath('riddim', id, r.slug);
  const facts: string[] = [];
  const by = r.producers.length ? `Produced by ${joinRefs(r.producers, 'producer')}` : '';
  const vo = r.version_of ? `Version of ${a(refPath('riddim', r.version_of), r.version_of.name)}` : '';
  if (by || vo) facts.push(`<p class="facts">${[by, vo].filter(Boolean).join(' · ')}</p>`);
  if (r.alternate_names.length) facts.push(`<p class="facts muted">Also known as ${esc(r.alternate_names.join(', '))}</p>`);
  if (r.versions.length) {
    facts.push(
      `<details class="versions"><summary>${r.versions.length} version${r.versions.length === 1 ? '' : 's'}</summary><ul class="chips">` +
        r.versions.map((v) => `<li>${a(refPath('riddim', v), v.name)}${yearSpan(v.year)}</li>`).join('') +
        `</ul></details>`,
    );
  }
  const url = ORIGIN + canonicalPath;
  return {
    canonicalPath,
    meta,
    main: listHead('riddim', meta, facts, r.url, r.year) + countLine(list) + tuneTable(list.tunes, { riddim: true }),
    jsonLd: [
      crumbs([{ name: meta.h1, url }]),
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: meta.h1, url, description: meta.description, ...(r.url ? { sameAs: r.url } : {}), mainEntity: itemList(list) },
    ],
    ssr: { api: { [apiPath.riddim(id)]: r, [apiPath.riddimTunes(id)]: list } },
  };
}

async function buildEntity(kind: 'artist' | 'producer' | 'label', id: number, ctx: ExecutionContext, stats: UpstreamStats): Promise<Built> {
  const [e, list]: [Entity, TuneList] = await Promise.all([loadEntity(kind, id, ctx, stats), loadTunes(kind, id, {}, ctx, stats)]);
  const meta = kind === 'label' ? labelMeta(e, list.tunes) : personMeta(kind, e.name, list.tunes);
  const canonicalPath = pagePath(kind, id, e.slug);
  const url = ORIGIN + canonicalPath;
  const facts: string[] = [];
  if (kind === 'label' && (e.founded_year || e.founded_place)) {
    facts.push(`<p class="facts">Founded ${esc([e.founded_year, e.founded_place].filter(Boolean).join(', '))}</p>`);
  }
  const node =
    kind === 'label'
      ? { '@type': 'Organization', name: e.name, url, ...(e.url ? { sameAs: e.url } : {}), ...(e.founded_year ? { foundingDate: String(e.founded_year) } : {}) }
      : kind === 'artist'
        ? { '@type': 'MusicGroup', name: e.name, url, ...(e.url ? { sameAs: e.url } : {}), track: itemList(list) }
        : { '@type': e.kind === 'person' ? 'Person' : 'Organization', name: e.name, url, ...(e.url ? { sameAs: e.url } : {}) };
  return {
    canonicalPath,
    meta,
    main: listHead(kind, meta, facts, e.url) + countLine(list) + tuneTable(list.tunes, { label: kind === 'label' }),
    jsonLd: [crumbs([{ name: meta.h1, url }]), { '@context': 'https://schema.org', ...node }],
    ssr: { api: { [apiPath.tunes(kind, id)]: list } },
  };
}

async function buildTune(id: number, ctx: ExecutionContext, stats: UpstreamStats): Promise<Built> {
  const t = await loadTune(id, ctx, stats);
  const meta = tuneMeta(t);
  const canonicalPath = pagePath('tune', id, slugify(t.title));
  const url = ORIGIN + canonicalPath;
  const dd = (k: string, v: string) => `<dt>${k}</dt><dd>${v || '—'}</dd>`;
  const main =
    `<article class="tune"><p class="kind">Tune</p><h1 class="at">${esc(displayText(t.artists, t.title))}</h1><dl>` +
    dd('Artist', joinRefs(t.artists, 'artist')) +
    dd('Title', esc(t.title) + (t.is_original ? ' <span class="badge">Original</span>' : '')) +
    dd('Riddim', t.riddim ? a(refPath('riddim', t.riddim), t.riddim.name) + (t.riddim.version_of ? ` <span class="muted">(version of ${esc(t.riddim.version_of)})</span>` : '') : '') +
    dd('Label', t.label ? a(refPath('label', t.label), t.label.name) : '') +
    dd('Producer', joinRefs(t.producers, 'producer')) +
    dd('Year', t.year ? String(t.year) : '') +
    `</dl>` +
    (t.riddim?.url ? `<p class="muted">Source: ${ext(t.riddim.url, `${t.riddim.name} on Riddim-ID ↗`)}</p>` : '') +
    `</article>`;
  const trail = t.riddim ? [{ name: riddimName(t.riddim.name), url: ORIGIN + refPath('riddim', t.riddim) }] : [];
  return {
    canonicalPath,
    meta,
    main,
    jsonLd: [
      crumbs([...trail, { name: displayText(t.artists, t.title), url }]),
      {
        '@context': 'https://schema.org',
        ...recording(t),
        url,
        ...(t.producers.length ? { producer: t.producers.map((p) => ({ '@type': 'Person', name: p.name, url: ORIGIN + refPath('producer', p) })) } : {}),
        ...(t.label ? { publisher: { '@type': 'Organization', name: t.label.name, url: ORIGIN + refPath('label', t.label) } } : {}),
      },
    ],
    ssr: { api: { [apiPath.tune(id)]: t } },
  };
}

// ---------- response ----------
async function asset(env: PageEnv, url: URL, path: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL(path, url).toString()));
}

async function notFound(env: PageEnv, url: URL): Promise<Response> {
  const res = await asset(env, url, '/404.html');
  const out = new Response(res.body, { status: 404, headers: res.headers });
  out.headers.set('X-Robots-Tag', 'noindex');
  out.headers.set('Cache-Control', 'public, max-age=60');
  return out;
}

/**
 * Serves one detail page. Unknown ids → 404. A missing/wrong slug → 301 to the
 * canonical path (query kept). Query params (filter/sort) keep the canonical of
 * the base page. Upstream trouble → 503 with the plain app shell (noindex).
 */
export async function servePage(
  request: Request,
  env: PageEnv,
  ctx: ExecutionContext,
  url: URL,
  page: { kind: PageKind; id: number; slug: string },
): Promise<Response> {
  const started = Date.now();
  const stats: UpstreamStats = { hits: 0, misses: 0 };
  let built: Built;
  try {
    built =
      page.kind === 'riddim'
        ? await buildRiddim(page.id, ctx, stats)
        : page.kind === 'tune'
          ? await buildTune(page.id, ctx, stats)
          : await buildEntity(page.kind, page.id, ctx, stats);
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) return notFound(env, url);
    console.error('page error', page, e);
    const shell = await asset(env, url, '/');
    const out = new Response(shell.body, { status: 503, headers: shell.headers });
    out.headers.set('X-Robots-Tag', 'noindex');
    out.headers.set('Retry-After', String(e instanceof UpstreamError && e.retryAfter ? e.retryAfter : 120));
    out.headers.set('Cache-Control', 'no-store');
    return out;
  }

  if (url.pathname !== built.canonicalPath) {
    return Response.redirect(ORIGIN + built.canonicalPath + url.search, 301);
  }

  const canonical = ORIGIN + built.canonicalPath;
  const { meta } = built;
  const noindex = !INDEXABLE[page.kind];
  const template = await asset(env, url, '/');
  const setContent = (content: string) => ({
    element(el: Element) {
      el.setAttribute('content', content);
    },
  });

  const rewritten = new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', setContent(meta.description))
    .on('link[rel="canonical"]', { element: (el) => void el.setAttribute('href', canonical) })
    .on('meta[property="og:url"]', setContent(canonical))
    .on('meta[property="og:title"]', setContent(meta.title))
    .on('meta[name="twitter:title"]', setContent(meta.title))
    .on('meta[property="og:description"]', setContent(meta.description))
    .on('meta[name="twitter:description"]', setContent(meta.description))
    .on('script[type="application/ld+json"]', {
      element: (el) => void el.setInnerContent(scriptJson(built.jsonLd), { html: true }),
    })
    .on('head', {
      element: (el) => void (noindex ? el.append('<meta name="robots" content="noindex, follow">', { html: true }) : null),
    })
    .on('main#main', { element: (el) => void el.setInnerContent(built.main, { html: true }) })
    .on('body', {
      element: (el) => void el.append(`<script type="application/json" id="ssr-data">${scriptJson(built.ssr)}</script>`, { html: true }),
    })
    .transform(new Response(template.body, template));

  const out = new Response(rewritten.body, rewritten);
  out.headers.set('Content-Type', 'text/html; charset=utf-8');
  out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  if (noindex) out.headers.set('X-Robots-Tag', 'noindex, follow');
  out.headers.set('Server-Timing', `ssr;dur=${Date.now() - started}, upstream;desc="hit ${stats.hits} miss ${stats.misses}"`);
  out.headers.delete('ETag'); // the template's ETag does not describe this page
  return out;
}

