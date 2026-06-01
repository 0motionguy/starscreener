// LMArena (Chatbot Arena) Elo leaderboard fetcher.
//
//   API           HuggingFace dataset `lmarena-ai/leaderboard-dataset` (CC-BY-4.0),
//                 with MIT mirror fallback at github oolong-tea-2026.
//   Auth          none
//   Rate limit    n/a (1 GET per week)
//   Cadence       weekly Mon 06:00 UTC (`0 6 * * 1`)
//   Output slug   lmarena-text  (text-category leaderboard snapshot)
//
// Why this exists
//   HuggingFace `downloads` is a popularity signal, not a quality signal.
//   LMArena Elo is the industry-standard *quality* signal for LLMs. The
//   /?cat=llms surface needs both — popularity tells us who is being run,
//   Elo tells us who is *good*. This fetcher publishes the per-model Elo
//   snapshot; downstream readers join it on `modelId` against the HF
//   trending roster to enrich the LLM tab.
//
//   Source is updated by the LMArena team roughly weekly; we mirror that
//   cadence (Mon 06:00 UTC). `protect: true` is enforced by the scheduler
//   (see ../../schedule.ts), so an overrun won't stack ticks.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; lmarena)';

const OUTPUT_SLUG = 'lmarena-text';
const SOURCE_LABEL = 'huggingface dataset lmarena-ai/leaderboard-dataset';

// HF datasets-server REST API. The dataset is parquet-only on disk, so we go
// through the auto-converted rows endpoint which returns JSON. Public, no
// auth. Config `text` + split `latest` is the current Text Arena snapshot
// (~8890 rows across overall / coding / math / long-context / etc. sub-
// categories per the 2026-05-19 publish; we filter to category=overall
// downstream of `normalize`).
const ROWS_URL_BASE =
  'https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=text&split=latest';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

interface LmarenaModelRaw {
  model_name?: string;
  organization?: string;
  rating?: number;
  rating_lower?: number | null;
  rating_upper?: number | null;
  vote_count?: number;
  rank?: number;
  category?: string;
  leaderboard_publish_date?: string;
}

interface LmarenaModel {
  modelId: string;
  name: string;
  organization: string;
  arenaScore: number;
  ratingLower: number | null;
  ratingUpper: number | null;
  voteCount: number;
  rank: number;
  category: string;
  snapshotDate: string;
}

interface LmarenaPayload {
  fetchedAt: string;
  status?: 'ok' | 'degraded';
  errors?: RunResult['errors'];
  source: string;
  snapshotDate: string;
  count: number;
  models: LmarenaModel[];
}

// HF datasets-server `/rows` envelope. The dataset rows are under `rows[].row`
// (one level of nesting deeper than a flat array). `num_rows_total` lets us
// detect end of pagination without a second metadata call.
interface HfRowsResponse {
  features?: unknown;
  rows?: Array<{ row_idx: number; row: LmarenaModelRaw; truncated_cells?: unknown[] }>;
  num_rows_total?: number;
  num_rows_per_page?: number;
  partial?: boolean;
}

