import './style.css';
import { digProvidersFor, normalizeCountry } from '../shared/dig';
import { artistNames, copyText, displayText, externalSearchUrl, searchText } from '../shared/format';
import { altNames, labelMeta, ORIGIN, ORIGINAL_TUNES_MAX, originalTuneText, parsePagePath, personMeta, refPath, riddimMeta, tuneMeta, tunePath, type PageMeta } from '../shared/seo';
import { filterWords, matches } from '../shared/filter';
import { sameName, splitArtistTitle, splitByArtistPrefix, splitByArtistSuffix, swapArtistTitle, type ArtistTitle } from '../shared/pair';
import { formatSort, parseSort, sortRows, type SortDir, type SortKey } from '../shared/sort';
import { parseWant, toWantItem, WANT_KEY, WANT_MAX, wantText, type WantItem } from '../shared/want';

const HOME_TITLE = 'RIDDIM.LOVE — Riddim search for reggae & dancehall selectors';
const HOME_DESCRIPTION =
  'Search reggae and dancehall riddims, tunes, artists and labels. See every tune on a riddim with artist, label and year, then jump to YouTube or Discogs. Data provided by Riddim-ID.';
import type { ApiError, ListKind, NameHit, Ref, Riddim, RiddimRef, SearchResult, SearchType, SsrData, SuggestResult, Tune, TuneHit, TuneList } from '../shared/types';
import { append, h, safeExternal } from './dom';

// ---------- elements ----------
const main = document.getElementById('main') as HTMLElement;
const form = document.getElementById('search-form') as HTMLFormElement;
const input = document.getElementById('q') as HTMLInputElement;
const announcer = document.getElementById('announce') as HTMLElement;
// The old "YouTube search adds" preference is no longer used.
try {
  localStorage.removeItem('riddim.love:yt');
} catch {
  /* storage unavailable */
}

const announce = (msg: string) => {
  announcer.textContent = '';
  setTimeout(() => (announcer.textContent = msg), 30);
};

// ---------- API ----------
class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const memo = new Map<string, Promise<unknown>>();
let navController: AbortController | null = null;

// A server-rendered page embeds the /api responses it was built from, so the
// first render here needs no request.
try {
  const el = document.getElementById('ssr-data');
  if (el?.textContent) {
    const ssr = JSON.parse(el.textContent) as SsrData;
    for (const [path, value] of Object.entries(ssr.api ?? {})) memo.set(path, Promise.resolve(value));
  }
} catch {
  /* ignore malformed data; the app fetches instead */
}

async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cached = memo.get(path);
  if (cached) return cached as Promise<T>;
  const p = (async () => {
    let res: Response;
    try {
      res = await fetch(path, { headers: { Accept: 'application/json' }, signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiFailure(0, 'Network error. Check your connection and try again.');
    }
    const body = (await res.json().catch(() => null)) as T | ApiError | null;
    if (!res.ok) {
      const msg = (body as ApiError | null)?.error?.message ?? `Request failed (${res.status}).`;
      throw new ApiFailure(res.status, msg);
    }
    return body as T;
  })();
  memo.set(path, p);
  p.catch(() => memo.delete(path));
  return p;
}

// ---------- routing ----------
type Route =
  | { view: 'home'; type: SearchType }
  | { view: 'search'; q: string; type: SearchType }
  | { view: 'list'; kind: ListKind; id: number; f: string; sort: { key: SortKey; dir: SortDir } | null }
  | { view: 'tune'; id: number }
  | { view: 'want' };

const LIST_KINDS: ListKind[] = ['riddim', 'artist', 'producer', 'label'];
const ID_RE = /^[1-9]\d{0,8}$/;

function parseRoute(loc: { pathname: string; search: string }): Route {
  const p = new URLSearchParams(loc.search);
  if (/^\/want\/?$/.test(loc.pathname)) return { view: 'want' };
  const page = parsePagePath(loc.pathname);
  if (page) {
    if (page.kind === 'tune') return { view: 'tune', id: page.id };
    return { view: 'list', kind: page.kind, id: page.id, f: p.get('f') ?? '', sort: parseSort(p.get('sort')) };
  }
  // Old query-string URLs (the Worker 301s these to path URLs; kept as a fallback).
  const tune = p.get('tune');
  if (tune && ID_RE.test(tune)) return { view: 'tune', id: Number(tune) };
  for (const kind of LIST_KINDS) {
    const id = p.get(kind);
    if (id && ID_RE.test(id)) {
      return { view: 'list', kind, id: Number(id), f: p.get('f') ?? '', sort: parseSort(p.get('sort')) };
    }
  }
  const raw = p.get('type');
  const type: SearchType = isSearchType(raw) ? raw : storedType();
  const q = (p.get('q') ?? '').trim();
  if (q) return { view: 'search', q, type };
  return { view: 'home', type };
}

// ---------- search target (Riddim / Tune / Artist / Label) ----------
const SEARCH_TYPES: SearchType[] = ['riddim', 'tune', 'artist', 'label', 'producer'];
const TYPE_KEY = 'riddim.love:type';
const isSearchType = (v: unknown): v is SearchType => SEARCH_TYPES.includes(v as SearchType);
const typeRadios = [...document.querySelectorAll<HTMLInputElement>('#types input[name="type"]')];

const TYPE_UI: Record<SearchType, { placeholder: string; label: string; plural: string }> = {
  riddim: { placeholder: 'Riddim name, e.g. Sleng Teng', label: 'Search riddim names', plural: 'riddims' },
  tune: { placeholder: 'Title or Artist - Title', label: 'Search tune titles, or paste Artist - Title', plural: 'tunes' },
  artist: { placeholder: 'Artist name, e.g. Tenor Saw', label: 'Search artist names', plural: 'artists' },
  label: { placeholder: 'Label name, e.g. Jammys', label: 'Search label names', plural: 'labels' },
  producer: { placeholder: 'Producer name, e.g. King Jammy', label: 'Search producer names', plural: 'producers' },
};

function storedType(): SearchType {
  try {
    const v = localStorage.getItem(TYPE_KEY);
    return isSearchType(v) ? v : 'riddim';
  } catch {
    return 'riddim';
  }
}

function currentType(): SearchType {
  const v = typeRadios.find((r) => r.checked)?.value;
  return isSearchType(v) ? v : 'riddim';
}

/** Reflects the search target in the tabs, placeholder and label, and remembers it. */
function showType(type: SearchType) {
  for (const r of typeRadios) r.checked = r.value === type;
  input.placeholder = TYPE_UI[type].placeholder;
  (document.getElementById('q-label') as HTMLElement).textContent = TYPE_UI[type].label;
  try {
    localStorage.setItem(TYPE_KEY, type);
  } catch {
    /* ignore */
  }
}

function navigate(href: string, replace = false) {
  pendingY = null;
  returnedId = null;
  const url = new URL(href, location.href);
  if (url.search === location.search && url.pathname === location.pathname) {
    render();
    return;
  }
  if (replace) history.replaceState(null, '', url);
  else {
    // Remember where the visitor was, so Back returns to the same spot.
    // Opening a tune also notes which one, so Back can mark its row.
    const to = parsePagePath(url.pathname);
    history.replaceState({ ...(history.state ?? {}), y: window.scrollY, from: to?.kind === 'tune' ? to.id : null }, '');
    history.pushState(null, '', url);
  }
  render();
  window.scrollTo(0, 0);
}

const qs = (params: Record<string, string | number | null | undefined | false>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  return '/?' + p.toString();
};

/** Internal link that uses pushState but keeps ctrl/middle-click working. */
function link(href: string, text: string, cls = ''): HTMLAnchorElement {
  return h('a', {
    href,
    class: cls || null,
    onclick: ((e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    }) as EventListener,
  }, text);
}

function external(url: string | null, text: string, cls = ''): HTMLElement | null {
  const safe = safeExternal(url);
  return safe ? h('a', { href: safe, target: '_blank', rel: 'noopener noreferrer', class: cls || null }, text) : null;
}

/**
 * Page head's first line: the kind chip, and the Riddim-ID source link set
 * small at the right — credited on every page, out of the reading path.
 */
function headTop(kind: string, sourceUrl: string | null): HTMLElement {
  return h('div', { class: 'head-top' },
    h('p', { class: 'kind' }, kind),
    external(sourceUrl, 'Search data provided by Riddim-ID', 'src'),
  );
}

/** Detail-page path for a riddim / artist / producer / label reference (slug from its riddim-id.com URL). */
const listHref = (kind: ListKind, ref: Pick<Ref, 'id' | 'url'>) => refPath(kind, ref);

/** A path with query params (empty values dropped). */
function withQuery(path: string, params: Record<string, string | null | undefined | false>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** Keeps <title>, description and canonical in step with in-app navigation. */
function setHead(title: string, description: string | null, canonicalPath: string | null) {
  document.title = title;
  if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  let canon = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonicalPath) {
    if (!canon) {
      canon = h('link', { rel: 'canonical' });
      document.head.appendChild(canon);
    }
    canon.href = ORIGIN + canonicalPath;
  } else canon?.remove();
}

// ---------- shared row rendering ----------
type Row = { id: number; title: string; year: number | null; artists: Ref[]; riddim: RiddimRef | null; label?: Ref | null; is_original?: boolean };

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true', class: 'clip' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// Lucide icons (ISC licence, https://lucide.dev), inlined: no external requests.
const ICONS = {
  copy: ['M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2', 'rect:8,8,14,14,2'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  play: ['poly:6 3 20 12 6 21 6 3'],
  disc: ['circle:12,12,10', 'circle:12,12,2'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  music: ['M9 18V5l12-2v13', 'circle:6,18,3', 'circle:18,16,3'],
  star: ['poly:12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'],
} as const;
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(name: keyof typeof ICONS, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
    svg.setAttribute(k, v);
  }
  for (const d of ICONS[name]) {
    if (d.startsWith('poly:')) {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', d.slice(5));
      svg.appendChild(poly);
    } else if (d.startsWith('circle:')) {
      const [cx, cy, r] = d.slice(7).split(',');
      const c = document.createElementNS(SVG_NS, 'circle');
      for (const [k, v] of Object.entries({ cx, cy, r })) c.setAttribute(k, v);
      svg.appendChild(c);
    } else if (d.startsWith('rect:')) {
      const [x, y, w, hh, r] = d.slice(5).split(',');
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [k, v] of Object.entries({ x, y, width: w, height: hh, rx: r, ry: r })) rect.setAttribute(k, v);
      svg.appendChild(rect);
    } else {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
  }
  return svg;
}

/** Short visible label; hidden on narrow screens (icon only), always in the accessible name. */
const actLabel = (text: string, always = false) => h('span', { class: always ? 'act-text' : 'act-text act-text-wide' }, text);

/** Copy "Artist - Title" (local only, no request); brief check-mark feedback. Width never changes. */
function copyButton(text: string): HTMLButtonElement {
  const label = `Copy “${text}”`;
  const ico = h('span', { class: 'act-ico' }, icon('copy', 16));
  const btn = h('button', { type: 'button', class: 'act act-copy', title: label, 'aria-label': label }, ico, actLabel('Copy'));
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(text);
    ico.replaceChildren(icon(ok ? 'check' : 'x', 16));
    btn.classList.toggle('done', ok);
    btn.classList.toggle('fail', !ok);
    announce(ok ? `Copied: ${text}` : 'Copy failed');
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      ico.replaceChildren(icon('copy', 16));
      btn.classList.remove('done', 'fail');
    }, 1200);
  });
  return btn;
}

