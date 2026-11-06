import './style.css';
import { artistNames, copyText, displayText, searchText, youtubeQuery, youtubeUrl, type YoutubeOptions } from '../shared/format';
import { sortByLabelArtistTitle } from '../shared/sort';
import type { ApiError, ListKind, NameHit, Ref, Riddim, RiddimRef, SearchResult, Tune, TuneHit, TuneList } from '../shared/types';
import { append, h, safeExternal } from './dom';

// ---------- elements ----------
const main = document.getElementById('main') as HTMLElement;
const form = document.getElementById('search-form') as HTMLFormElement;
const input = document.getElementById('q') as HTMLInputElement;
const announcer = document.getElementById('announce') as HTMLElement;
const ytRiddim = document.getElementById('yt-riddim') as HTMLInputElement;
const ytLabel = document.getElementById('yt-label') as HTMLInputElement;

// ---------- YouTube options (per-viewer convenience) ----------
const YT_KEY = 'riddim.love:yt';
const yt: YoutubeOptions = { riddim: false, label: false };
try {
  Object.assign(yt, JSON.parse(localStorage.getItem(YT_KEY) ?? '{}'));
} catch {
  /* storage unavailable */
}
ytRiddim.checked = !!yt.riddim;
ytLabel.checked = !!yt.label;
for (const [box, key] of [[ytRiddim, 'riddim'], [ytLabel, 'label']] as const) {
  box.addEventListener('change', () => {
    yt[key] = box.checked;
    try {
      localStorage.setItem(YT_KEY, JSON.stringify(yt));
    } catch {
      /* ignore */
    }
  });
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
  | { view: 'home' }
  | { view: 'search'; q: string }
  | { view: 'list'; kind: ListKind; id: number; f: string; sort: string; versions: boolean }
  | { view: 'tune'; id: number };

const LIST_KINDS: ListKind[] = ['riddim', 'artist', 'producer', 'label'];
const ID_RE = /^[1-9]\d{0,8}$/;

function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const tune = p.get('tune');
  if (tune && ID_RE.test(tune)) return { view: 'tune', id: Number(tune) };
  for (const kind of LIST_KINDS) {
    const id = p.get(kind);
    if (id && ID_RE.test(id)) {
      return { view: 'list', kind, id: Number(id), f: p.get('f') ?? '', sort: p.get('sort') ?? '', versions: p.get('versions') === '1' };
    }
  }
  const q = (p.get('q') ?? '').trim();
  if (q) return { view: 'search', q };
  return { view: 'home' };
}

function navigate(href: string, replace = false) {
  const url = new URL(href, location.href);
  if (url.search === location.search && url.pathname === location.pathname) {
    render();
    return;
  }
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
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

const listHref = (kind: ListKind, id: number) => qs({ [kind]: id });

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
} as const;
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
    svg.setAttribute(k, v);
  }
  for (const d of ICONS[name]) {
    if (d.startsWith('rect:')) {
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

function copyButton(text: string, cls = ''): HTMLButtonElement {
  const label = `Copy “${text}”`;
  const btn = h('button', { type: 'button', class: ('copy ' + cls).trim(), title: label, 'aria-label': label }, icon('copy'));
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(text);
    btn.replaceChildren(icon(ok ? 'check' : 'x'));
    btn.classList.toggle('done', ok);
    btn.classList.toggle('fail', !ok);
    announce(ok ? `Copied: ${text}` : 'Copy failed');
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.replaceChildren(icon('copy'));
      btn.classList.remove('done', 'fail');
    }, 1200);
  });
  return btn;
}

function youtubeButton(row: Row): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: 'act yt', 'aria-label': `Search YouTube for ${searchText(row.artists, row.title)}` }, 'YouTube');
  const update = () => (btn.title = 'YouTube: ' + youtubeQuery({ ...row, label: row.label ?? null }, yt));
  btn.addEventListener('mouseenter', update);
  btn.addEventListener('focus', update);
  btn.addEventListener('click', () => {
    window.open(youtubeUrl(youtubeQuery({ ...row, label: row.label ?? null }, yt)), '_blank', 'noopener,noreferrer');
  });
  return btn;
}

type TableOpts = { hideRiddim?: boolean; hideLabel?: boolean };