const fetcher: Fetcher = {
  name: 'lmarena',
  schedule: '0 6 * * 1',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('lmarena dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const raw: LmarenaModelRaw[] = [];
    let total: number | null = null;
    let lastUrl = '';
    let paginationComplete = true;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_SIZE;
      const url = `${ROWS_URL_BASE}&offset=${offset}&length=${PAGE_SIZE}`;
      lastUrl = url;
      try {
        const { data } = await ctx.http.json<HfRowsResponse>(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
          useEtagCache: false,
          timeoutMs: 20_000,
        });
        if (total === null && typeof data.num_rows_total === 'number') {
          total = data.num_rows_total;
        }
        if (data.partial) {
          paginationComplete = false;
          errors.push({ stage: 'fetch', message: `page ${page} returned partial=true` });
          break;
        }
        const rows = Array.isArray(data.rows) ? data.rows : [];
        if (rows.length === 0) break;
        for (const r of rows) {
          if (r && typeof r === 'object' && r.row) raw.push(r.row);
        }
        if (total !== null && raw.length >= total) break;
        if (rows.length < PAGE_SIZE) break;
      } catch (err) {
        const message = (err as Error).message;
        ctx.log.warn({ page, offset, err: message }, 'lmarena: page fetch failed, stopping');
        errors.push({ stage: 'fetch', message: `page ${page} (offset ${offset}): ${message}` });
        paginationComplete = false;
        break;
      }
    }

    if (total !== null && raw.length < total) {
      paginationComplete = false;
    }

    if (raw.length === 0) {
      ctx.log.warn({ lastUrl }, 'lmarena: HF datasets-server returned no rows');
      return done(startedAt, 0, false, errors);
    }

    if (!paginationComplete) {
      const message = `incomplete pagination: fetched ${raw.length}${total === null ? '' : `/${total}`} rows`;
      ctx.log.warn({ lastUrl, rawCount: raw.length, total }, `lmarena: ${message}`);
      return done(startedAt, raw.length, false, [
        ...errors,
        { stage: 'pagination-incomplete', message },
      ]);
    }

    const models: LmarenaModel[] = [];
    let latestSnapshotDate = '';
    for (const r of raw) {
      const norm = normalize(r);
      if (!norm) continue;
      models.push(norm);
      if (norm.snapshotDate && norm.snapshotDate > latestSnapshotDate) {
        latestSnapshotDate = norm.snapshotDate;
      }
    }

    if (models.length === 0) {
      ctx.log.warn({ lastUrl, rawCount: raw.length }, 'lmarena: zero models survived normalization');
      errors.push({ stage: 'normalize', message: `zero models from ${raw.length} raw rows` });
      return done(startedAt, 0, false, errors);
    }

    const payload: LmarenaPayload = {
      fetchedAt: new Date().toISOString(),
      status: errors.length > 0 ? 'degraded' : 'ok',
      ...(errors.length > 0 ? { errors } : {}),
      source: SOURCE_LABEL,
      snapshotDate: latestSnapshotDate,
      count: models.length,
      models,
    };

    let writeResult: { source: 'redis' | 'skipped'; writtenAt: string };
    try {
      writeResult = await writeDataStore(OUTPUT_SLUG, payload);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'lmarena: writeDataStore failed');
      errors.push({ stage: 'write', message });
      return done(startedAt, models.length, false, errors);
    }

    ctx.log.info(
      {
        rowsTotal: total,
        rowsFetched: raw.length,
        models: models.length,
        snapshotDate: latestSnapshotDate || '(unknown)',
        redisSource: writeResult.source,
      },
      'lmarena published',
    );

    return {
      fetcher: 'lmarena',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: raw.length,
      itemsUpserted: 0,
      metricsWritten: models.length,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function normalize(r: LmarenaModelRaw): LmarenaModel | null {
  if (!r || typeof r !== 'object') return null;
  const name = typeof r.model_name === 'string' ? r.model_name.trim() : '';
  const organization = typeof r.organization === 'string' ? r.organization.trim() : '';
  if (!name) return null;

  const rating = toFiniteNumber(r.rating);
  if (rating === null) return null;

  const modelId = slugify(`${organization}/${name}`);
  if (!modelId) return null;

  const ratingLower = toFiniteNumber(r.rating_lower);
  const ratingUpper = toFiniteNumber(r.rating_upper);
  const voteCount = toFiniteNumber(r.vote_count) ?? 0;
  const rank = toFiniteNumber(r.rank) ?? 0;
  const category = typeof r.category === 'string' && r.category.trim() ? r.category.trim() : 'text';
  const snapshotDate = toIsoDate(r.leaderboard_publish_date);

  return {
    modelId,
    name,
    organization,
    arenaScore: rating,
    ratingLower,
    ratingUpper,
    voteCount: Math.max(0, Math.trunc(voteCount)),
    rank: Math.max(0, Math.trunc(rank)),
    category,
    snapshotDate,
  };
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Best-effort slug: lowercase, replace any non-alphanumeric (except `/`) with
 * a single `-`, collapse repeats, trim leading/trailing `-` from each segment.
 * Preserves the `org/model` shape so downstream joins on `modelId` stay
 * compatible with the HF model id convention.
 */
function slugify(input: string): string {
  const segments = input
    .toLowerCase()
    .split('/')
    .map((seg) =>
      seg
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((seg) => seg.length > 0);
  return segments.join('/');
}

/**
 * Coerce a publish-date string to ISO date (`YYYY-MM-DD`). Returns `''` when
 * the input isn't parseable so callers can detect "unknown date" without
 * special sentinels.
 */
function toIsoDate(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '';
  // Already ISO date? Pass through.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'lmarena',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