/** YouTube search results for "Artist Title" (new tab). */
function youtubeButton(row: Pick<Row, 'artists' | 'title'>): HTMLAnchorElement {
  const query = searchText(row.artists, row.title);
  const label = `Search YouTube for “${query}” (opens in a new tab)`;
  return h('a', {
    href: externalSearchUrl('youtube', row.artists, row.title),
    target: '_blank',
    rel: 'noopener noreferrer',
    class: 'act act-yt',
    title: label,
    'aria-label': label,
  }, icon('play', 13), actLabel('YouTube', true));
}

/**
 * Apple Music search for "Artist Title" in the visitor's own store (new tab;
 * opens the Music app where installed). Icon only in tune rows, so the
 * Riddim / Label columns keep their width; labelled on the tune page.
 */
function appleMusicButton(row: Pick<Row, 'artists' | 'title'>, withText = false): HTMLAnchorElement {
  const query = searchText(row.artists, row.title);
  const label = `Search Apple Music for “${query}” (opens in a new tab)`;
  return h('a', {
    href: externalSearchUrl('applemusic', row.artists, row.title, visitorCountry),
    target: '_blank',
    rel: 'noopener noreferrer',
    class: 'act act-am',
    title: label,
    'aria-label': label,
  }, h('span', { class: 'act-ico' }, icon('music', 16)), withText ? h('span', { class: 'act-text' }, 'Apple Music') : null);
}

/**
 * Share this page: the system share sheet where there is one (phones), else
 * copy the link. Nothing is sent anywhere by the site itself.
 */
function shareButton(title: string, url: string): HTMLButtonElement {
  const ico = h('span', { class: 'act-ico' }, icon('share', 16));
  const text = h('span', { class: 'act-text' }, 'Share');
  const btn = h('button', { type: 'button', class: 'act act-share', title: 'Share this page', 'aria-label': `Share “${title}”` }, ico, text);
  let timer = 0;
  btn.addEventListener('click', async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return; // closed the sheet
      }
    }
    const ok = await copyToClipboard(url);
    ico.replaceChildren(icon(ok ? 'check' : 'x', 16));
    text.textContent = ok ? 'Link copied' : 'Copy failed';
    btn.classList.toggle('done', ok);
    btn.classList.toggle('fail', !ok);
    announce(ok ? 'Link copied' : 'Copy failed');
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      ico.replaceChildren(icon('share', 16));
      text.textContent = 'Share';
      btn.classList.remove('done', 'fail');
    }, 1500);
  });
  return btn;
}

// ---------- Want list (this browser only; see shared/want.ts) ----------
let wants: WantItem[] = [];
function loadWants() {
  try {
    wants = parseWant(localStorage.getItem(WANT_KEY));
  } catch {
    wants = []; // storage blocked (private mode, site data off)
  }
}
function saveWants(): boolean {
  try {
    localStorage.setItem(WANT_KEY, JSON.stringify(wants));
    return true;
  } catch {
    return false;
  }
}
/** Set by the Want page to keep its count current; cleared on every render. */
let onWantChange: (() => void) | null = null;
const isWanted = (id: number) => wants.some((w) => w.id === id);

