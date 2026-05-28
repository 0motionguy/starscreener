// OpenRouter model-marketplace fetcher.
//
//   APIs   GET https://openrouter.ai/api/v1/models                  (catalogue)
//          GET https://openrouter.ai/api/frontend/models/find?order=top-weekly
//                                                                    (usage rank)
//   Auth   none — both are public. (No OPENROUTER_API_KEY needed; the public
//          catalogue + ranking carry no per-account data.)
//   Cadence  every 6 hours (`0 */6 * * *`)
//   Output slug  `openrouter-models` (ss:data:v1:openrouter-models)
//
// Why
//   The /?cat=models surface needs the OpenRouter model landscape: the
//   catalogue of routable models (pricing, context window, modality, the
//   month each became routable) joined with OpenRouter's live weekly-usage
//   ranking. This is the *adoption* axis (what the world actually runs) and
//   complements the Artificial Analysis *quality* axis on /?cat=llms.
//
// Honesty constraint
//   OpenRouter's public surface exposes usage RANK ORDER only — not per-model
//   token volume. We persist the 1-based rank, never a synthetic token count.
//   The growth chart downstream is built from each model's `created` month
//   (real), not from invented volume history.
//
// Keep-last guard
//   Full-catalogue snapshot (no append semantics): each run writes the whole
//   list. We read the existing slug first and apply `shouldPreserveCache` so a
//   total upstream failure (empty fresh) preserves the last-known-good payload
//   instead of zeroing the user-visible surface (recent-repos class of bug).
//   Satisfies scripts/check-worker-keep-last-50.mjs via the cache-merge import
//   + same-slug read.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';

const CATALOG_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const RANKING_ENDPOINT =
  'https://openrouter.ai/api/frontend/models/find?order=top-weekly';
const REDIS_SLUG = 'openrouter-models';
const SOURCE_LABEL = 'openrouter.ai api v1 + frontend top-weekly';
const REQUEST_TIMEOUT_MS = 30_000;
// The frontend ranking endpoint is bot-sensitive; send a real UA.
const UA = 'trendingrepo-worker/1.0 (+https://trendingrepo.com)';

export interface OpenrouterModelRow {
  id: string;
  name: string;
  author: string;
  created: number; // unix seconds
  contextLength: number;
  priceInPerM: number | null; // USD / 1M input tokens
  priceOutPerM: number | null; // USD / 1M output tokens
  modality: string;
  inputModalities: string[];
  usageRank: number | null; // 1-based weekly-usage rank
}

export interface OpenrouterPayload {
  fetchedAt: string;
  source: string;
  count: number;
  models: OpenrouterModelRow[];
}

