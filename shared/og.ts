// Per-page OGP images: what each card says, its R2 key, its URL and its hash.
// Shared by the Worker (og:image tags, /og/* route) and the generator
// (scripts/og/generate.mjs, run by Node directly, so: no imports, and only
// TypeScript that Node can strip).
//
// The hash covers the text drawn on the card and the template version, never
// counts or other data: an image is redrawn only when its name or the design
// changes. It is also the `?v=` of the image URL, so a changed card gets a new
// URL and SNS caches pick it up without a manual refresh.

/** Bump with every design change (scripts/og/template.mjs): every card is redrawn. */
export const OG_TEMPLATE_VERSION = 2;

export type OgKind = 'riddim' | 'artist' | 'producer' | 'label' | 'tune';
export const OG_KINDS: readonly OgKind[] = ['riddim', 'artist', 'producer', 'label', 'tune'];

interface Named {
  name: string;
}
interface TuneLike {
  title: string;
  artists?: readonly Named[] | null;
}

/** The card's title: the API's own name, unchanged; a tune is "Artist & Artist - Title". */
export function ogTitle(kind: OgKind, data: Named | TuneLike): string {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  if (kind !== 'tune') return clean((data as Named).name);
  const t = data as TuneLike;
  const artists = (t.artists ?? []).map((a) => clean(a.name)).filter(Boolean).join(' & ');
  return [artists, clean(t.title)].filter(Boolean).join(' - ');
}

/** FNV-1a (32 bit) of the template version, kind and title, as 8 hex digits. */
export function ogHash(kind: OgKind, title: string): string {
  const s = `${OG_TEMPLATE_VERSION}\n${kind}\n${title}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** R2 object key of a page's image. */
export const ogKey = (kind: OgKind, id: number) => `og/${kind}/${id}.png`;

/** Path of the image on riddim.love, with the hash as cache buster. */
export const ogPath = (kind: OgKind, id: number, title: string) => `/${ogKey(kind, id)}?v=${ogHash(kind, title)}`;

/** "/og/tune/759.png" → { kind, id }. */
export function parseOgPath(pathname: string): { kind: OgKind; id: number } | null {
  const m = /^\/og\/(riddim|artist|producer|label|tune)\/([1-9]\d{0,8})\.png$/.exec(pathname);
  return m ? { kind: m[1] as OgKind, id: Number(m[2]) } : null;
}

/** Image cache lifetimes (seconds). */
export const OG_TTL = {
  /** A generated image whose hash matches the URL: the URL changes whenever the image does. */
  image: 30 * 24 * 3600,
  /** A stale image (name changed, not yet redrawn) or the common fallback: retried soon. */
  fallback: 600,
};