const wantNav = document.getElementById('want-nav') as HTMLAnchorElement | null;
function showWantCount() {
  onWantChange?.();
  if (!wantNav) return;
  const n = wants.length;
  const c = wantNav.querySelector('.want-n');
  if (c) c.textContent = n ? String(n) : '';
  wantNav.setAttribute('aria-label', `Want list, ${n} tune${n === 1 ? '' : 's'}`);
}

/** Adds or removes a tune; every Want button for it follows. */
function toggleWant(row: Row): boolean {
  const on = !isWanted(row.id);
  if (on) {
    if (wants.length >= WANT_MAX) {
      announce(`The want list holds up to ${WANT_MAX} tunes`);
      return false;
    }
    wants.unshift(toWantItem(row));
  } else wants = wants.filter((w) => w.id !== row.id);
  if (!saveWants()) announce('Could not save: this browser blocks site storage');
  syncWantButtons();
  showWantCount();
  announce(on ? `Added to want list: ${row.title}` : `Removed from want list: ${row.title}`);
  return true;
}

function syncWantButtons() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.act-want')) {
    const on = isWanted(Number(b.dataset.id));
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'In your want list (click to remove)' : 'Add to want list';
  }
}

/** ☆ / ★ toggle. Kept in this browser only. */
function wantButton(row: Row, withText = false): HTMLButtonElement {
  const on = isWanted(row.id);
  const btn = h('button', {
    type: 'button', class: 'act act-want', 'data-id': row.id, 'aria-pressed': String(on),
    title: on ? 'In your want list (click to remove)' : 'Add to want list',
    'aria-label': `Want “${row.title}”`,
  }, h('span', { class: 'act-ico' }, icon('star', 16)), withText ? h('span', { class: 'act-text' }, 'Want') : actLabel('Want'));
  btn.addEventListener('click', () => toggleWant(row));
  return btn;
}

loadWants();
showWantCount();
wantNav?.addEventListener('click', (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  navigate('/want');
});
// Another tab changed the list: follow it.
window.addEventListener('storage', (e) => {
  if (e.key !== WANT_KEY && e.key !== null) return;
  loadWants();
  syncWantButtons();
  showWantCount();
});

// ---------- Dig: one shared popover menu for every row ----------
// Built lazily, positioned with fixed coordinates (no layout shift), filled
// only when opened; links are plain search URLs made in the browser.
/** Visitor country stamped on <html data-country> by the Worker (no request); null if unknown. Read once. */
const visitorCountry = normalizeCountry(document.documentElement.dataset.country);
/** Dig providers for this visitor, resolved once per page load. */
const digProviders = digProvidersFor(visitorCountry);

let digMenu: HTMLDivElement | null = null;
let digOwner: HTMLButtonElement | null = null;

function positionDig() {
  if (!digMenu || !digOwner) return;
  const r = digOwner.getBoundingClientRect();
  const m = digMenu.getBoundingClientRect();
  const gap = 4;
  const edge = 8;
  let top = r.bottom + gap;
  if (top + m.height > innerHeight - edge && r.top - gap - m.height >= edge) top = r.top - gap - m.height; // flip up
  top = Math.max(edge, Math.min(top, innerHeight - m.height - edge));
  let left = r.right - m.width; // align to the button's right edge
  left = Math.max(edge, Math.min(left, innerWidth - m.width - edge));
  digMenu.style.top = `${Math.round(top)}px`;
  digMenu.style.left = `${Math.round(left)}px`;
}

function closeDig(returnFocus = false) {
  if (!digMenu || !digOwner) return;
  const owner = digOwner;
  digOwner = null;
  digMenu.hidden = true;
  digMenu.replaceChildren();
  owner.setAttribute('aria-expanded', 'false');
  owner.classList.remove('open');
  if (returnFocus) owner.focus();
}

function ensureDigMenu(): HTMLDivElement {
  if (digMenu) return digMenu;
  const menu = h('div', { id: 'dig-menu', class: 'dig-menu', role: 'menu', 'aria-label': 'Dig for records', hidden: true });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDig(true);
    } else if (e.key === 'Tab') closeDig(false);
  });
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) closeDig(false); // the link itself opens in a new tab
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (digOwner && !menu.contains(e.target as Node) && !digOwner.contains(e.target as Node)) closeDig(false);
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && digOwner) closeDig(true);
  });
  window.addEventListener('resize', () => closeDig(false));
  window.addEventListener('scroll', positionDig, { passive: true, capture: true });
  document.body.appendChild(menu);
  digMenu = menu;
  return menu;
}

function openDig(btn: HTMLButtonElement, row: Pick<Row, 'artists' | 'title'>, focusFirst: boolean) {
  closeDig(false);
  const menu = ensureDigMenu();
  const query = searchText(row.artists, row.title);
  menu.replaceChildren(
    h('p', { class: 'dig-head', 'aria-hidden': 'true' }, query),
    ...digProviders.map((s) =>
      h('a', {
        role: 'menuitem',
        href: s.buildSearchUrl(query),
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `Search ${s.name} for “${query}” (opens in a new tab)`,
      }, h('span', { class: 'dig-name' }, s.name), h('span', { class: 'dig-host', 'aria-hidden': 'true' }, new URL(s.buildSearchUrl('')).hostname.replace(/^www\./, ''))),
    ),
  );
  menu.hidden = false;
  digOwner = btn;
  btn.setAttribute('aria-expanded', 'true');
  btn.classList.add('open');
  positionDig();
  if (focusFirst) menu.querySelector<HTMLAnchorElement>('[role="menuitem"]')?.focus();
}

/** The Dig shops as plain links (tune page): same providers and query as the menu. */
function digLinks(row: Pick<Row, 'artists' | 'title'>): HTMLElement {
  const query = searchText(row.artists, row.title);
  return h('div', { class: 'dig-open', role: 'group', 'aria-label': `Dig: search record shops for “${query}”` },
    h('p', { class: 'dig-open-head' }, icon('disc', 15), ' Dig'),
    h('p', { class: 'acts acts-lg' },
      ...digProviders.map((s) =>
        h('a', {
          class: 'act act-dig',
          href: s.buildSearchUrl(query),
          target: '_blank',
          rel: 'noopener noreferrer',
          title: `Search ${s.name} for “${query}” (opens in a new tab)`,
        }, h('span', { class: 'act-text' }, s.name)),
      ),
    ),
  );
}

function digButton(row: Pick<Row, 'artists' | 'title'>): HTMLButtonElement {
  const query = searchText(row.artists, row.title);
  const label = `Dig: search record shops for “${query}”`;
  const btn = h('button', {
    type: 'button',
    class: 'act act-dig',
    title: label,
    'aria-label': label,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-controls': 'dig-menu',
  }, icon('disc', 16), actLabel('Dig'));
  btn.addEventListener('click', (e) => {
    if (digOwner === btn) closeDig(false);
    else openDig(btn, row, e.detail === 0); // detail 0 = keyboard (Enter/Space): move focus into the menu
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openDig(btn, row, true);
    }
  });
  return btn;
}

/** YouTube → Apple Music → Copy → Dig → Want. Tune details are reached by clicking the title. */
function rowActions(row: Row): HTMLElement[] {
  return [youtubeButton(row), appleMusicButton(row), copyButton(copyText(row.artists, row.title)), digButton(row), wantButton(row)];
}

type TableOpts = { hideRiddim?: boolean; hideLabel?: boolean };

