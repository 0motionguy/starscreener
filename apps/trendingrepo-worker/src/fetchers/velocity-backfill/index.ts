// velocity-backfill — daily FULL-REGISTRY star-velocity backfill via the GitHub
// GraphQL stargazer timestamps (the token pool), giving every repo a real
// `stars_now` AND real 24h/7d/30d deltas — retroactively, in one pass.
//
// WHY THIS EXISTS
// The two-tier engine (velocity-refresh */40 + velocity-seed daily) only ever
// touches the TOP-N by current velocity (300 / 150). The ~700-repo long tail
// never gets a `star-activity:*` series, so it has no delta entry ("— — —")
// and no `stars_now` ("0 stars"). That's ~half the board. This fetcher closes
// the gap for the WHOLE registry.
//
// WHY GRAPHQL, NOT (a) the REST stargazer walk, (b) ClickHouse/GH-Archive
//   (a) The REST `star+json` page-walk is multi-page + heavy and trips GitHub's
//       SECONDARY rate limit at scale (velocity-seed's header records 571/700
//       failing in one sweep) — that's exactly why velocity-seed stays bounded.
//   (b) The public ClickHouse `github_events` playground is ~6 weeks STALE
//       (verified 2026-05-29: max(created_at) = 2026-04-16, zero May data), so
//       it cannot supply CURRENT 7d/30d. GH-Archive raw is current but ~tens of
//       GB/day to process — not a daily worker job.
//   GraphQL `stargazers(last:100, orderBy:STARRED_AT)` costs ONE rate-limit
//   point and returns the 100 most-recent stars WITH timestamps + the current
//   total. For the slow long tail (the repos showing "— — —"), 100 stars spans
//   weeks/months → exact 24h/7d/30d from a single query. Hot repos (>100 stars
//   in the window) get a bounded page-back; mega-breakouts fall back to a
//   cold-start lower bound (still ranked, already covered by velocity-refresh).
//   Aliasing batches ~20 repos per HTTP call → ~50 calls + ~1k points for the
//   whole registry: trivial for the 20-token pool (100k points/hr).
//
// OUTPUT (same shapes + slugs as the rest of the engine — zero app changes):
//   - per repo: merges a timestamp-accurate recent window into
//     `star-activity:<owner>__<name>` (older history preserved for the chart).
//   - assembles the FULL `star-activity-deltas` slug (entryFromPayload for every
//     repo) so coverage jumps immediately, not after the 05:30 recompute.
//   ZERO-WRITE GUARD (shouldPreserveCache) never blanks a populated slug — also
//   satisfies lint:guards / keep-last-50.
//
// SCHEDULE Daily 02:17 UTC — before star-activity (04:17), the deltas recompute
// (05:30) and velocity-seed (06:13), so its per-repo series feed everything
// downstream the same morning.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import {
  pickGithubToken,
  parseRateLimitHeaders,
  recordRateLimit,
} from '../../lib/util/github-token-pool.js';
import {
  rankedRegistryFullNames,
  type RegistryPayloadLite,
} from '../../lib/util/registry-candidates.js';
import { buildRecentPoints } from '../velocity-seed/index.js';
import { mergeDeltaRepos, computeCoverage } from '../velocity-refresh/index.js';
import { type StarActivityPayload } from '../star-activity/index.js';
import {
  entryFromPayload,
  type SADeltaEntry,
  type StarActivityDeltasPayload,
} from '../star-activity-deltas/index.js';

type StarActivityPoint = StarActivityPayload['points'][number];

// --- env-tunable knobs -----------------------------------------------------

function clampEnv(name: string, def: number, lo: number, hi: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  const v = Number.isFinite(n) && n > 0 ? n : def;
  return Math.max(lo, Math.min(hi, v));
}