function tuneRow(row: Row, opts: TableOpts = {}): HTMLTableRowElement {
  const text = displayText(row.artists, row.title);
  const dash = () => h('span', { class: 'muted' }, '—');
  return h('tr', { class: row.is_original ? 'orig' : null },
    h('td', { class: 'c-copy' }, copyButton(copyText(row.artists, row.title))),
    h('td', { class: 'c-artist' }, row.artists.length ? artistNames(row.artists) : dash()),
    h('td', { class: 'c-title' },
      row.title,
      row.is_original ? h('span', { class: 'badge', title: 'The original tune this riddim is named after' }, 'Original') : null,
    ),
    opts.hideRiddim ? null : h('td', { class: 'c-riddim' }, row.riddim ? link(listHref('riddim', row.riddim.id), row.riddim.name) : dash()),
    opts.hideLabel ? null : h('td', { class: 'c-label' }, row.label ? link(listHref('label', row.label.id), row.label.name) : dash()),
    h('td', { class: 'c-year' }, row.year ? String(row.year) : ''),
    h('td', { class: 'c-act' },
      youtubeButton(row),
      h('a', { href: qs({ tune: row.id }), class: 'act info', 'aria-label': `Details for ${text}`, title: 'Details',
        onclick: ((e: MouseEvent) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          navigate(qs({ tune: row.id }));
        }) as EventListener }, 'Info'),
    ),
  );
}