function tuneRow(row: Row, opts: TableOpts = {}): HTMLTableRowElement {
  const dash = () => h('span', { class: 'muted' }, '—');
  // The whole row opens the tune page (see onRowClick); the title is the real
  // link (keyboard, screen readers, middle-click). Artist / riddim / label are
  // plain text here — the tune page links to them.
  return h('tr', { class: row.is_original ? 'orig' : null },
    h('td', { class: 'c-artist' }, row.artists.length ? artistNames(row.artists) : dash()),
    h('td', { class: 'c-title' },
      link(tunePath(row), row.title, 'tune-link'),
      row.is_original ? h('span', { class: 'badge', title: 'The original tune this riddim is named after' }, 'Original') : null,
    ),
    opts.hideRiddim ? null : h('td', { class: 'c-riddim' }, row.riddim ? row.riddim.name : dash()),
    opts.hideLabel ? null : h('td', { class: 'c-label' }, row.label ? row.label.name : dash()),
    h('td', { class: 'c-year' }, row.year ? String(row.year) : ''),
    h('td', { class: 'c-act' }, h('span', { class: 'acts' }, ...rowActions(row))),
  );
}

/**
 * Row click → the row's tune link. Clicks on buttons / links inside the row
 * keep their own behaviour, and a drag that selected text does nothing.
 */
function onRowClick(e: MouseEvent) {
  const target = e.target as Element;
  // YouTube / Copy / Dig / Want: the row gets the same mark as one come back to,
  // so it is easy to find again (e.g. after the YouTube tab).
  const act = target.closest('.act');
  if (act) {
    const id = rowTuneId(act.closest('tr'));
    if (id !== null) {
      returnedId = id;
      markReturned();
    }
    return;
  }
  if (target.closest('a, button, input, label, summary')) return;
  const tr = target.closest('tr');
  const a = tr?.querySelector<HTMLAnchorElement>('a.tune-link');
  if (!a || getSelection()?.toString()) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
    window.open(a.href, '_blank', 'noopener');
    return;
  }
  if (e.button !== 0) return;
  navigate(a.getAttribute('href')!);
}

const SORT_NAMES: Record<SortKey, string> ={ artist: 'Artist', title: 'Title', riddim: 'Riddim', label: 'Label', year: 'Year' };

interface TuneTable {
  el: HTMLElement;
  /** Appends rows (e.g. a further page); re-paints when a sort or filter is active. */
  add(rows: Row[]): void;
  /** Current column sort, or null for the source order. */
  sort(): { key: SortKey; dir: SortDir } | null;
  /** Shows only rows whose Artist / Title / Label contain every word of `query` ("" = all). */
  setFilter(query: string): void;
  /** Rows held / rows currently shown. */
  counts(): { held: number; shown: number };
}

/**
 * Tune table. Column headers are sort buttons (click: ascending, again: descending).
 * Sorting and filtering are client-side over the rows held by the table — no
 * requests of their own (the list page loads the remaining pages when needed).
 */
