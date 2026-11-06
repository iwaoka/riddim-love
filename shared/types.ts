// Shapes returned by the RIDDIM.LOVE Worker (/api/*).
// The Worker projects Riddim-ID API v1 responses down to these fields.
// Upstream fields were verified against real responses (2026-11-06);
// note the OpenAPI document differs from reality in places
// (e.g. /search `data` is a flat array, tune `riddim` is an object).

export interface Ref {
  id: number;
  name: string;
  url: string | null; // riddim-id.com page
}

export interface RiddimRef extends Ref {
  version_of: string | null;
}

export interface Tune {
  id: number;
  title: string;
  year: number | null;
  is_original: boolean;
  artists: Ref[];
  producers: Ref[];
  riddim: RiddimRef | null;
  label: Ref | null;
}

export type NameHitType = 'riddim' | 'artist' | 'producer' | 'label';

export interface NameHit {
  type: NameHitType;
  id: number;
  name: string;
  url: string | null;
  year: number | null;
  version_of: string | null;
  matched_name: string | null;
}

/** Tune hit from /search. Upstream search hits carry no label. */
export interface TuneHit {
  id: number;
  title: string;
  year: number | null;
  artists: Ref[];
  riddim: RiddimRef | null;
}

export type SearchType = 'riddim' | 'tune' | 'artist' | 'label';

/** /api/suggest: one search across riddims, tunes, artists and labels (50 hits in all). */
export interface SuggestResult {
  query: string;
  names: NameHit[];
  tunes: TuneHit[];
}

export interface SearchResult {
  query: string;
  type: SearchType;
  /** Riddim / artist / label hits (only of `type`). Empty for tune searches. */
  names: NameHit[];
  /** Tune title hits. Empty unless `type` is "tune". */
  tunes: TuneHit[];
  /** Max hits requested from upstream (the API caps search at 50). */
  limit: number;
}

export interface TuneList {
  tunes: Tune[];
  total: number | null;
  next_cursor: string | null;
}

export interface Riddim {
  id: number;
  name: string;
  slug: string;
  url: string | null;
  year: number | null;
  summary: string | null;
  alternate_names: string[];
  version_of: Ref | null;
  versions: (Ref & { year: number | null })[];
  producers: Ref[];
  counts: { tunes: number | null; tunes_including_versions: number | null; versions: number | null };
}

/** Artist / producer / label record (for page headers). */
export interface Entity {
  id: number;
  name: string;
  slug: string;
  url: string | null;
  /** person | group | band (people only) */
  kind: string | null;
  country: string | null;
  founded_year: number | null;
  founded_place: string | null;
}

/** Data a server-rendered page hands to the app, keyed by the /api path it stands in for. */
export interface SsrData {
  api: Record<string, unknown>;
}

export interface ApiError {
  error: { code: string; message: string; retry_after?: number };
}

export type ListKind = 'riddim' | 'artist' | 'producer' | 'label';
