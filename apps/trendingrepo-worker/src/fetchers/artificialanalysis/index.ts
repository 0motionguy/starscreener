// Artificial Analysis LLM benchmark fetcher.
//
//   API           GET https://artificialanalysis.ai/api/v2/data/llms/models
//   Auth          header `x-api-key: ${AA_API_KEY}`
//   Free tier     1,000 requests / day (per the public documentation at
//                 https://artificialanalysis.ai/documentation)
//   Cadence       every 6 hours (`0 */6 * * *`) — 4 calls/day, ~0.4% of quota
//   Output slug   `aa-llms` (ss:data:v1:aa-llms via writeDataStore)
//
// Why
//   For trendingrepo's /?cat=llms surface we need per-model intelligence
//   scores spanning closed-weight providers (Claude, GPT, Gemini) that
//   HuggingFace's `pipeline_tag` taxonomy can never cover. Artificial
//   Analysis publishes a unified Intelligence Index plus task-level
//   indices (coding, math, MMLU-Pro, GPQA) and serving telemetry (output
//   tokens/sec, time-to-first-token, blended $/1M token price).
//
// Attribution requirement
//   The free tier requires attribution to artificialanalysis.ai on any
//   downstream surface that displays the data. The reader-side card on
//   /?cat=llms must render an "Intelligence Index — artificialanalysis.ai"
//   label or equivalent link. This fetcher only persists raw metrics;
//   attribution wiring lives in the reader, not here.
//
// Response shape (per AA Models API v2, observed 2026-05)
//   { data: [
//       { slug, name, creator,
//         evaluations: {
//           artificial_analysis_intelligence_index,
//           coding_index, math_index, mmlu_pro, gpqa, ... },
//         pricing: { price_1m_blended_3_to_1, ... },
//         median_output_tokens_per_second,
//         median_time_to_first_token_seconds,
//         ... },
//       ...
//     ] }
//
//   The wrapper key is `data` in the v2 envelope (some older `/v1/`
//   examples used a bare array). We tolerate either by checking both
//   `response.data` and `response` itself for the model array. Every
//   inner field is normalised through `numberOrNull()` so partial /
//   missing benchmarks land as `null` instead of throwing.
//
// Failure mode
//   This fetcher never throws. Network / parse / config failures push a
//   structured `errors[]` entry and return an empty `RunResult` so the
//   scheduler keeps marching. Writers downstream MUST treat a missing
//   `aa-llms` key as "stale, last-known-good" — the reader-side ranker
//   already short-circuits on null payloads.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { loadEnv } from '../../lib/env.js';
import { writeDataStore } from '../../lib/redis.js';

const ENDPOINT = 'https://artificialanalysis.ai/api/v2/data/llms/models';
const REDIS_SLUG = 'aa-llms';
const SOURCE_LABEL = 'artificialanalysis.ai api v2';
const REQUEST_TIMEOUT_MS = 30_000;

export interface AaModel {
  slug: string; // raw AA slug
  name: string;
  creator: string; // human label (model_creator.name fallback to flat creator)
  creatorSlug: string | null; // model_creator.slug — drives the brand logo
  releaseDate: string | null; // ISO date — drives the Status filter
  intelligenceIndex: number | null; // artificial_analysis_intelligence_index
  codingIndex: number | null;
  mathIndex: number | null;
  mmluPro: number | null;
  gpqa: number | null;
  pricePerMTokens: number | null; // price_1m_blended_3_to_1
  priceInputPerM: number | null; // price_1m_input_tokens
  priceOutputPerM: number | null; // price_1m_output_tokens
  outputTokensPerSec: number | null;
  ttftSec: number | null; // median_time_to_first_token_seconds (Latency)
  ttfaSec: number | null; // median_time_to_first_answer_token (End-to-End Response)
}

export interface AaPayload {
  fetchedAt: string;
  source: string;
  count: number;
  models: AaModel[];
}

// Raw upstream shape. Every field optional / unknown — we never trust
// presence or type without checking. Index signature keeps us
// forward-compatible with new evaluation columns AA adds without us.
interface RawAaEvaluations {
  artificial_analysis_intelligence_index?: unknown;
  artificial_analysis_coding_index?: unknown;
  artificial_analysis_math_index?: unknown;
  mmlu_pro?: unknown;
  gpqa?: unknown;
  [k: string]: unknown;
}

interface RawAaPricing {
  price_1m_blended_3_to_1?: unknown;
  price_1m_input_tokens?: unknown;
  price_1m_output_tokens?: unknown;
  [k: string]: unknown;
}

// As of 2026-05 the live API returns creator under `model_creator` (a nested
// object with `id` / `name` / `slug`), NOT a flat `creator` string. We
// tolerate either shape so older snapshots still parse.
interface RawAaModelCreator {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
}

