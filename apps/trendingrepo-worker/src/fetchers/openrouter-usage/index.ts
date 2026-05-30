// OpenRouter usage time-series fetcher — per-MODEL weekly tokens.
//
//   Primary  GET https://openrouter.ai/api/v1/datasets/rankings-daily
//            Authenticated (Bearer OPENROUTER_API_KEY). Returns DAILY per-
//            model token totals (top 50 + 'other' per day) since 2025-01-01.
//            Stable, documented, rate-limited 30/min · 500/day per account.
//            Aggregated here into weekly per-model buckets.
//
//   Fallback POST https://openrouter.ai/rankings  (Next.js Server Action,
//            next-action ID hard-coded). Returns weekly per-MODEL token totals
//            (top-9 named models + "Others"). This is the same data backing
//            the "Top Models" chart on openrouter.ai/rankings.
//
//            Brittle (action ID rotates on OpenRouter deploys) but key-free,
//            so the surface always has data even before the API key is
//            provisioned. When the action returns no rows / HTML, the
//            keep-last-50 guard preserves the existing cache untouched.
//
//   Output slug  `openrouter-usage` (ss:data:v1:openrouter-usage)
//   Cadence  every 6 hours (`13 */6 * * *`) — offset from openrouter-models'
//            `0 */6 * * *` so the two don't contend for upstream / Redis.
//
// Why per-MODEL
//   The user-facing chart on /?cat=models stacks each MODEL as its own band,
//   matching openrouter.ai/rankings' "Top Models" panel. Per-author rollup is
//   trivially derivable downstream (split id on '/' and sum), so we persist
//   the most granular signal we have.
//
// Keep-last guard
//   Same class as recent-repos / openrouter-models: an upstream failure must
//   NOT overwrite the cache with empty. Uses `shouldPreserveCache` against
//   the existing slug; counts as a no-op write. Lint guard at
//   scripts/check-worker-keep-last-50.mjs is satisfied via the cache-merge
//   import + same-slug read.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';

const REDIS_SLUG = 'openrouter-usage';
const REQUEST_TIMEOUT_MS = 30_000;
const UA = 'trendingrepo-worker/1.0 (+https://trendingrepo.com)';

const OFFICIAL_ENDPOINT = 'https://openrouter.ai/api/v1/datasets/rankings-daily';
const FALLBACK_URL = 'https://openrouter.ai/rankings';
// Action IDs rotate on OpenRouter deploys; bump these constants + the
// mirrored ones in scripts/seed-openrouter-usage.mjs when the fallback
// starts returning HTML/empty. The official endpoint is the long-term
// truth — this is only here so the surface isn't blank before
// OPENROUTER_API_KEY is provisioned.
const FALLBACK_NEXT_ACTION_MODEL = '40b649b2cc6d44a360a3c410849222d446a6f535e9';
// Returns ~400 per-model rows for the most recent day(s) with
// prompt/completion/reasoning tokens + WoW delta in `change`. Body
// ["week"] aggregates the last ~3 days; ["month"] aggregates the last
// month. We use ["week"] to power the sidebar leaderboard.
const FALLBACK_NEXT_ACTION_LEADERBOARD = '40f9c1737045f5080a2f0df80bb985450bdd0f4367';
const FALLBACK_ROUTER_STATE =
  '%5B%22%22%2C%7B%22children%22%3A%5B%22(home)%22%2C%7B%22children%22%3A%5B%22rankings%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C20%5D';

// Cap how many distinct named models we persist per week. The chart paints
// up to 15 bands (no "Others"); we keep headroom so the reader can swap in a
// substitute if a band gets preview-filtered out. The official endpoint
// already returns top-50 + Other per day, which is well within budget.
const TOP_N_MODELS = 20;

export interface UsageWeek {
  week: string; // YYYY-MM-DD (Monday, UTC)
  byModel: Record<string, number>;
}

