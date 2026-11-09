// Pure helpers for the static sitemap (scripts/sitemap.mjs). No imports, so
// Node runs this file directly (type stripping) and Vitest can test it.
//
// Which pages are listed:
//  - riddim / artist / label / producer detail pages (tune pages are noindex)
//  - only with at least MIN_TUNES tunes, so near-empty pages are left out
//  - never placeholder records ("[Dub]", "[Unknown]", "~Unknown (027)")
//  - canonical URLs only: the same id + slug rule as the Worker's pages
//    (worker/project.ts: the upstream slug when it is a clean slug, else none)

export type Kind = 'riddim' | 'artist' | 'label' | 'producer';
export const KINDS: readonly Kind[] = ['riddim', 'artist', 'label', 'producer'];

export const ORIGIN = 'https://riddim.love';
export const MAX_URLS_PER_FILE = 50_000; // sitemap protocol limit
export const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50 MiB, uncompressed

/** Minimum tunes for a page to be listed. */
export const MIN_TUNES: Readonly<Record<Kind, number>> = { riddim: 2, artist: 3, label: 3, producer: 3 };

/** Upstream list endpoint for each kind (sorted by tune count, most first). */
export const LIST_PATH: Readonly<Record<Kind, string>> = { riddim: '/riddims', artist: '/artists', label: '/labels', producer: '/producers' };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Item = Record<string, unknown>;

/** The tune count that matches what the page lists for this kind. */
export function tuneCount(kind: Kind, item: Item): number | null {
  const c = item.counts as Record<string, unknown> | undefined;
  const key = kind === 'artist' ? 'tunes_as_artist' : kind === 'producer' ? 'tunes_as_producer' : 'tunes';
  const v = c?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** "[Dub]", "[Unknown]", "~Unknown (027)": stand-in records, not real names. */
export function isPlaceholder(name: unknown): boolean {
  if (typeof name !== 'string' || !name.trim()) return true;
  const n = name.trim();
  // Whole-name patterns only: a real title such as "Unknown Soldier" stays in.
  return /^\[.*\]$/.test(n) || /^~/.test(n) || /^unknown(?:\s*\(\d+\))?$/i.test(n);
}

/** Canonical page URL for a list item, or null when the item has no usable id. */
export function pageUrl(kind: Kind, item: Item): string | null {
  const id = typeof item.id === 'string' && /^\d+$/.test(item.id) ? Number(item.id) : item.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 999_999_999) return null;
  const slug = typeof item.slug === 'string' && SLUG_RE.test(item.slug) ? item.slug : '';
  return `${ORIGIN}/${kind}/${id}${slug ? `/${slug}` : ''}`;
}

/**
 * The count upstream sorts "-tunes" by (checked against real responses,
 * 2026-11-09). It is never below tuneCount(), so once it drops under the
 * minimum, no later item can qualify.
 */
const SORT_COUNT: Readonly<Record<Kind, string>> = {
  riddim: 'tunes_including_versions',
  artist: 'tunes_as_artist_including_aliases',
  label: 'tunes',
  producer: 'tunes_as_producer_including_aliases',
};

export function sortCount(kind: Kind, item: Item): number | null {
  const v = (item.counts as Record<string, unknown> | undefined)?.[SORT_COUNT[kind]];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Takes one upstream page (sorted by sortCount, most first). Returns the URLs
 * to list (own tune count ≥ minimum) and whether the walk can stop (the sort
 * count fell under the minimum).
 */
export function pickPage(kind: Kind, items: readonly Item[]): { urls: string[]; names: string[]; stop: boolean } {
  const urls: string[] = [];
  const names: string[] = [];
  let stop = false;
  for (const it of items) {
    const s = sortCount(kind, it);
    if (s !== null && s < MIN_TUNES[kind]) {
      stop = true;
      break;
    }
    const n = tuneCount(kind, it);
    if (n === null || n < MIN_TUNES[kind]) continue; // e.g. a riddim whose tunes are all on its versions
    if (isPlaceholder(it.name)) continue;
    const url = pageUrl(kind, it);
    if (!url) continue;
    urls.push(url);
    names.push(String(it.name));
  }
  return { urls, names, stop };
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** <urlset> without lastmod (no reliable per-page update time upstream). */
export function urlsetXml(urls: readonly string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `<url><loc>${xmlEsc(u)}</loc></url>\n`).join('') +
    '</urlset>\n'
  );
}

export function indexXml(locs: readonly string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.map((u) => `<sitemap><loc>${xmlEsc(u)}</loc></sitemap>\n`).join('') +
    '</sitemapindex>\n'
  );
}

/** Splits a kind's URLs into files of at most MAX_URLS_PER_FILE: riddim.xml, or riddim-1.xml, riddim-2.xml… */
export function splitFiles(kind: string, urls: readonly string[], max = MAX_URLS_PER_FILE): { name: string; urls: string[] }[] {
  if (urls.length <= max) return [{ name: `${kind}.xml`, urls: [...urls] }];
  const out: { name: string; urls: string[] }[] = [];
  for (let i = 0; i < urls.length; i += max) out.push({ name: `${kind}-${out.length + 1}.xml`, urls: urls.slice(i, i + max) });
  return out;
}

/** Number of <loc> entries in a sitemap file (for comparing with the previous run). */
export function countLocs(xml: string): number {
  return (xml.match(/<loc>/g) ?? []).length;
}

/**
 * Checks a finished set before anything is written. Returns problems; empty = OK.
 * `previous`: URLs per kind in the last published set (missing = first run).
 */
export function validateSet(
  files: readonly { name: string; xml: string }[],
  totals: Readonly<Record<string, number>>,
  previous: Readonly<Record<string, number>>,
  minShare = 0.8,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const locs = [...f.xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (!f.xml.startsWith('<?xml') || !/<\/(urlset|sitemapindex)>\n$/.test(f.xml)) problems.push(`${f.name}: not a complete XML document`);
    if (locs.length > MAX_URLS_PER_FILE) problems.push(`${f.name}: ${locs.length} URLs (limit ${MAX_URLS_PER_FILE})`);
    if (new TextEncoder().encode(f.xml).length > MAX_BYTES_PER_FILE) problems.push(`${f.name}: larger than 50 MiB`);
    if (f.xml.includes('<sitemapindex')) continue;
    for (const u of locs) {
      if (!u.startsWith(ORIGIN + '/')) problems.push(`${f.name}: not a riddim.love URL: ${u}`);
      if (seen.has(u)) problems.push(`${f.name}: duplicate ${u}`);
      seen.add(u);
    }
  }
  for (const [kind, n] of Object.entries(totals)) {
    if (n === 0) problems.push(`${kind}: no URLs`);
    const prev = previous[kind];
    if (prev && n < prev * minShare) problems.push(`${kind}: ${n} URLs, under ${Math.round(minShare * 100)}% of the previous ${prev}`);
  }
  return problems;
}

/** Names that occur more than once (case/accent-insensitive): pages whose titles will be the same. */
export function duplicateNames(names: readonly string[]): string[] {
  const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Map<string, number>();
  for (const n of names) seen.set(fold(n), (seen.get(fold(n)) ?? 0) + 1);
  return [...seen].filter(([, c]) => c > 1).map(([n]) => n);
}
