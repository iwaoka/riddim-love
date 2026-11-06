// Projects raw Riddim-ID API v1 objects to the small shapes in shared/types.ts.
// Defensive on purpose: unknown/missing fields become null instead of crashing,
// so an upstream change degrades the display rather than breaking it.

import type { NameHit, NameHitType, Ref, Riddim, RiddimRef, Tune, TuneHit } from '../shared/types';

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};
const riddimUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && s.startsWith('https://riddim-id.com/') ? s : null;
};

export function ref(v: unknown): Ref | null {
  if (!isObj(v)) return null;
  const id = int(v.id);
  const name = str(v.name);
  if (id == null || name == null) return null;
  return { id, name, url: riddimUrl(v.url) };
}

function refs(v: unknown): Ref[] {
  return Array.isArray(v) ? v.map(ref).filter((r): r is Ref => r !== null) : [];
}

function riddimRef(v: unknown): RiddimRef | null {
  const r = ref(v);
  if (!r || !isObj(v)) return null;
  const vo = v.version_of;
  return { ...r, version_of: isObj(vo) ? str(vo.name) : str(vo) };
}

export function tune(v: unknown): Tune | null {
  if (!isObj(v)) return null;
  const id = int(v.id);
  const title = str(v.title);
  if (id == null || title == null) return null;
  return {
    id,
    title,
    year: int(v.year),
    is_original: v.is_original === true,
    artists: refs(v.artists),
    producers: refs(v.producers),
    riddim: riddimRef(v.riddim),
    label: ref(v.label),
  };
}

export function tunes(v: unknown): Tune[] {
  return Array.isArray(v) ? v.map(tune).filter((t): t is Tune => t !== null) : [];
}

const NAME_TYPES: readonly NameHitType[] = ['riddim', 'artist', 'producer', 'label'];

export function nameHit(v: unknown): NameHit | null {
  if (!isObj(v)) return null;
  const type = v.type as NameHitType;
  if (!NAME_TYPES.includes(type)) return null;
  const r = ref(v);
  if (!r) return null;
  return {
    type,
    ...r,
    year: int(v.year),
    version_of: str(v.version_of),
    matched_name: str(v.matched_name),
  };
}

export function tuneHit(v: unknown): TuneHit | null {
  if (!isObj(v) || v.type !== 'tune') return null;
  const id = int(v.id);
  const title = str(v.name);
  if (id == null || title == null) return null;
  return { id, title, year: int(v.year), artists: refs(v.artists), riddim: riddimRef(v.riddim) };
}

export function riddim(v: unknown): Riddim | null {
  if (!isObj(v)) return null;
  const r = ref(v);
  if (!r) return null;
  const counts = isObj(v.counts) ? v.counts : {};
  const versions = Array.isArray(v.versions)
    ? v.versions.flatMap((x) => {
        const vr = ref(x);
        return vr ? [{ ...vr, year: isObj(x) ? int(x.year) : null }] : [];
      })
    : [];
  return {
    ...r,
    year: int(v.year),
    summary: str(v.summary),
    alternate_names: Array.isArray(v.alternate_names)
      ? v.alternate_names.map((a) => (isObj(a) ? str(a.name) : str(a))).filter((a): a is string => a !== null)
      : [],
    version_of: ref(v.version_of),
    versions,
    producers: refs(v.producers),
    counts: {
      tunes: int(counts.tunes),
      tunes_including_versions: int(counts.tunes_including_versions),
      versions: int(counts.versions),
    },
  };
}