export interface LeaderboardRow {
  slug: string;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  requests: number;
  /** WoW change as fraction (0.44 = +44%); null when no comparison. */
  change: number | null;
}

export interface OpenrouterUsagePayload {
  fetchedAt: string;
  source: string;
  weeks: UsageWeek[];
  modelsOrdered: string[];
  /** Top-30 latest-week leaderboard (mirrors openrouter.ai/rankings). */
  leaderboard: LeaderboardRow[];
}

interface OfficialRow {
  date?: unknown;
  model_permaslug?: unknown;
  total_tokens?: unknown;
}

const fetcher: Fetcher = {
  name: 'openrouter-usage',
  schedule: '13 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('openrouter-usage dry-run');
      return done(startedAt, 0, false, []);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    let weeks: UsageWeek[] = [];
    let sourceLabel = '';
    const errors: RunResult['errors'] = [];

    if (apiKey) {
      try {
        weeks = await fetchOfficial(ctx, apiKey);
        sourceLabel = 'openrouter.ai /api/v1/datasets/rankings-daily';
      } catch (err) {
        const message = (err as Error).message;
        ctx.log.warn({ err: message }, 'openrouter-usage: official endpoint failed, trying fallback');
        errors.push({ stage: 'fetch-official', message });
      }
    }

    if (weeks.length === 0) {
      try {
        weeks = await fetchFallback(ctx);
        sourceLabel = sourceLabel
          ? `${sourceLabel} (fallback after error)`
          : 'openrouter.ai /rankings server-action (RSC, no key)';
      } catch (err) {
        const message = (err as Error).message;
        ctx.log.warn({ err: message }, 'openrouter-usage: fallback also failed');
        errors.push({ stage: 'fetch-fallback', message });
      }
    }

    // Leaderboard pull — best-effort, never blocks the chart write. Uses
    // the dedicated Server Action; the official API would need a separate
    // aggregation step we haven't implemented (left as TODO once the
    // OPENROUTER_API_KEY arrives).
    let leaderboard: LeaderboardRow[] = [];
    try {
      leaderboard = await fetchLeaderboard(ctx);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'openrouter-usage: leaderboard fetch failed — sidebar will be empty');
      errors.push({ stage: 'fetch-leaderboard', message });
    }

    // Zero-write guard — preserve cache when both upstream paths failed.
    const existing = await readDataStore<OpenrouterUsagePayload>(REDIS_SLUG).catch(
      () => null,
    );
    const existingWeeks = existing?.weeks ?? [];
    if (shouldPreserveCache({ fresh: weeks, existing: existingWeeks })) {
      ctx.log.warn(
        { existing: existingWeeks.length },
        'openrouter-usage: empty fresh set — preserving last-known-good cache',
      );
      return done(startedAt, 0, false, [
        ...errors,
        { stage: 'normalise', message: 'no weeks; cache preserved' },
      ]);
    }

    const payload: OpenrouterUsagePayload = {
      fetchedAt: new Date().toISOString(),
      source: sourceLabel || 'unknown',
      weeks,
      modelsOrdered: deriveModelOrder(weeks),
      leaderboard,
    };

    let writeResult: Awaited<ReturnType<typeof writeDataStore>>;
    try {
      writeResult = await writeDataStore(REDIS_SLUG, payload);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.warn({ err: message }, 'openrouter-usage: writeDataStore failed');
      return done(startedAt, weeks.length, false, [
        ...errors,
        { stage: 'write', message },
      ]);
    }

    ctx.log.info(
      {
        slug: REDIS_SLUG,
        weeks: weeks.length,
        models: payload.modelsOrdered.length,
        leaderboard: leaderboard.length,
        source: sourceLabel,
        redisSource: writeResult.source,
      },
      'openrouter-usage published',
    );

    return {
      fetcher: 'openrouter-usage',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: weeks.length,
      itemsUpserted: 0,
      metricsWritten: weeks.length,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

// ---------------------------------------------------------------------------
// Official API path — per-model daily, aggregated to per-model weekly.
// ---------------------------------------------------------------------------

async function fetchOfficial(
  ctx: FetcherContext,
  apiKey: string,
): Promise<UsageWeek[]> {
  // 365 days back — matches the user-visible chart on openrouter.ai/rankings,
  // which goes back ~12 months. Well under the rate-limit budget (1 call / 6h
  // cadence = 4 calls/day vs the 500/day cap).
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86_400_000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const url = `${OFFICIAL_ENDPOINT}?start_date=${startStr}&end_date=${endStr}`;

  const { data } = await ctx.http.json<{ data?: OfficialRow[] }>(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': UA,
    },
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: 3,
    useEtagCache: false,
  });

  const rows = Array.isArray(data?.data) ? data.data : [];
  return aggregateRowsToWeekly(rows);
}