function tuneTable(
  rows: Row[],
  opts: TableOpts & { sort?: { key: SortKey; dir: SortDir } | null; onSort?: () => void } = {},
): TuneTable {
  const all = [...rows];
  let sort = opts.sort ?? null;
  let words: string[] = [];
  let shown = all.length;
  const tbody = h('tbody', { class: 'rows-link' });
  tbody.addEventListener('click', onRowClick);
  tbody.addEventListener('auxclick', (e) => { if (e.button === 1) onRowClick(e); });
  const ths = new Map<SortKey, HTMLTableCellElement>();
  const cols = 4 + (opts.hideRiddim ? 0 : 1) + (opts.hideLabel ? 0 : 1);

  const paint = () => {
    closeDig(false); // rows are about to be replaced
    const kept = words.length ? all.filter((r) => matches(r, words)) : all;
    const ordered = sort ? sortRows(kept, sort.key, sort.dir) : kept;
    shown = ordered.length;
    tbody.replaceChildren(
      ...(ordered.length
        ? ordered.map((r) => tuneRow(r, opts))
        : [h('tr', { class: 'empty' }, h('td', { colspan: cols }, 'No tunes match this filter.'))]),
    );
    markReturned(); // rows were rebuilt: put the mark back
    for (const [key, th] of ths) {
      const active = sort?.key === key;
      th.setAttribute('aria-sort', active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      (th.querySelector('button') as HTMLButtonElement).title = active
        ? `Sorted by ${SORT_NAMES[key]} (${sort!.dir === 'asc' ? 'A–Z / oldest first' : 'Z–A / newest first'}). Click to reverse.`
        : `Sort by ${SORT_NAMES[key]}`;
    }
  };

  const sortHead = (key: SortKey) => {
    const btn = h('button', { type: 'button', class: 'sort-btn' }, SORT_NAMES[key],
      // ▲ over ▼ on every column; the active direction is coloured via th[aria-sort].
      h('span', { class: 'sort-ind', 'aria-hidden': 'true' }, h('span', { class: 'up' }, '▲'), h('span', { class: 'down' }, '▼')));
    btn.addEventListener('click', () => {
      sort = sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
      paint();
      announce(`Sorted by ${SORT_NAMES[key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`);
      opts.onSort?.();
    });
    const th = h('th', { scope: 'col', class: `c-${key}` }, btn);
    ths.set(key, th);
    return th;
  };
  const plainHead = (cls: string, text: string) => h('th', { scope: 'col', class: cls }, h('span', { class: 'sr-only' }, text));

  const el = h('div', { class: 'tunes-wrap' },
    h('table', { class: 'tunes' },
      h('thead', {},
        h('tr', {},
          sortHead('artist'),
          sortHead('title'),
          opts.hideRiddim ? null : sortHead('riddim'),
          opts.hideLabel ? null : sortHead('label'),
          sortHead('year'),
          plainHead('c-act', 'Actions'),
        ),
      ),
      tbody,
    ),
  );
  paint();
  return {
    el,
    add(more) {
      all.push(...more);
      if (sort || words.length) paint();
      else {
        append(tbody, more.map((r) => tuneRow(r, opts)));
        shown = all.length;
      }
    },
    sort: () => sort,
    setFilter(query) {
      const next = filterWords(query);
      if (next.join(' ') === words.join(' ')) return;
      words = next;
      paint();
    },
    counts: () => ({ held: all.length, shown }),
  };
}

// ---------- states ----------
function loading(msg: string) {
  main.replaceChildren(h('p', { class: 'state', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), msg));
}

function showError(err: unknown, retry: () => void) {
  if ((err as Error).name === 'AbortError') return;
  const msg = err instanceof ApiFailure ? err.message : 'Something went wrong.';
  main.replaceChildren(
    h('div', { class: 'state error', role: 'alert' },
      h('p', {}, msg),
      h('button', { type: 'button', onclick: retry as EventListener }, 'Try again'),
    ),
  );
}

// ---------- views ----------
function renderHome() {
  document.body.classList.add('home');
  setHead(HOME_TITLE, HOME_DESCRIPTION, '/');
  main.replaceChildren();
  input.value = '';
  // Autofocus only with a mouse/trackpad; on phones it would pop the keyboard.
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

const NO_MATCH_TIP: Record<SearchType, string> = {
  riddim: 'Try another spelling or fewer words. Riddim names often drop the word “Riddim”.',
  tune: 'Tune search looks at titles. “Artist - Title” or “Artist Title” also works (beta), or switch to Artist.',
  artist: 'Try another spelling, or the artist’s best-known name.',
  label: 'Try another spelling, or the label’s short name.',
  producer: 'Try another spelling, or the name the producer is credited under (e.g. Prince Jammy / King Jammy).',
};

function countNote(n: number, limit: number, noun: string, extra = ''): string {
  return n >= limit
    ? `Top ${limit} ${noun} (search returns at most ${limit}). Refine the search to narrow it down.${extra}`
    : `${n} ${n === 1 ? noun.replace(/s$/, '') : noun}.${extra}`;
}

function namesTable(type: Exclude<SearchType, 'tune'>, hits: NameHit[]): HTMLElement {
  const isRiddim = type === 'riddim';
  return h('div', { class: 'tunes-wrap' },
    h('table', { class: 'names-table' },
      h('thead', {},
        h('tr', {},
          h('th', { scope: 'col' }, TYPE_UI[type].plural.replace(/^./, (c) => c.toUpperCase()).replace(/s$/, '')),
          isRiddim ? h('th', { scope: 'col', class: 'c-year' }, 'Year') : null,
          isRiddim ? h('th', { scope: 'col', class: 'c-note' }, 'Notes') : null,
        ),
      ),
      h('tbody', {},
        ...hits.map((n) =>
          h('tr', {},
            h('td', { class: 'c-name' }, link(listHref(type, n), n.name)),
            isRiddim ? h('td', { class: 'c-year' }, n.year ? String(n.year) : '') : null,
            isRiddim
              ? h('td', { class: 'c-note muted' },
                  [n.version_of ? `Version of ${n.version_of}` : '', n.matched_name && n.matched_name !== n.name ? `matched “${n.matched_name}”` : '']
                    .filter(Boolean)
                    .join(' · '),
                )
              : null,
          ),
        ),
      ),
    ),
  );
}

async function renderSearch(q: string, type: SearchType, signal: AbortSignal) {
  setHead(`${q} (${type}) — RIDDIM.LOVE`, null, null); // search views are not canonical pages
  input.value = q;
  if (q.length < 2) {
    main.replaceChildren(h('p', { class: 'state' }, 'Type at least 2 characters.'));
    return;
  }
  const pair = type === 'tune' ? splitArtistTitle(q) : null;
  if (pair && (await artistTitleSearch(pair, signal))) return;
  if (signal.aborted) return;
  loading(type === 'tune' ? 'Searching tune titles…' : `Searching ${TYPE_UI[type].plural}…`);
  const res = await api<SearchResult>('/api/search?' + new URLSearchParams({ type, q }), signal);
  if (signal.aborted) return;

  const n = type === 'tune' ? res.tunes.length : res.names.length;
  // No title matched and no separator: maybe "Artist Title" (beta).
  if (!n && type === 'tune' && !pair && /\s/.test(q.trim()) && (await artistPrefixSearch(q, signal))) return;
  if (signal.aborted) return;
  if (!n) {
    await renderNoMatch(res.query, type, pair ? `No artist page is named “${pair.primary}” either. Check the spelling, or search the title alone.` : NO_MATCH_TIP[type], signal);
    return;
  }

  let body: HTMLElement;
  let note: string;
  if (type === 'tune') {
    note = countNote(n, res.limit, 'title matches', ' Searching tune titles only. Click a column to sort.');
    // Search hits carry no label, so the default Label → Artist → Title order is Artist → Title.
    body = tuneTable(res.tunes.map((t: TuneHit) => ({ ...t, label: null })), { hideLabel: true, sort: { key: 'artist', dir: 'asc' } }).el;
  } else {
    note = countNote(n, res.limit, TYPE_UI[type].plural, ` Open one to see all its tunes.`);
    body = namesTable(type, res.names.filter((x) => x.type === type));
  }
  main.replaceChildren(
    h('section', { class: 'results', 'aria-label': `${TYPE_UI[type].plural} matching ${res.query}` },
      h('div', { class: 'section-head' },
        h('h2', {}, type === 'tune' ? 'Tunes · title search' : TYPE_UI[type].plural),
        h('p', { class: 'muted' }, note),
      ),
      body,
    ),
  );
  announce(`${n} ${TYPE_UI[type].plural} found`);
}

/**
 * Beta: "Artist - Title" in the tune search. The upstream search matches tune
 * titles only, so look the artist up by name and open that artist's page
 * filtered by the title (whole list, no 50-hit cap). Two requests at most
 * here (artist search, then title search as the fallback).
 * Returns true when it rendered something; false → run the plain title search.
 */
const SUGGEST_MAX = 6;
const TYPE_NAME: Record<SearchType, string> = { riddim: 'Riddim', tune: 'Tune', artist: 'Artist', label: 'Label', producer: 'Producer' };

/**
 * Nothing matched: one search across all four types (one request, only now),
 * shown as "Did you mean" links plus one-click re-searches in the types that
 * did match, and a button back into the search box.
 */
async function renderNoMatch(q: string, type: SearchType, tip: string, signal: AbortSignal) {
  const edit = h('button', { type: 'button', class: 'retry' }, 'Edit search');
  edit.addEventListener('click', () => {
    input.focus();
    input.select();
  });
  const head = [
    h('p', {}, type === 'tune' ? `No tune titles match “${q}”.` : `No ${TYPE_UI[type].plural} match “${q}”.`),
  ];
  const paint = (extra: HTMLElement[]) => main.replaceChildren(h('div', { class: 'state no-match' }, ...head, ...extra, h('p', { class: 'muted' }, tip), h('p', {}, edit)));
  paint([h('p', { class: 'muted' }, 'Looking in riddims, tunes, artists and labels…')]);

  let s: SuggestResult | null = null;
  try {
    s = await api<SuggestResult>('/api/suggest?' + new URLSearchParams({ q }), signal);
  } catch {
    /* suggestions are optional */
  }
  if (signal.aborted) return;

  type Item = { type: SearchType; el: HTMLElement };
  const items: Item[] = [
    ...(s?.names ?? []).filter((x) => x.type !== type && isSearchType(x.type)).map((x): Item => ({
      type: x.type as SearchType,
      el: h('li', {}, h('span', { class: 'badge' }, TYPE_NAME[x.type as SearchType]), ' ', link(listHref(x.type as ListKind, x), x.name), x.year ? h('span', { class: 'muted' }, ` ${x.year}`) : null),
    })),
    ...(type === 'tune' ? [] : (s?.tunes ?? []).map((t): Item => ({
      type: 'tune',
      el: h('li', {}, h('span', { class: 'badge' }, 'Tune'), ' ', link(tunePath(t), displayText(t.artists, t.title)), t.year ? h('span', { class: 'muted' }, ` ${t.year}`) : null),
    }))),
  ];
  if (!items.length) {
    paint([]);
    announce('No matches');
    return;
  }
  // Re-search buttons for each type that turned something up (in upstream order).
  const types = [...new Set(items.map((i) => i.type))];
  const again = h('p', { class: 'search-in' }, 'Search “', q, '” in: ',
    ...types.map((t) => {
      const b = h('button', { type: 'button', class: 'chip' }, TYPE_NAME[t]);
      b.addEventListener('click', () => {
        showType(t);
        navigate(qs({ type: t, q }), true);
      });
      return b;
    }),
  );
  paint([
    h('p', { class: 'did-you-mean' }, 'Did you mean:'),
    h('ul', { class: 'suggest' }, ...items.slice(0, SUGGEST_MAX).map((i) => i.el)),
    again,
  ]);
  announce(`No matches. ${Math.min(items.length, SUGGEST_MAX)} suggestions.`);
}

/**
 * Beta: "Artist Title" with no separator, tried only after the title search
 * found nothing (one or two more requests). The artist search keys on the
 * first words of the query, so "Artist Title" is tried first; if no name fits,
 * the last word alone is looked up for "Title Artist" ("If You Are Not Luciano").
 * The whole query being an artist's name opens that artist's page.
 */
async function artistPrefixSearch(q: string, signal: AbortSignal): Promise<boolean> {
  loading('Looking for an artist name…');
  const res = await api<SearchResult>('/api/search?' + new URLSearchParams({ type: 'artist', q }), signal);
  if (signal.aborted) return true;
  const hits = res.names.filter((n) => n.type === 'artist');
  const whole = hits.filter((n) => sameName(q, n.name) || sameName(q, n.matched_name));
  if (whole.length === 1) {
    navigate(listHref('artist', whole[0]), true);
    return true;
  }
  let split = splitByArtistPrefix(q, hits);
  let pool = hits;
  if (!split) {
    // "Title Artist": the artist search keys on first words, so look up the
    // last word alone (one more request) and match names the query ends with.
    const last = q.trim().split(/\s+/).pop()!;
    if (last.length < 2) return false;
    loading('Looking for an artist name…');
    const r2 = await api<SearchResult>('/api/search?' + new URLSearchParams({ type: 'artist', q: last }), signal);
    if (signal.aborted) return true;
    pool = r2.names.filter((n) => n.type === 'artist');
    split = splitByArtistSuffix(q, pool);
  }
  if (!split) return false;
  const name = split.name;
  showArtistMatches(pool.filter((n) => sameName(name, n.name)), name, split.title);
  return true;
}

/** One artist → open their page filtered by the title; several → pick one. */
function showArtistMatches(exact: NameHit[], name: string, title: string) {
  const artistHref = (n: NameHit) => withQuery(listHref('artist', n), { f: title });
  if (exact.length === 1) {
    navigate(artistHref(exact[0]), true); // Back returns to where the search started
    return;
  }
  main.replaceChildren(
    h('section', { class: 'results', 'aria-label': `Artists named ${name}` },
      h('div', { class: 'section-head' },
        h('h2', {}, 'Artist - Title ', h('span', { class: 'badge' }, 'Beta')),
        h('p', { class: 'muted' }, `${exact.length} artists are named “${name}”. Pick one to see “${title}” in their tunes.`),
      ),
      h('ul', { class: 'pick-list' }, ...exact.map((n) => h('li', {}, link(artistHref(n), n.name)))),
    ),
  );
  announce(`${exact.length} artists named ${name}`);
}

async function artistTitleSearch(pair: ArtistTitle, signal: AbortSignal): Promise<boolean> {
  // "Artist - Title" first, then the other way round ("Title - Artist"):
  // one artist lookup each, the second only when the first finds no name.
  for (const p of [pair, swapArtistTitle(pair)]) {
    loading(`Looking up ${p.primary}…`);
    const res = await api<SearchResult>('/api/search?' + new URLSearchParams({ type: 'artist', q: p.primary }), signal);
    if (signal.aborted) return true;
    const exact = res.names.filter((n) => n.type === 'artist' && (sameName(p.primary, n.name) || sameName(p.primary, n.matched_name)));
    if (exact.length) {
      showArtistMatches(exact, p.primary, p.title);
      return true;
    }
  }

  // No artist by that name: search the title part, keep hits by that artist.
  loading('Searching tune titles…');
  const t = await api<SearchResult>('/api/search?' + new URLSearchParams({ type: 'tune', q: pair.title }), signal);
  if (signal.aborted) return true;
  const words = filterWords(pair.artist);
  const byArtist = t.tunes.filter((x) => matches({ artists: x.artists, title: '' }, words));
  const rows = byArtist.length ? byArtist : t.tunes;
  if (!rows.length) return false;
  const note = byArtist.length
    ? `No artist page is named exactly “${pair.primary}”; showing title matches for “${pair.title}” by matching artists.`
    : `No artist named “${pair.primary}” was found; showing all title matches for “${pair.title}”.`;
  main.replaceChildren(
    h('section', { class: 'results', 'aria-label': `Tunes matching ${pair.title}` },
      h('div', { class: 'section-head' },
        h('h2', {}, 'Artist - Title ', h('span', { class: 'badge' }, 'Beta')),
        h('p', { class: 'muted' }, note),
      ),
      tuneTable(rows.map((x: TuneHit) => ({ ...x, label: null })), { hideLabel: true, sort: { key: 'artist', dir: 'asc' } }).el,
    ),
  );
  announce(`${rows.length} tunes found`);
  return true;
}

const KIND_LABEL: Record<ListKind, string> ={ riddim: 'Riddim', artist: 'Artist', producer: 'Producer', label: 'Label' };
const KIND_PATH: Record<ListKind, string> = { riddim: 'riddims', artist: 'artists', producer: 'producers', label: 'labels' };

function nameFromTunes(kind: ListKind, id: number, tunes: Tune[]): Ref | null {
  for (const t of tunes) {
    const pool = kind === 'artist' ? t.artists : kind === 'producer' ? t.producers : kind === 'label' ? (t.label ? [t.label] : []) : t.riddim ? [t.riddim] : [];
    const r = pool.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

async function renderList(route: Extract<Route, { view: 'list' }>, signal: AbortSignal) {
  const { kind, id } = route;
  loading('Loading tunes…');
  // Filtering and sorting happen in the browser over the whole list, so the
  // API is asked for the plain list only. (Re-licks are separate riddims the
  // visitor already picked between in search; they are linked from the header.)
  const params: Record<string, string> = {};
  const base = `/api/${KIND_PATH[kind]}/${id}/tunes`;
  const [list, riddim] = await Promise.all([
    api<TuneList>(base + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''), signal),
    kind === 'riddim' ? api<Riddim>(`/api/riddims/${id}`, signal) : Promise.resolve(null),
  ]);
  if (signal.aborted) return;

  const ref = riddim ?? nameFromTunes(kind, id, list.tunes);
  const name = ref?.name ?? `${KIND_LABEL[kind]} #${id}`;
  // Same title / description / H1 rules as the server-rendered page.
  const pm: PageMeta =
    kind === 'riddim' && riddim
      ? riddimMeta(riddim, list.total, list.tunes)
      : kind === 'label'
        ? labelMeta({ name, founded_year: null }, list.tunes)
        : personMeta(kind === 'producer' ? 'producer' : 'artist', name, list.tunes);
  setHead(pm.title, pm.description, ref ? listHref(kind, ref) : location.pathname);
  input.value = '';

  const head = h('header', { class: 'list-head' },
    headTop(KIND_LABEL[kind], ref?.url ?? null),
    h('h1', {}, pm.h1),
  );
  if (riddim) {
    // No year / producer here: a riddim list also holds later re-licks under the
    // same name (other years, other producers), so the original's facts mislead.
    if (riddim.version_of) head.appendChild(h('p', { class: 'facts' }, 'Version of ', link(listHref('riddim', riddim.version_of), riddim.version_of.name)));
    // Original tune(s): the year shown is the tune's, never the riddim's.
    const originals = (riddim.original_tunes ?? []).slice(0, ORIGINAL_TUNES_MAX);
    if (originals.length) {
      const parts: (Node | string)[] = [`Original tune${originals.length > 1 ? 's' : ''}: `];
      originals.forEach((t, i) => {
        if (i) parts.push('; ');
        parts.push(link(tunePath(t), originalTuneText(t)));
      });
      head.appendChild(h('p', { class: 'facts orig-tune' }, ...parts));
    }
    const alts = altNames(riddim.name, riddim.alternate_names);
    if (alts.shown.length) head.appendChild(h('p', { class: 'facts muted' }, 'Also known as ' + alts.shown.join(', ') + (alts.more ? ` +${alts.more} more` : '')));
    if (riddim.versions.length) {
      head.appendChild(
        h('details', { class: 'versions', open: true },
          h('summary', {}, `${riddim.versions.length} version${riddim.versions.length === 1 ? '' : 's'}`),
          h('ul', { class: 'chips' },
            ...riddim.versions.map((v) => h('li', {}, link(listHref('riddim', v), v.name), v.year ? h('span', { class: 'muted' }, ` ${v.year}`) : null)),
          ),
        ),
      );
    }
  }

  // ---- controls: live filter (Artist / Title / Label)
  const controls = h('form', { class: 'controls', role: 'search', 'aria-label': 'Filter this list' });
  const filterLabel = kind === 'label' ? 'Filter by artist or title' : 'Filter by artist, title or label';
  const filter = h('input', {
    type: 'search', name: 'f', placeholder: filterLabel, 'aria-label': filterLabel,
    maxlength: 100, value: route.f, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
  });
  append(controls, [filter]);
  controls.addEventListener('submit', (e) => {
    e.preventDefault();
    filter.blur(); // filtering is live; Enter just closes the keyboard
  });

  // ---- the whole list: first page painted at once, the rest loaded right
  // after in the background (upstream pages are 100 tunes; the Worker caches
  // each page for 5 minutes, so a popular list costs Riddim-ID little)
  const CAP = 1500; // largest riddim ~520 tunes; covers nearly every label too
  const count = h('p', { class: 'count muted', role: 'status' });
  const more = h('button', { type: 'button', class: 'more' }, 'Load more');
  let cursor = list.next_cursor;
  let held = list.tunes.length;
  let bulk: Promise<void> | null = null;
  let failed = false;
  const total = () => list.total ?? (cursor ? null : held);

  async function loadPage(): Promise<boolean> {
    if (!cursor) return false;
    const page = await api<TuneList>(base + '?' + new URLSearchParams({ ...params, cursor }));
    if (signal.aborted) return false;
    table.add(page.tunes);
    held += page.tunes.length;
    cursor = page.next_cursor;
    return true;
  }

  /** Loads the remaining pages (up to CAP) in the background; idempotent. */
  function loadAll(quiet = false) {
    if (bulk || !cursor || held >= CAP) return;
    failed = false;
    bulk = (async () => {
      try {
        while (cursor && held < CAP && !signal.aborted) {
          await loadPage();
          setCount();
        }
      } catch (e) {
        failed = true;
        console.error(e);
      } finally {
        bulk = null;
        if (!signal.aborted) {
          setCount();
          restoreScroll(); // a sorted / filtered list only settles once every page is in
          if (failed || !quiet) announce(failed ? 'Could not load every tune' : `All ${held} tunes loaded`);
        }
      }
    })();
    setCount();
  }

  const setCount = () => {
    const t = total();
    const { shown } = table.counts();
    const q = filter.value.trim();
    const parts: string[] = [];
    parts.push(q ? `${shown} of ${t ?? held} tunes match “${q}”` : t != null ? `${held} of ${t} tunes` : `${held} tunes`);
    const active = table.sort();
    if (active) parts.push(`sorted by ${SORT_NAMES[active.key]} ${active.dir === 'asc' ? '▲' : '▼'}`);
    if (bulk) parts.push(`loading all tunes… ${held}${t != null ? `/${Math.min(t, CAP)}` : ''}`);
    else if (failed) parts.push('could not load every tune — try again');
    else if (cursor && held >= CAP) parts.push(`showing the first ${CAP.toLocaleString('en')}`);
    count.textContent = parts.join(' · ');
    // Everything loads on its own; "Load more" is left as the retry after a failure.
    more.hidden = !cursor || held >= CAP || !!bulk || !!active || !!q;
  };

  // Sort and filter live in the URL (?sort=-year&f=…), so Back from a tune
  // page, a reload or a shared link brings the same view back.
  const syncUrl = () =>
    history.replaceState(history.state, '', withQuery(location.pathname, { f: filter.value.trim() || null, sort: formatSort(table.sort()) }));
  const table: TuneTable = tuneTable(list.tunes, {
    hideRiddim: kind === 'riddim',
    hideLabel: kind === 'label',
    sort: route.sort,
    onSort: () => {
      loadAll();
      setCount();
      syncUrl();
    },
  });

  let urlTimer = 0;
  const applyFilter = () => {
    table.setFilter(filter.value);
    if (filter.value.trim()) loadAll();
    setCount();
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      // Keep the filter in the URL (shareable) without re-rendering the page.
      syncUrl();
    }, 300);
  };
  filter.addEventListener('input', applyFilter);
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filter.value) {
      e.preventDefault();
      e.stopPropagation();
      filter.value = '';
      applyFilter();
    }
  });
  if (route.f) applyFilter();
  setCount();

  more.addEventListener('click', async () => {
    more.disabled = true;
    more.textContent = 'Loading…';
    try {
      const n = held;
      await loadPage();
      announce(`${held - n} more tunes loaded`);
      more.textContent = 'Load more';
    } catch (e) {
      announce('Could not load more');
      more.textContent = 'Failed — try again';
      console.error(e);
    }
    more.disabled = false;
    setCount();
  });

  main.replaceChildren(head, controls, count, list.tunes.length ? table.el : h('p', { class: 'state' }, 'No tunes listed.'), more);
  announce(`${name}: ${count.textContent}`);
  loadAll(true);
}