// Process the whole registry by default (cap is a safety valve, not a target).
const MAX_REPOS = clampEnv('VELOCITY_BACKFILL_MAX', 5000, 10, 20000);
// Repos aliased per GraphQL HTTP call. 20 × 100 edges = 2k nodes/query — far
// under GitHub's 500k node ceiling; cost ≈ 1 point/repo.
const BATCH = clampEnv('VELOCITY_BACKFILL_BATCH', 20, 1, 50);
// Parallel in-flight GraphQL batches. Gentle on purpose (the pool is shared).
const CONCURRENCY = clampEnv('VELOCITY_BACKFILL_CONCURRENCY', 3, 1, 8);
// Window we reconstruct (30d + tolerance headroom).
const RECENT_DAYS = clampEnv('VELOCITY_BACKFILL_RECENT_DAYS', 35, 7, 90);
// Extra stargazer pages for hot repos whose last-100 stars don't reach 30d back.
// 400×100 = 40k stars → exact 30d for anything gaining <~1.3k/day (covers all
// but rare viral megaspikes). The loop STOPS early once it reaches the 30d
// cutoff, so slow/moderate repos walk only a few pages — the high cap only bites
// the genuinely fast ones. Safe to walk hard: a full deep run logged 0 secondary
// rate-limit hits across the 20-token pool. Skipped entirely once a repo already
// resolves both windows (see existingCoversWindows), so the hot set is deep-walked
// once then maintained cheaply by daily snapshots.
const MAX_PAGEBACK = clampEnv('VELOCITY_BACKFILL_MAX_PAGEBACK', 400, 0, 1000);
const PAGEBACK_DELAY_MS = 60; // gentle inter-page delay during deep walks
// Hard ceiling on total stargazer page-back requests PER RUN so the backfill
// can't drain the GraphQL pool the Next.js app shares. Tuned 2026-05-30: 15k
// left ~130 repos cold-start on 30d after one run; 30k hits ~98%+ in a single
// pass at 02:17 UTC when app traffic is low. The skip-guard means each daily
// run only walks repos still missing a window, so coverage converges across
// runs even when a single run is budget-capped.
const PAGE_BUDGET = clampEnv('VELOCITY_BACKFILL_PAGE_BUDGET', 30000, 100, 100000);

// Per-run remaining page-back budget (reset at the top of run()).
let pagebackBudgetRemaining = 0;

const GRAPHQL_URL = 'https://api.github.com/graphql';
const STARS_PAGE = 100;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_500;
const MAX_BACKOFF_MS = 20_000;
const DAY_MS = 86_400_000;
const USER_AGENT = 'starscreener-velocity-backfill';

// --- pure helpers (exported for unit tests) --------------------------------

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * True when the existing series ALREADY yields non-cold-start 7d AND 30d via the
 * engine's own delta logic — the only safe signal that the deep stargazer
 * page-back can be skipped this run. A lone ancient point is NOT enough: a series
 * like [Jan-18, today] has no anchor near the 7d/30d targets, so
 * computeWindowDelta falls to cold-start. Reusing entryFromPayload guarantees the
 * skip decision matches exactly what the board will display. Pure.
 */
export function existingCoversWindows(
  payload: Parameters<typeof entryFromPayload>[0],
): boolean {
  const e = entryFromPayload(payload);
  if (!e) return false;
  const ok = (b: string): boolean => b !== 'cold-start' && b !== 'no-history';
  return ok(e.delta_7d.basis) && ok(e.delta_30d.basis);
}

const STARGAZER_FRAGMENT = `fragment SG on Repository {
  stargazerCount
  stargazers(last: ${STARS_PAGE}, orderBy: {field: STARRED_AT, direction: ASC}) {
    totalCount
    pageInfo { hasPreviousPage startCursor }
    edges { starredAt }
  }
}`;

/** Build an aliased multi-repo GraphQL query. `repos` are `owner/name`. Pure. */
export function buildBatchQuery(repos: readonly string[]): string {
  const fields = repos
    .map((fullName, i) => {
      const [owner, name] = fullName.split('/');
      if (!owner || !name) return '';
      return `  r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(
        name,
      )}) { ...SG }`;
    })
    .filter(Boolean)
    .join('\n');
  return `query {\n  rateLimit { remaining resetAt cost }\n${fields}\n}\n${STARGAZER_FRAGMENT}`;
}