/**
 * Aggregate daily per-model rows into weekly (Monday-anchored) per-model.
 * Per week: keep the top-N models by tokens, fold the rest into "Others".
 */
export function aggregateRowsToWeekly(rows: OfficialRow[]): UsageWeek[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date : null;
    const slug = typeof row.model_permaslug === 'string' ? row.model_permaslug : null;
    const tokens =
      typeof row.total_tokens === 'string'
        ? Number(row.total_tokens)
        : typeof row.total_tokens === 'number'
          ? row.total_tokens
          : NaN;
    if (!date || !slug || !Number.isFinite(tokens) || tokens < 0) continue;
    const wk = mondayOf(date);
    if (!buckets.has(wk)) buckets.set(wk, new Map());
    const inner = buckets.get(wk)!;
    inner.set(slug, (inner.get(slug) ?? 0) + tokens);
  }
  const weeks = [...buckets.keys()].sort();
  return weeks.map((week) => {
    const inner = buckets.get(week)!;
    const entries = [...inner.entries()].sort((a, b) => b[1] - a[1]);
    const named = entries.filter(([k]) => k.toLowerCase() !== 'other').slice(0, TOP_N_MODELS);
    const rest = entries
      .filter(([k]) => k.toLowerCase() === 'other')
      .concat(entries.slice(TOP_N_MODELS));
    const byModel: Record<string, number> = {};
    for (const [k, v] of named) byModel[k] = v;
    const othersTotal = rest.reduce((s, [, v]) => s + v, 0);
    if (othersTotal > 0) byModel['Others'] = othersTotal;
    return { week, byModel };
  });
}

/** Monday (UTC) anchor for the week containing the given YYYY-MM-DD date. */
function mondayOf(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Fallback path — Next.js Server Action POST. Returns per-MODEL weekly tokens
// already as top-9 + "Others"; we pass it straight through.
// ---------------------------------------------------------------------------

interface FallbackPoint {
  x?: unknown;
  ys?: unknown;
}

async function fetchFallback(ctx: FetcherContext): Promise<UsageWeek[]> {
  const r = await fetch(FALLBACK_URL, {
    method: 'POST',
    headers: {
      'next-action': FALLBACK_NEXT_ACTION_MODEL,
      'content-type': 'text/plain;charset=UTF-8',
      'accept': 'text/x-component',
      'user-agent': UA,
      'next-router-state-tree': FALLBACK_ROUTER_STATE,
    },
    body: '[]',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!r.ok) {
    throw new Error(`fallback HTTP ${r.status}`);
  }
  const text = await r.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('1:'));
  if (!dataLine) {
    throw new Error('fallback returned no RSC data line');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLine.slice(2));
  } catch {
    throw new Error('fallback data line not JSON');
  }
  const arr = Array.isArray(parsed) ? (parsed as FallbackPoint[]) : [];
  ctx.log.info({ points: arr.length }, 'openrouter-usage fallback parsed');
  return arr
    .map((p): UsageWeek | null => {
      const x = typeof p.x === 'string' ? p.x : null;
      const ys = p.ys && typeof p.ys === 'object' ? (p.ys as Record<string, unknown>) : null;
      if (!x || !ys) return null;
      const byModel: Record<string, number> = {};
      for (const [k, v] of Object.entries(ys)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || n < 0) continue;
        // Canonicalise the "Others" bucket name across paths.
        const key = k.toLowerCase() === 'others' || k.toLowerCase() === 'other' ? 'Others' : k;
        byModel[key] = n;
      }
      return { week: x, byModel };
    })
    .filter(Boolean) as UsageWeek[];
}