interface RawAaModel {
  slug?: unknown;
  name?: unknown;
  creator?: unknown;
  model_creator?: RawAaModelCreator;
  release_date?: unknown;
  evaluations?: RawAaEvaluations;
  pricing?: RawAaPricing;
  median_output_tokens_per_second?: unknown;
  median_time_to_first_token_seconds?: unknown;
  median_time_to_first_answer_token?: unknown;
  [k: string]: unknown;
}

interface RawAaResponse {
  data?: RawAaModel[];
  [k: string]: unknown;
}

const fetcher: Fetcher = {
  name: 'artificialanalysis',
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('artificialanalysis dry-run');
      return done(startedAt, 0, false, []);
    }

    const env = loadEnv();
    if (!env.AA_API_KEY) {
      ctx.log.warn('artificialanalysis skipped: AA_API_KEY unset');
      return done(startedAt, 0, false, [
        { stage: 'config', message: 'AA_API_KEY unset' },
      ]);
    }

    let raw: RawAaResponse;
    try {
      const { data } = await ctx.http.json<RawAaResponse>(ENDPOINT, {
        headers: { 'x-api-key': env.AA_API_KEY },
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRetries: 3,
        useEtagCache: false,
      });
      raw = data;
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'artificialanalysis fetch failed');
      return done(startedAt, 0, false, [{ stage: 'fetch', message }]);
    }

    const rawModels = pickModelArray(raw);
    if (rawModels.length === 0) {
      ctx.log.warn('artificialanalysis: upstream returned no models');
      return done(startedAt, 0, false, [
        { stage: 'parse', message: 'upstream returned no models' },
      ]);
    }

    const models: AaModel[] = [];
    for (const entry of rawModels) {
      const normalised = normaliseModel(entry);
      if (normalised) models.push(normalised);
    }

    if (models.length === 0) {
      ctx.log.warn(
        { rawCount: rawModels.length },
        'artificialanalysis: all rows rejected by normaliser (missing slug/name/creator)',
      );
      return done(startedAt, 0, false, [
        { stage: 'normalise', message: 'no models survived normalisation' },
      ]);
    }

    const payload: AaPayload = {
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
      ctx.log.warn({ err: message }, 'artificialanalysis: writeDataStore failed');
      return done(startedAt, models.length, false, [
        { stage: 'write', message },
      ]);
    }

    ctx.log.info(
      {
        slug: REDIS_SLUG,
        count: models.length,
        redisSource: writeResult.source,
        writtenAt: writeResult.writtenAt,
      },
      'artificialanalysis published',
    );

    return {
      fetcher: 'artificialanalysis',
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

// Tolerate both `{ data: [...] }` (v2 envelope) and a bare top-level array
// for forward-compatibility with possible future or older shapes.
function pickModelArray(raw: RawAaResponse | unknown): RawAaModel[] {
  if (raw && typeof raw === 'object') {
    const wrapped = (raw as RawAaResponse).data;
    if (Array.isArray(wrapped)) return wrapped;
  }
  if (Array.isArray(raw)) return raw as RawAaModel[];
  return [];
}

// Reject entries without a usable slug/name/creator — those are unusable
// downstream (the reader keys on slug). Numeric benchmarks are tolerated
// as missing (-> null) so a model with only an intelligence_index and no
// coding_index still ships.
export function normaliseModel(entry: RawAaModel): AaModel | null {
  const slug = trimmedString(entry.slug);
  const name = trimmedString(entry.name);
  // Live API nests creator under model_creator; older snapshots had it flat.
  // Prefer the live shape; fall back to the flat string when present.
  const creator =
    trimmedString(entry.model_creator?.name) ??
    trimmedString(entry.model_creator?.slug) ??
    trimmedString(entry.creator);
  if (!slug || !name || !creator) return null;

  const evals = entry.evaluations ?? {};
  const pricing = entry.pricing ?? {};

  return {
    slug,
    name,
    creator,
    creatorSlug: trimmedString(entry.model_creator?.slug),
    releaseDate: trimmedString(entry.release_date),
    intelligenceIndex: numberOrNull(evals.artificial_analysis_intelligence_index),
    codingIndex: numberOrNull(evals.artificial_analysis_coding_index),
    mathIndex: numberOrNull(evals.artificial_analysis_math_index),
    mmluPro: numberOrNull(evals.mmlu_pro),
    gpqa: numberOrNull(evals.gpqa),
    pricePerMTokens: numberOrNull(pricing.price_1m_blended_3_to_1),
    priceInputPerM: numberOrNull(pricing.price_1m_input_tokens),
    priceOutputPerM: numberOrNull(pricing.price_1m_output_tokens),
    outputTokensPerSec: numberOrNull(entry.median_output_tokens_per_second),
    ttftSec: numberOrNull(entry.median_time_to_first_token_seconds),
    ttfaSec: numberOrNull(entry.median_time_to_first_answer_token),
  };
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'artificialanalysis',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