export interface ParsedRepo {
  total: number;
  starredAtMs: number[]; // ascending
  hasPreviousPage: boolean;
  startCursor: string | null;
}

/** Parse one `repository` GraphQL node into a normalized shape. Pure. */
export function parseRepoNode(node: unknown): ParsedRepo | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as {
    stargazerCount?: unknown;
    stargazers?: {
      totalCount?: unknown;
      pageInfo?: { hasPreviousPage?: unknown; startCursor?: unknown };
      edges?: Array<{ starredAt?: unknown }>;
    };
  };
  const total =
    typeof n.stargazerCount === 'number'
      ? n.stargazerCount
      : typeof n.stargazers?.totalCount === 'number'
        ? n.stargazers.totalCount
        : null;
  if (total === null) return null;
  const edges = Array.isArray(n.stargazers?.edges) ? n.stargazers!.edges : [];
  const starredAtMs: number[] = [];
  for (const e of edges) {
    const t = typeof e?.starredAt === 'string' ? Date.parse(e.starredAt) : NaN;
    if (Number.isFinite(t)) starredAtMs.push(t);
  }
  starredAtMs.sort((a, b) => a - b);
  return {
    total,
    starredAtMs,
    hasPreviousPage: n.stargazers?.pageInfo?.hasPreviousPage === true,
    startCursor:
      typeof n.stargazers?.pageInfo?.startCursor === 'string'
        ? n.stargazers.pageInfo.startCursor
        : null,
  };
}

/**
 * Reconstruct a dense daily cumulative series from collected star timestamps.
 *
 * `coveredFirstStar` (we collected EVERY star → timestamps reach inception)
 * lets us floor the series at the window start and 0-fill: a star count is
 * genuinely 0 before a repo's first star, so a young viral repo's 30d delta
 * correctly equals its full count. When we did NOT reach the first star (a hot
 * repo whose page-back ran out), we floor at the oldest timestamp we actually
 * have and let computeWindowDelta gate the unreachable windows to `cold-start`
 * (an honest lower bound) rather than fabricating a 0-floor.
 *
 * Pure. Delegates the cumulative math to velocity-seed's `buildRecentPoints`.
 */