// ---------------------------------------------------------------------------
// Leaderboard — calls the per-model dataset Server Action with body
// ["week"] so we get the latest week aggregated (~400 models with prompt/
// completion/reasoning split + WoW delta). We sum tokens per model across
// the few days the endpoint returns, keep the most-recent `change`, and
// trim to top-30.
// ---------------------------------------------------------------------------

interface RawLeaderboardRow {
  model_permaslug?: unknown;
  total_prompt_tokens?: unknown;
  total_completion_tokens?: unknown;
  total_native_tokens_reasoning?: unknown;
  count?: unknown;
  change?: unknown;
}

async function fetchLeaderboard(ctx: FetcherContext): Promise<LeaderboardRow[]> {
  const r = await fetch(FALLBACK_URL, {
    method: 'POST',
    headers: {
      'next-action': FALLBACK_NEXT_ACTION_LEADERBOARD,
      'content-type': 'text/plain;charset=UTF-8',
      'accept': 'text/x-component',
      'user-agent': UA,
      'next-router-state-tree': FALLBACK_ROUTER_STATE,
    },
    body: '["week"]',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`leaderboard HTTP ${r.status}`);
  const text = await r.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('1:'));
  if (!dataLine) throw new Error('leaderboard returned no RSC data line');
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLine.slice(2));
  } catch {
    throw new Error('leaderboard data line not JSON');
  }
  const arr = Array.isArray(parsed) ? (parsed as RawLeaderboardRow[]) : [];
  const bucket = new Map<string, LeaderboardRow>();
  for (const row of arr) {
    const slug = typeof row.model_permaslug === 'string' ? row.model_permaslug : null;
    if (!slug) continue;
    const num = (v: unknown): number => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const prev = bucket.get(slug) ?? {
      slug,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalReasoningTokens: 0,
      requests: 0,
      change: null,
    };
    prev.totalPromptTokens += num(row.total_prompt_tokens);
    prev.totalCompletionTokens += num(row.total_completion_tokens);
    prev.totalReasoningTokens += num(row.total_native_tokens_reasoning);
    prev.requests += num(row.count);
    if (row.change != null) {
      const c = Number(row.change);
      if (Number.isFinite(c)) prev.change = c;
    }
    bucket.set(slug, prev);
  }
  const out = [...bucket.values()]
    .map((r) => ({
      ...r,
      totalTokens: r.totalPromptTokens + r.totalCompletionTokens + r.totalReasoningTokens,
    }))
    .filter((r) => r.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 30);
  ctx.log.info({ rows: out.length }, 'openrouter-usage leaderboard parsed');
  return out;
}

// ---------------------------------------------------------------------------
// Model ordering — by latest-week total desc, "Others" pinned last.
// ---------------------------------------------------------------------------

function deriveModelOrder(weeks: UsageWeek[]): string[] {
  if (weeks.length === 0) return [];
  const last = weeks[weeks.length - 1]!.byModel;
  const entries = Object.entries(last);
  const others = entries.filter(([k]) => k.toLowerCase() === 'others');
  const named = entries
    .filter(([k]) => k.toLowerCase() !== 'others')
    .sort((a, b) => b[1] - a[1]);
  return [...named.map(([k]) => k), ...others.map(([k]) => k)];
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'openrouter-usage',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