function tuneTable(rows: Row[], opts: TableOpts = {}): HTMLElement {
  const head = (cls: string, text: string, sr = false) => h('th', { scope: 'col', class: cls }, sr ? h('span', { class: 'sr-only' }, text) : text);
  return h('div', { class: 'tunes-wrap' },
    h('table', { class: 'tunes' },
      h('thead', {},
        h('tr', {},
          head('c-copy', 'Copy', true),
          head('c-artist', 'Artist'),
          head('c-title', 'Title'),
          opts.hideRiddim ? null : head('c-riddim', 'Riddim'),
          opts.hideLabel ? null : head('c-label', 'Label'),
          head('c-year', 'Year'),
          head('c-act', 'Actions', true),
        ),
      ),
      h('tbody', {}, ...rows.map((r) => tuneRow(r, opts))),
    ),
  );
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
  document.title = 'RIDDIM.LOVE — Built for selectors';
  main.replaceChildren();
  input.value = '';
  // Autofocus only with a mouse/trackpad; on phones it would pop the keyboard.
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

const GROUPS: { type: NameHit['type']; title: string }[] = [
  { type: 'riddim', title: 'Riddims' },
  { type: 'artist', title: 'Artists' },
  { type: 'label', title: 'Labels' },
  { type: 'producer', title: 'Producers' },
];

async function renderSearch(q: string, signal: AbortSignal) {
  document.title = `${q} — RIDDIM.LOVE`;
  input.value = q;
  if (q.length < 2) {
    main.replaceChildren(h('p', { class: 'state' }, 'Type at least 2 characters.'));
    return;
  }
  loading('Searching…');
  const res = await api<SearchResult>('/api/search?' + new URLSearchParams({ q }), signal);
  if (signal.aborted) return;

  const out: Node[] = [];
  const total = res.names.length + res.tunes.length;
  if (!total) {
    main.replaceChildren(
      h('div', { class: 'state' },
        h('p', {}, `No matches for “${res.query}”.`),
        h('p', { class: 'muted' }, 'Try fewer words, another spelling, or the riddim name alone.'),
      ),
    );
    announce('No matches');
    return;
  }

  const groups = GROUPS.map((g) => ({ ...g, hits: res.names.filter((n) => n.type === g.type) })).filter((g) => g.hits.length);
  if (groups.length) {
    out.push(
      h('section', { class: 'names', 'aria-label': 'Matching names' },
        ...groups.map((g) =>
          h('div', { class: 'group' },
            h('h2', {}, g.title),
            h('ul', { class: 'chips' },
              ...g.hits.map((n) =>
                h('li', {},
                  link(listHref(n.type, n.id), n.name),
                  n.year ? h('span', { class: 'muted' }, ` ${n.year}`) : null,
                  n.version_of ? h('span', { class: 'muted' }, ` · version of ${n.version_of}`) : null,
                  n.matched_name && n.matched_name !== n.name ? h('span', { class: 'muted' }, ` · aka ${n.matched_name}`) : null,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  out.push(
    h('section', { class: 'results', 'aria-label': 'Matching tunes' },
      h('div', { class: 'section-head' },
        h('h2', {}, 'Tunes'),
        h('p', { class: 'muted' },
          res.tunes.length >= res.limit
            ? `Top ${res.limit} title matches (search is capped at ${res.limit}). Open a riddim, artist or label above for its full list.`
            : `${res.tunes.length} title match${res.tunes.length === 1 ? '' : 'es'}.`,
          ' Sorted by label → artist → title (search hits carry no label, so effectively artist → title).',
        ),
      ),
      res.tunes.length
        ? tuneTable(sortByLabelArtistTitle(res.tunes.map((t: TuneHit) => ({ ...t, label: null }))), { hideLabel: true })
        : h('p', { class: 'muted' }, 'No tune titles matched. Try a name above.'),
    ),
  );
  main.replaceChildren(...out);
  announce(`${res.names.length} names and ${res.tunes.length} tunes found`);
}

const KIND_LABEL: Record<ListKind, string> = { riddim: 'Riddim', artist: 'Artist', producer: 'Producer', label: 'Label' };
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
  const params: Record<string, string> = {};
  if (route.sort) params.sort = route.sort;
  if (kind === 'riddim') {
    if (route.f) params.q = route.f;
    if (route.versions) params.versions = 'include';
  }
  const base = `/api/${KIND_PATH[kind]}/${id}/tunes`;
  const [list, riddim] = await Promise.all([
    api<TuneList>(base + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''), signal),
    kind === 'riddim' ? api<Riddim>(`/api/riddims/${id}`, signal) : Promise.resolve(null),
  ]);
  if (signal.aborted) return;

  const ref = riddim ?? nameFromTunes(kind, id, list.tunes);
  const name = ref?.name ?? `${KIND_LABEL[kind]} #${id}`;
  document.title = `${name} ${kind === 'riddim' && !/riddim/i.test(name) ? 'Riddim ' : ''}— RIDDIM.LOVE`;
  input.value = '';

  const head = h('header', { class: 'list-head' },
    h('p', { class: 'kind' }, KIND_LABEL[kind]),
    h('h1', {}, name, riddim?.year ? h('span', { class: 'muted' }, ` ${riddim.year}`) : null),
  );
  if (riddim) {
    const facts: (Node | string)[] = [];
    if (riddim.producers.length) facts.push('Produced by ', ...joinLinks(riddim.producers, 'producer'));
    if (riddim.version_of) facts.push(facts.length ? ' · ' : '', 'Version of ', link(listHref('riddim', riddim.version_of.id), riddim.version_of.name));
    if (facts.length) head.appendChild(h('p', { class: 'facts' }, ...facts));
    if (riddim.alternate_names.length) head.appendChild(h('p', { class: 'facts muted' }, 'Also known as ' + riddim.alternate_names.join(', ')));
    if (riddim.versions.length) {
      head.appendChild(
        h('details', { class: 'versions' },
          h('summary', {}, `${riddim.versions.length} version${riddim.versions.length === 1 ? '' : 's'}`),
          h('ul', { class: 'chips' },
            ...riddim.versions.map((v) => h('li', {}, link(listHref('riddim', v.id), v.name), v.year ? h('span', { class: 'muted' }, ` ${v.year}`) : null)),
          ),
        ),
      );
    }
  }
  const src = external(ref?.url ?? null, 'View on Riddim-ID ↗', 'src');
  if (src) head.appendChild(h('p', {}, src));

  // controls
  const controls = h('form', { class: 'controls', role: 'search', 'aria-label': 'Filter this list' });
  const sorts = kind === 'riddim' ? ['site', 'year', '-year', 'artist', 'title'] : ['site', 'year', '-year', 'title'];
  const sortNames: Record<string, string> = { site: 'Default order', year: 'Oldest first', '-year': 'Newest first', artist: 'Artist A–Z', title: 'Title A–Z' };
  const sortSel = h('select', { name: 'sort', 'aria-label': 'Sort' }, ...sorts.map((s) => h('option', { value: s === 'site' ? '' : s }, sortNames[s])));
  sortSel.value = route.sort;
  let filter: HTMLInputElement | null = null;
  let versions: HTMLInputElement | null = null;
  if (kind === 'riddim') {
    filter = h('input', { type: 'search', name: 'f', placeholder: 'Filter by title or artist', 'aria-label': 'Filter by title or artist', maxlength: 100, value: route.f });
    versions = h('input', { type: 'checkbox', name: 'versions' });
    versions.checked = route.versions;
    append(controls, [filter, h('label', { class: 'check' }, versions, ' Include versions')]);
  }
  append(controls, [sortSel, kind === 'riddim' ? h('button', { type: 'submit' }, 'Apply') : null]);
  const apply = () =>
    navigate(qs({ [kind]: id, f: filter?.value.trim() || null, sort: sortSel.value || null, versions: versions?.checked ? '1' : null }), true);
  controls.addEventListener('submit', (e) => {
    e.preventDefault();
    apply();
  });
  sortSel.addEventListener('change', apply);
  versions?.addEventListener('change', apply);

  const count = h('p', { class: 'count muted' });
  const table = tuneTable(list.tunes, { hideRiddim: kind === 'riddim' && !route.versions, hideLabel: kind === 'label' });
  const ul = table.querySelector('tbody') as HTMLTableSectionElement;
  const more = h('button', { type: 'button', class: 'more' }, 'Load more');
  let shown = list.tunes.length;
  let cursor = list.next_cursor;
  const setCount = () => {
    count.textContent = list.total != null ? `${shown} of ${list.total} tunes` : `${shown} tunes`;
    more.hidden = !cursor;
  };
  setCount();
  more.addEventListener('click', async () => {
    if (!cursor) return;
    more.disabled = true;
    more.textContent = 'Loading…';
    try {
      const page = await api<TuneList>(base + '?' + new URLSearchParams({ ...params, cursor }));
      append(ul, page.tunes.map((t) => tuneRow(t, { hideRiddim: kind === 'riddim' && !route.versions, hideLabel: kind === 'label' })));
      shown += page.tunes.length;
      cursor = page.next_cursor;
      announce(`${page.tunes.length} more tunes loaded`);
    } catch (e) {
      announce('Could not load more');
      more.textContent = 'Failed — try again';
      more.disabled = false;
      console.error(e);
      return;
    }
    more.disabled = false;
    more.textContent = 'Load more';
    setCount();
  });

  main.replaceChildren(
    head,
    controls,
    count,
    list.tunes.length ? table : h('p', { class: 'state' }, route.f ? `No tunes match “${route.f}”.` : 'No tunes listed.'),
    more,
  );
  announce(`${name}: ${count.textContent}`);
}

function joinLinks(refs: Ref[], kind: ListKind): (Node | string)[] {
  const out: (Node | string)[] = [];
  refs.forEach((r, i) => {
    if (i) out.push(i === refs.length - 1 ? ' & ' : ', ');
    out.push(link(listHref(kind, r.id), r.name));
  });
  return out;
}

async function renderTune(id: number, signal: AbortSignal) {
  loading('Loading tune…');
  const t = await api<Tune>(`/api/tunes/${id}`, signal);
  if (signal.aborted) return;
  const text = displayText(t.artists, t.title);
  document.title = `${text} — RIDDIM.LOVE`;
  const rows: [string, (Node | string)[]][] = [
    ['Artist', t.artists.length ? joinLinks(t.artists, 'artist') : ['—']],
    ['Title', [t.title, t.is_original ? h('span', { class: 'badge' }, 'Original') : '']],
    ['Riddim', t.riddim ? [link(listHref('riddim', t.riddim.id), t.riddim.name), t.riddim.version_of ? h('span', { class: 'muted' }, ` (version of ${t.riddim.version_of})`) : ''] : ['—']],
    ['Label', t.label ? [link(listHref('label', t.label.id), t.label.name)] : ['—']],
    ['Producer', t.producers.length ? joinLinks(t.producers, 'producer') : ['—']],
    ['Year', [t.year ? String(t.year) : '—']],
  ];
  main.replaceChildren(
    h('article', { class: 'tune' },
      h('p', { class: 'kind' }, 'Tune'),
      h('h1', { class: 'at' }, text),
      h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, ...v)])),
      h('p', { class: 'c-act' }, copyButton(copyText(t.artists, t.title), 'act-copy'), youtubeButton(t)),
      h('p', { class: 'muted' },
        'Source: ',
        external(t.riddim?.url ?? null, `${t.riddim?.name ?? 'Riddim'} on Riddim-ID ↗`) ?? external('https://riddim-id.com/', 'Riddim-ID ↗'),
      ),
    ),
  );
}

// ---------- render loop ----------
async function render() {
  navController?.abort();
  const ctrl = new AbortController();
  navController = ctrl;
  const route = parseRoute(location.search);
  document.body.classList.toggle('home', route.view === 'home');
  try {
    if (route.view === 'home') renderHome();
    else if (route.view === 'search') await renderSearch(route.q, ctrl.signal);
    else if (route.view === 'list') await renderList(route, ctrl.signal);
    else await renderTune(route.id, ctrl.signal);
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
  navigate(qs({ q }));
  input.blur();
});
input.addEventListener('input', () => input.setCustomValidity(''));

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    input.focus();
    input.select();
  } else if (e.key === 'Escape' && t === input) {
    input.blur();
  }
});

window.addEventListener('popstate', () => render());
render();