export function reconstructDenseSeries(opts: {
  timestamps: number[];
  total: number;
  coveredFirstStar: boolean;
  recentDays: number;
  now?: Date;
}): StarActivityPoint[] {
  const { timestamps, total, coveredFirstStar, recentDays } = opts;
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const cutoffMs = nowMs - recentDays * DAY_MS;

  let oldestMs = Infinity;
  for (const t of timestamps) if (t < oldestMs) oldestMs = t;

  // Reliable floor: covered → window start (0 before inception is real); not
  // covered → oldest timestamp we hold (don't invent a 0-floor for the gap),
  // but never older than the window we care about.
  const floorMs = coveredFirstStar
    ? cutoffMs
    : Number.isFinite(oldestMs)
      ? Math.max(oldestMs, cutoffMs)
      : cutoffMs;
  const floorDayMs = Date.parse(`${dayKey(floorMs)}T00:00:00Z`);
  const endDayMs = Date.parse(`${dayKey(nowMs)}T00:00:00Z`);

  const perDay = new Map<string, number>();
  for (const t of timestamps) {
    if (t < floorDayMs) continue;
    const d = dayKey(t);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  // Dense 0-fill every day in [floorDay, today] so window anchors (today-7,
  // today-30) always have an exact point to diff against.
  for (let cur = floorDayMs; cur <= endDayMs; cur += DAY_MS) {
    const d = dayKey(cur);
    if (!perDay.has(d)) perDay.set(d, 0);
  }
  return buildRecentPoints(perDay, total, now);
}

// --- GraphQL IO ------------------------------------------------------------

function ghHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST a GraphQL query, honoring rate limits (records headers back into the
 * shared pool; backs off + rotates the token on 403/429/5xx). Returns the
 * parsed JSON (which may carry partial `data` alongside `errors`) or null.
 */
async function runGraphql(
  query: string,
  token0: string | undefined,
  log: FetcherContext['log'],
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] } | null> {
  let token = token0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      await sleep(Math.min(BASE_BACKOFF_MS * (attempt + 1), MAX_BACKOFF_MS));
      token = pickGithubToken() ?? token;
      continue;
    }
    if (token) {
      const rl = parseRateLimitHeaders(res.headers);
      if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec);
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const raRaw = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
      const waitMs =
        Number.isFinite(raRaw) && raRaw > 0
          ? Math.min(raRaw * 1000, MAX_BACKOFF_MS)
          : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      log.warn({ status: res.status, waitMs }, 'velocity-backfill: rate-limited — backing off + rotating token');
      await sleep(waitMs);
      token = pickGithubToken() ?? token;
      continue;
    }
    if (!res.ok) return null;
    let json: { data?: Record<string, unknown>; errors?: unknown[] };
    try {
      json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    } catch {
      return null;
    }
    // CRITICAL: GraphQL reports rate-limits as HTTP 200 with errors[].type
    // 'RATE_LIMITED'/'RATE_LIMIT' (NOT a 403/429 status). recordRateLimit above
    // already marked this token exhausted (remaining=0) so pickGithubToken skips
    // it; here we back off + rotate to a fresh token and retry rather than
    // silently dropping the batch.
    if (isGraphqlRateLimited(json)) {
      log.warn({ attempt }, 'velocity-backfill: GraphQL rate-limited (200+errors) — rotating token');
      await sleep(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
      token = pickGithubToken() ?? token;
      continue;
    }
    return json;
  }
  return null;
}

/** GraphQL surfaces rate-limits as HTTP 200 + an errors[] entry, not a status code. */
function isGraphqlRateLimited(json: { errors?: unknown[] } | null): boolean {
  return (
    !!json &&
    Array.isArray(json.errors) &&
    json.errors.some(
      (e) =>
        !!e &&
        typeof e === 'object' &&
        ((e as { type?: unknown }).type === 'RATE_LIMITED' ||
          (e as { type?: unknown }).type === 'RATE_LIMIT'),
    )
  );
}

/**
 * Page backwards through older stargazers for a hot repo until we reach the
 * window cutoff or run out of budget. Returns the extra timestamps collected.
 */