interface RawCatalogModel {
  id?: unknown;
  name?: unknown;
  created?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown; [k: string]: unknown };
  architecture?: {
    modality?: unknown;
    input_modalities?: unknown;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

const fetcher: Fetcher = {
  name: 'openrouter-models',
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('openrouter-models dry-run');
      return done(startedAt, 0, false, []);
    }

    // 1) Catalogue (the authoritative model set).
    let catalog: RawCatalogModel[] = [];
    try {
      const { data } = await ctx.http.json<{ data?: RawCatalogModel[] }>(
        CATALOG_ENDPOINT,
        { headers: { 'User-Agent': UA }, timeoutMs: REQUEST_TIMEOUT_MS, maxRetries: 3, useEtagCache: false },
      );
      catalog = Array.isArray(data?.data) ? data.data : [];
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'openrouter-models catalogue fetch failed');
      return preserveOrFail(ctx, startedAt, [{ stage: 'fetch-catalog', message }]);
    }

    // 2) Usage ranking (best-effort — surface still works without it).
    const rank = new Map<string, number>();
    try {
      const { data } = await ctx.http.json<unknown>(RANKING_ENDPOINT, {
        headers: { 'User-Agent': UA },
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRetries: 2,
        useEtagCache: false,
      });
      for (const [i, slug] of extractRankSlugs(data).entries()) {
        if (!rank.has(slug)) rank.set(slug, i + 1);
      }
    } catch (err) {
      ctx.log.warn(
        { err: (err as Error).message },
        'openrouter-models ranking fetch failed — proceeding rank-less',
      );
    }

    const models: OpenrouterModelRow[] = [];
    for (const raw of catalog) {
      const row = normalise(raw, rank);
      if (row) models.push(row);
    }

    // Zero-write guard: never overwrite a good cache with an empty payload.
    const existing = await readDataStore<OpenrouterPayload>(REDIS_SLUG).catch(
      () => null,
    );
    const existingModels = existing?.models ?? [];
    if (shouldPreserveCache({ fresh: models, existing: existingModels })) {
      ctx.log.warn(
        { existing: existingModels.length },
        'openrouter-models: empty fresh set — preserving last-known-good cache',
      );
      return done(startedAt, 0, false, [
        { stage: 'normalise', message: 'no models survived; cache preserved' },
      ]);
    }

    const payload: OpenrouterPayload = {
      fetchedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      count: models.length,
      models,
    };

    let writeResult: Awaited<ReturnType<typeof writeDataStore>>;
    try {
      writeResult = await writeDataStore(REDIS_SLUG, payload);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'openrouter-models: writeDataStore failed');
      return done(startedAt, models.length, false, [{ stage: 'write', message }]);
    }

    ctx.log.info(
      {
        slug: REDIS_SLUG,
        count: models.length,
        ranked: rank.size,
        redisSource: writeResult.source,
      },
      'openrouter-models published',
    );

    return {
      fetcher: 'openrouter-models',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: models.length,
      itemsUpserted: 0,
      metricsWritten: models.length,
      redisPublished: writeResult.source === 'redis',
      errors: [],
    };
  },
};

export default fetcher;

// The ranking endpoint wraps its array in { data: { models: [...] } } or
// { data: [...] } depending on deployment — tolerate both, plus a bare array.
function extractRankSlugs(raw: unknown): string[] {
  const arr = pickRankArray(raw);
  const out: string[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const slug = (item as { slug?: unknown; id?: unknown }).slug ??
        (item as { id?: unknown }).id;
      if (typeof slug === 'string' && slug.length > 0) out.push(slug);
    }
  }
  return out;
}

function pickRankArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const models = (data as { models?: unknown }).models;
      if (Array.isArray(models)) return models;
    }
  }
  return [];
}

export function normalise(
  raw: RawCatalogModel,
  rank: Map<string, number>,
): OpenrouterModelRow | null {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  const pricing = raw.pricing ?? {};
  const arch = raw.architecture ?? {};
  const priceIn = perMillion(pricing.prompt);
  const priceOut = perMillion(pricing.completion);
  const inputModalities = Array.isArray(arch.input_modalities)
    ? (arch.input_modalities.filter((m) => typeof m === 'string') as string[])
    : [];
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    author: id.split('/')[0] ?? id,
    created: numberOrZero(raw.created),
    contextLength: numberOrZero(raw.context_length),
    priceInPerM: priceIn,
    priceOutPerM: priceOut,
    modality: typeof arch.modality === 'string' ? arch.modality : 'text->text',
    inputModalities,
    usageRank: rank.get(id) ?? null,
  };
}

// OpenRouter prices are per-token USD strings (e.g. "0.00000125"). Convert to
// USD per 1M tokens, rounded to 4 decimals. Missing/garbage → null.
function perMillion(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000 * 10_000) / 10_000;
}

function numberOrZero(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function preserveOrFail(
  ctx: FetcherContext,
  startedAt: string,
  errors: RunResult['errors'],
): Promise<RunResult> {
  // Catalogue fetch failed entirely — the existing cache stays untouched
  // (we simply don't write). Surface the error for the run summary.
  ctx.log.warn({ errors }, 'openrouter-models: upstream failure, cache untouched');
  return done(startedAt, 0, false, errors);
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'openrouter-models',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