function joinLinks(refs: Ref[], kind: ListKind): (Node | string)[] {
  const out: (Node | string)[] = [];
  // Same " & " joining as artistNames() and the server-rendered page.
  refs.forEach((r, i) => {
    if (i) out.push(' & ');
    out.push(link(listHref(kind, r), r.name));
  });
  return out;
}

async function renderTune(id: number, signal: AbortSignal) {
  loading('Loading tune…');
  const t = await api<Tune>(`/api/tunes/${id}`, signal);
  if (signal.aborted) return;
  const text = displayText(t.artists, t.title);
  const tm = tuneMeta(t);
  setHead(tm.title, tm.description, tunePath(t));
  const rows: [string, (Node | string)[]][] = [
    ['Artist', t.artists.length ? joinLinks(t.artists, 'artist') : ['—']],
    ['Title', [t.title, t.is_original ? h('span', { class: 'badge' }, 'Original') : '']],
    ['Riddim', t.riddim ? [link(listHref('riddim', t.riddim), t.riddim.name), t.riddim.version_of ? h('span', { class: 'muted' }, ` (version of ${t.riddim.version_of})`) : ''] : ['—']],
    ['Label', t.label ? [link(listHref('label', t.label), t.label.name)] : ['—']],
    ['Producer', t.producers.length ? joinLinks(t.producers, 'producer') : ['—']],
    ['Year', [t.year ? String(t.year) : '—']],
  ];
  main.replaceChildren(
    h('article', { class: 'tune' },
      headTop('Tune', t.riddim?.url ?? 'https://riddim-id.com/'),
      h('h1', { class: 'at' }, text),
      h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, ...v)])),
      // Dig is laid out open here (no menu to open): one click to a shop.
      h('p', { class: 'acts acts-lg' }, youtubeButton(t), appleMusicButton(t, true), copyButton(copyText(t.artists, t.title)), wantButton(t, true), shareButton(text, ORIGIN + tunePath(t))),
      digLinks(t),
    ),
  );
}

