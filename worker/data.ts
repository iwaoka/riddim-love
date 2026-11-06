// Data loaders shared by the JSON API (/api/*) and server-rendered pages.
// A page embeds exactly what the matching /api path would return, keyed by
// that path, so the browser app can start from it without refetching.

import type { Entity, Riddim, Tune, TuneList } from '../shared/types';
import * as P from './project';
import { data, tuneList, unexpected, upstream, type UpstreamStats } from './upstream';

type Ctx = ExecutionContext;

export const apiPath = {
  riddim: (id: number) => `/api/riddims/${id}`,
  riddimTunes: (id: number) => `/api/riddims/${id}/tunes`,
  tunes: (kind: 'artist' | 'producer' | 'label', id: number) => `/api/${kind}s/${id}/tunes`,
  tune: (id: number) => `/api/tunes/${id}`,
};

export async function loadRiddim(id: number, ctx: Ctx, stats?: UpstreamStats): Promise<Riddim> {
  const r = P.riddim(data(await upstream(`/riddims/${id}`, {}, ctx, stats)));
  if (!r) throw unexpected();
  return r;
}

export async function loadTune(id: number, ctx: Ctx, stats?: UpstreamStats): Promise<Tune> {
  const t = P.tune(data(await upstream(`/tunes/${id}`, {}, ctx, stats)));
  if (!t) throw unexpected();
  return t;
}

/** Artist / producer / label record. Upstream 404s (incl. person_not_artist) propagate. */
export async function loadEntity(kind: 'artist' | 'producer' | 'label', id: number, ctx: Ctx, stats?: UpstreamStats): Promise<Entity> {
  const e = P.entity(data(await upstream(`/${kind}s/${id}`, {}, ctx, stats)), kind);
  if (!e) throw unexpected();
  return e;
}

/** First page (or a cursor page) of a tune list, default order unless `params` say otherwise. */
export async function loadTunes(
  kind: 'riddim' | 'artist' | 'producer' | 'label',
  id: number,
  params: Record<string, string | null>,
  ctx: Ctx,
  stats?: UpstreamStats,
): Promise<TuneList> {
  return tuneList(await upstream(`/${kind}s/${id}/tunes`, params, ctx, stats));
}