async function pageBackOlder(
  fullName: string,
  startCursor: string,
  cutoffMs: number,
  log: FetcherContext['log'],
): Promise<number[]> {
  const [owner, name] = fullName.split('/');
  if (!owner || !name) return [];
  const extra: number[] = [];
  let cursor: string | null = startCursor;
  for (let i = 0; i < MAX_PAGEBACK && cursor; i++) {
    if (pagebackBudgetRemaining <= 0) break; // per-run pool budget spent
    pagebackBudgetRemaining -= 1;
    if (i > 0) await sleep(PAGEBACK_DELAY_MS);
    const token = pickGithubToken() ?? undefined;
    const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(
      name,
    )}) { stargazers(last: ${STARS_PAGE}, before: ${JSON.stringify(
      cursor,
    )}, orderBy: {field: STARRED_AT, direction: ASC}) { pageInfo { hasPreviousPage startCursor } edges { starredAt } } } }`;
    const json = await runGraphql(query, token, log);
    const node = (json?.data?.repository ?? null) as {
      stargazers?: {
        pageInfo?: { hasPreviousPage?: unknown; startCursor?: unknown };
        edges?: Array<{ starredAt?: unknown }>;
      };
    } | null;
    const edges = Array.isArray(node?.stargazers?.edges) ? node!.stargazers!.edges : [];
    if (edges.length === 0) break;
    let oldestMs = Infinity;
    for (const e of edges) {
      const t = typeof e?.starredAt === 'string' ? Date.parse(e.starredAt) : NaN;
      if (!Number.isFinite(t)) continue;
      extra.push(t);
      if (t < oldestMs) oldestMs = t;
    }
    if (oldestMs <= cutoffMs) break; // reached the window — done
    const pi = node?.stargazers?.pageInfo;
    if (pi?.hasPreviousPage !== true || typeof pi.startCursor !== 'string') break;
    cursor = pi.startCursor;
  }
  return extra;
}

// --- per-repo processing ---------------------------------------------------

interface RepoOutcome {
  status: 'ok' | 'skip';
  entry?: SADeltaEntry;
}

async function processRepo(
  fullName: string,
  parsed: ParsedRepo,
  now: Date,
  log: FetcherContext['log'],
): Promise<RepoOutcome> {
  const total = parsed.total;
  if (total <= 0) return { status: 'skip' };

  const cutoffMs = now.getTime() - RECENT_DAYS * DAY_MS;

  // Read existing FIRST: if it already resolves BOTH windows (non-cold-start 7d
  // AND 30d — from a prior deep walk or dense daily snapshots), skip the
  // expensive page-back and just refresh the recent window. This keeps the engine
  // sustainable: the hot set is deep-walked once, then maintained cheaply. NOTE:
  // a lone ancient point must NOT short-circuit the walk (that bug left 184 repos
  // cold-start) — existingCoversWindows uses the real delta basis, not "has any
  // old point".
  const slug = payloadSlug(fullName);
  const existing = await readDataStore<StarActivityPayload>(slug).catch(() => null);
  const existingPoints = Array.isArray(existing?.points) ? existing.points : [];
  const existingCoversWindow = existingCoversWindows(existing);

  let timestamps = parsed.starredAtMs;
  // coveredFirstStar = we hold a timestamp for every star the repo has.
  let coveredFirstStar = total <= timestamps.length;
  const oldestMs = timestamps.length > 0 ? timestamps[0]! : Infinity;

  // Hot repo: 100 most-recent stars don't reach the window floor and there's
  // more history → page back (bounded) to recover exact 7d/30d. Skipped when
  // the existing series already covers the window.
  if (
    !coveredFirstStar &&
    !existingCoversWindow &&
    oldestMs > cutoffMs &&
    parsed.hasPreviousPage &&
    parsed.startCursor
  ) {
    const extra = await pageBackOlder(fullName, parsed.startCursor, cutoffMs, log);
    if (extra.length > 0) {
      timestamps = [...timestamps, ...extra].sort((a, b) => a - b);
      coveredFirstStar = total <= timestamps.length;
    }
  }

  const recentPoints = reconstructDenseSeries({
    timestamps,
    total,
    coveredFirstStar,
    recentDays: RECENT_DAYS,
    now,
  });
  if (recentPoints.length < 2) return { status: 'skip' };

  const firstRecentDay = recentPoints[0]!.d;
  // Preserve older chart history; replace the recent window with our
  // timestamp-accurate points.
  const older = existingPoints.filter((p) => p && p.d < firstRecentDay);
  const merged = [...older, ...recentPoints];

  const payload: StarActivityPayload = {
    repoId: fullName,
    points: merged,
    firstObservedAt: existing?.firstObservedAt ?? `${merged[0]?.d ?? firstRecentDay}T00:00:00Z`,
    // Only claim genuine inception when we actually reached the first star;
    // otherwise leave the existing flag / fall back to snapshot-only so the
    // young-repo shortcut in computeWindowDelta can't misfire on a hot repo.
    backfillSource: coveredFirstStar
      ? 'stargazer-api'
      : existing?.backfillSource && existing.backfillSource !== 'snapshot-only'
        ? existing.backfillSource
        : 'snapshot-only',
    coversFirstStar: coveredFirstStar || existing?.coversFirstStar === true,
    updatedAt: now.toISOString(),
  };
  await writeDataStore(slug, payload, { writer: 'velocity-backfill' });

  const entry = entryFromPayload(payload);
  return entry ? { status: 'ok', entry } : { status: 'skip' };
}

// --- fetcher ---------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'velocity-backfill',
  schedule: '17 2 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const now = new Date();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('velocity-backfill dry-run');
      return done(startedAt, 0, false, errors);
    }
    if (!pickGithubToken()) {
      ctx.log.warn('velocity-backfill: no GitHub token in pool — skipping run');
      return done(startedAt, 0, false, errors);
    }

    pagebackBudgetRemaining = PAGE_BUDGET; // reset per-run deep-walk budget

    const registry = await readDataStore<RegistryPayloadLite>('repo-registry').catch(
      () => null,
    );
    // The WHOLE registry (most-recently-seen first), not a top-N slice.
    const candidates = rankedRegistryFullNames(registry, MAX_REPOS, 'desc');
    if (candidates.length === 0) {
      ctx.log.warn('velocity-backfill: no registry candidates available');
      return done(startedAt, 0, false, errors);
    }

    const batches = chunk(candidates, BATCH);
    const fresh: Record<string, SADeltaEntry> = {};
    let ok = 0;
    let skip = 0;

    const queue = [...batches];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const batch = queue.shift();
        if (!batch) break;
        const token = pickGithubToken() ?? undefined;
        const json = await runGraphql(buildBatchQuery(batch), token, ctx.log);
        if (!json?.data) {
          skip += batch.length;
          continue;
        }
        for (let i = 0; i < batch.length; i++) {
          const fullName = batch[i]!;
          const parsed = parseRepoNode(json.data[`r${i}`]);
          if (!parsed) {
            skip += 1;
            continue;
          }
          try {
            const out = await processRepo(fullName, parsed, now, ctx.log);
            if (out.status === 'ok' && out.entry) {
              fresh[fullName.toLowerCase()] = out.entry;
              ok += 1;
            } else {
              skip += 1;
            }
          } catch (err) {
            skip += 1;
            errors.push({
              stage: `repo:${fullName}`,
              message: (err as Error).message ?? String(err),
            });
          }
        }
      }
    });
    await Promise.all(workers);

    const freshEntries = Object.values(fresh);

    // Re-read right before merge to shrink the cross-fetcher race with the
    // */40 velocity-refresh tick (same pattern velocity-refresh uses).
    const latest = await readDataStore<StarActivityDeltasPayload>(
      'star-activity-deltas',
    ).catch(() => null);
    const priorRepos = latest?.repos ?? {};

    // Zero-write guard: a fully-failed run (pool dead / GitHub down) must never
    // blank a populated slug.
    if (shouldPreserveCache({ fresh: freshEntries, existing: Object.values(priorRepos) })) {
      ctx.log.error(
        { candidates: candidates.length, priorRepos: Object.keys(priorRepos).length },
        'velocity-backfill: empty recompute — preserving prior slug (check GH token pool health)',
      );
      errors.push({
        stage: 'empty-recompute',
        message: 'all repo backfills failed (likely GH token pool exhausted); preserved prior slug',
      });
      return done(startedAt, 0, false, errors);
    }

    const mergedRepos = mergeDeltaRepos(priorRepos, fresh);
    const payload: StarActivityDeltasPayload = {
      computedAt: now.toISOString(),
      coverage: computeCoverage(mergedRepos),
      repos: mergedRepos,
    };
    try {
      const result = await writeDataStore('star-activity-deltas', payload, {
        writer: 'velocity-backfill',
      });
      ctx.log.info(
        {
          candidates: candidates.length,
          ok,
          skip,
          totalRepos: Object.keys(mergedRepos).length,
          coverage: payload.coverage,
          redisSource: result.source,
        },
        'velocity-backfill published',
      );
      return done(startedAt, ok, result.source === 'redis', errors);
    } catch (err) {
      errors.push({
        stage: 'write:star-activity-deltas',
        message: (err as Error).message ?? String(err),
      });
      ctx.log.error({ err }, 'velocity-backfill: slug write failed — prior preserved');
      return done(startedAt, 0, false, errors);
    }
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'velocity-backfill',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