/**
 * Want list: read from this browser, no requests. Removing a tune keeps its
 * row (★ → ☆) until the next visit, so a slip is one click to undo.
 */
function renderWant() {
  setHead(`Want list | RIDDIM.LOVE`, 'Tunes you want, kept in this browser.', null);
  input.value = '';
  loadWants();
  const items = [...wants];
  const count = h('p', { class: 'count', role: 'status' });
  const setCount = () => {
    const n = wants.length;
    count.textContent = n ? `${n} tune${n === 1 ? '' : 's'} · saved in this browser only` : 'Saved in this browser only';
  };
  setCount();

  // Copy the whole list as plain lines for a memo app.
  const copyAll = h('button', { type: 'button', class: 'act act-copy act-copy-all' }, h('span', { class: 'act-ico' }, icon('copy', 16)), h('span', { class: 'act-text' }, 'Copy list as text'));
  copyAll.addEventListener('click', async () => {
    const current = wants; // what is still wanted now, newest first
    const ok = current.length > 0 && (await copyToClipboard(wantText(current)));
    copyAll.classList.toggle('done', ok);
    copyAll.classList.toggle('fail', !ok);
    (copyAll.lastChild as HTMLElement).textContent = ok ? `Copied ${current.length} line${current.length === 1 ? '' : 's'}` : current.length ? 'Copy failed' : 'Nothing to copy';
    announce((copyAll.lastChild as HTMLElement).textContent!);
    window.setTimeout(() => {
      copyAll.classList.remove('done', 'fail');
      (copyAll.lastChild as HTMLElement).textContent = 'Copy list as text';
    }, 1800);
  });

  const head = h('header', { class: 'list-head' },
    h('div', { class: 'head-top' }, h('p', { class: 'kind' }, 'Want')),
    h('h1', {}, 'Want list'),
    h('p', { class: 'acts acts-lg want-tools' }, copyAll),
  );
  const rows: Row[] = items.map((w) => ({
    id: w.id, title: w.title, year: w.year,
    artists: w.artists.map((a) => ({ ...a, url: null })),
    riddim: w.riddim ? { ...w.riddim, url: null, version_of: null } : null,
    label: w.label ? { ...w.label, url: null } : null,
  }));
  const body = rows.length
    ? tuneTable(rows).el
    : h('p', { class: 'state' }, 'Nothing here yet. Press ', h('span', { class: 'want-star', 'aria-hidden': 'true' }, '☆'), ' Want on any tune to keep it here.');
  // Keep the count in step while tunes are removed / re-added on this page.
  onWantChange = setCount;
  main.replaceChildren(head, count, body);
  announce(`Want list: ${count.textContent}`);
}

// ---------- render loop ----------
/**
 * Analytics for in-app page changes (see public/analytics.js). The first load
 * is counted by Google Tag Manager itself; later views are reported once the
 * view has rendered, so the page title is the new one.
 */
let initialView = true;
function trackPageView(signal: AbortSignal) {
  if (signal.aborted) return;
  if (initialView) {
    initialView = false;
    return;
  }
  (window as unknown as { rlPageView?: () => void }).rlPageView?.();
}

async function render() {
  closeDig(false);
  onWantChange = null;
  navController?.abort();
  const ctrl = new AbortController();
  navController = ctrl;
  const route = parseRoute(location);
  document.body.classList.toggle('home', route.view === 'home');
  if (route.view === 'want') wantNav?.setAttribute('aria-current', 'page');
  else wantNav?.removeAttribute('aria-current');
  if (route.view === 'home' || route.view === 'search') {
    showType(route.type);
    // Keep the URL canonical (e.g. a missing or unknown ?type=) so it can be shared as-is.
    if (route.view === 'search' && new URLSearchParams(location.search).get('type') !== route.type) {
      history.replaceState(null, '', qs({ type: route.type, q: route.q }));
    }
  }
  try {
    if (route.view === 'home') renderHome();
    else if (route.view === 'search') await renderSearch(route.q, route.type, ctrl.signal);
    else if (route.view === 'list') await renderList(route, ctrl.signal);
    else if (route.view === 'want') renderWant();
    else await renderTune(route.id, ctrl.signal);
    if (!ctrl.signal.aborted) restoreScroll();
    trackPageView(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    showError(e, () => {
      for (const k of [...memo.keys()]) memo.delete(k);
      render();
    });
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.replace(/\s+/g, ' ').trim();
  if (q.length < 2) {
    input.setCustomValidity('Type at least 2 characters.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  navigate(qs({ type: currentType(), q }));
  input.blur();
});
input.addEventListener('input', () => input.setCustomValidity(''));

// Switching the search target takes effect at once: re-run the current words
// against the new target, or just update the URL/placeholder if there are none.
for (const r of typeRadios) {
  r.addEventListener('change', () => {
    if (!r.checked) return;
    const type = currentType();
    showType(type);
    const q = input.value.replace(/\s+/g, ' ').trim();
    if (q.length >= 2) navigate(qs({ type, q }), true);
    else if (parseRoute(location).view === 'home') history.replaceState(null, '', qs({ type }));
    input.focus();
  });
}

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing =
    (t instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit'].includes(t.type)) ||
    t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    input.focus();
    input.select();
  } else if (e.key === 'Escape' && t === input) {
    input.blur();
  }
});

// ---------- Back / Forward / reload: return to the same scroll position ----------
// The browser's own restoration runs before the view is rebuilt, so it is done
// here: the position is kept in history.state (set when leaving a page) and
// applied once the view is painted — and again when a sorted list has loaded
// every page. Any scroll, tap or key from the visitor cancels it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let pendingY: number | null = typeof history.state?.y === 'number' ? history.state.y : null;
/** Tune the visitor came back from: its row is marked like a hovered row, and its title focused. */
let returnedId: number | null = null;
function restoreScroll() {
  if (pendingY !== null) window.scrollTo(0, pendingY);
  markReturned();
}
function rowTuneId(tr: Element | null): number | null {
  const a = tr?.querySelector<HTMLAnchorElement>('a.tune-link');
  const p = a ? parsePagePath(new URL(a.href).pathname) : null;
  return p?.kind === 'tune' ? p.id : null;
}
function markReturned() {
  if (returnedId === null) return;
  for (const a of main.querySelectorAll<HTMLAnchorElement>('a.tune-link')) {
    if (rowTuneId(a.closest('tr')) !== returnedId) continue;
    for (const tr of main.querySelectorAll('tr.returned')) tr.classList.remove('returned');
    a.closest('tr')?.classList.add('returned');
    // Focus only if nothing else has it (a repaint after loading drops focus to <body>).
    if (!document.activeElement || document.activeElement === document.body || document.activeElement === main) a.focus({ preventScroll: true });
    return;
  }
}
for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown'] as const) {
  window.addEventListener(ev, () => { pendingY = null; }, { passive: true, capture: true });
}
window.addEventListener('pagehide', () => history.replaceState({ ...(history.state ?? {}), y: window.scrollY }, ''));
window.addEventListener('popstate', () => {
  pendingY = typeof history.state?.y === 'number' ? history.state.y : 0;
  returnedId = typeof history.state?.from === 'number' ? history.state.from : null;
  render();
});
showType(storedType());
render();
