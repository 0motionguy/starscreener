// velocity-seed — daily BOUNDED, THROTTLED newest-first stargazer walk that
// seeds recent 7d/30d anchor points for the top-N most-active repos.
//
// WHY THIS EXISTS
// 7d/30d deltas diff today's star count against a point ~7/30 days ago. Most
// repos have no such anchor: the daily `star-activity` snapshot only started
// covering the full registry recently, and the OLDEST-first backfill rarely
// reaches recent pages on big repos. Walking the stargazer list NEWEST-first and
// bucketing the last ~35 days by day creates dense recent anchors cheaply (only
// the last few pages), so `velocity-refresh` / `star-activity-deltas` can compute
// REAL 7d/30d immediately instead of waiting days for the snapshot to accrue.
// Proven on individual repos: backnotprop/plannotator → 7d +173 / 30d +937;
// scrapegraphai/scrapegraph-ai → 7d +642 / 30d +3005.
//
// ⚠️ SCALE FINDING — DO NOT widen this to the full registry.
// A naive 700-repo newest-first sweep (concurrency 6, 20-token pool) failed
// 571/700 to GitHub's secondary rate limit: clean through ~125 repos, then 403s
// cascaded. The walk is intrinsically expensive (multi-page, heavy `star+json`).
// So this fetcher is deliberately:
//   - BOUNDED to the top-N (~150) by current velocity (the visible movers), and
//   - THROTTLED: low concurrency (2), inter-page delay, per-repo token rotation,
//     and on a 403/429 it HONORS Retry-After and backs off + rotates the token
//     (not just "rotate and retry instantly", which is what tripped the limit).
// Broad/long-tail coverage is the cheap daily `star-activity` snapshot's job, not
// this one's.
//
// OUTPUT merges recent points into each repo's `star-activity:<owner>__<name>`
// slug (older history preserved for the chart; recent window from this walk;
// backfillSource marked "stargazer-api" so deltas trusts points[0] as inception
// for genuinely-young repos). The deltas are recomputed downstream, unchanged.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { writeDynamicOutputMarker } from '../../lib/dynamic-output-marker.js';
import {
  pickGithubToken,
  parseRateLimitHeaders,
  recordRateLimit,
} from '../../lib/util/github-token-pool.js';
import { type RegistryPayloadLite } from '../../lib/util/registry-candidates.js';
import { type StarActivityPayload } from '../star-activity/index.js';
import { type StarActivityDeltasPayload } from '../star-activity-deltas/index.js';
import { pickTopByVelocity } from '../velocity-refresh/index.js';

type StarActivityPoint = StarActivityPayload['points'][number];

// --- env-tunable knobs -----------------------------------------------------

function clampEnv(name: string, def: number, lo: number, hi: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  const v = Number.isFinite(n) && n > 0 ? n : def;
  return Math.max(lo, Math.min(hi, v));
}

const SEED_TOP_N = clampEnv('VELOCITY_SEED_TOP_N', 150, 10, 800);
const RECENT_DAYS = clampEnv('VELOCITY_SEED_RECENT_DAYS', 35, 7, 90);
const CONCURRENCY = 2; // low on purpose — see SCALE FINDING above
const GITHUB_API = 'https://api.github.com';
const PER_PAGE = 100;
const PAGE_LIST_CAP = 400; // GitHub caps stargazer pagination at ~400 pages
const RATE_FLOOR = 150; // stop walking a repo when a token nears exhaustion
const PAGE_DELAY_MS = 75;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_500;
const MAX_BACKOFF_MS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;

// --- helpers ---------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

function starHeaders(token: string | undefined): Record<string, string> {
  // star+json yields per-stargazer `starred_at` timestamps.
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.star+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'starscreener-velocity-seed',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function remaining(res: Response): number | null {
  const n = Number.parseInt(res.headers.get('x-ratelimit-remaining') ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchCurrentStars(
  fullName: string,
  token: string | undefined,
): Promise<number | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${fullName}`, {
      headers: starHeaders(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (token) {
      const rl = parseRateLimitHeaders(res.headers);
      if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec, rl.resource ?? 'core');
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

/**
 * Fetch one stargazer page, honoring secondary rate limits: on 403/429 it waits
 * Retry-After (capped) — or an exponential backoff when the header is absent —
 * then rotates to a fresh pool token and retries, up to MAX_ATTEMPTS. Returns
 * the response + the token that produced it, or null if all attempts are
 * exhausted (caller should stop walking this repo and keep what it has).
 */
async function fetchPageWithBackoff(
  url: string,
  token0: string | undefined,
  log: FetcherContext['log'],
): Promise<{ res: Response; token: string | undefined } | null> {
  let token = token0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: starHeaders(token),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      await sleep(Math.min(BASE_BACKOFF_MS * (attempt + 1), MAX_BACKOFF_MS));
      token = pickGithubToken() ?? token;
      continue;
    }
    if (token) {
      const rl = parseRateLimitHeaders(res.headers);
      if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec, rl.resource ?? 'core');
    }
    if (res.status === 403 || res.status === 429) {
      const raRaw = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
      const waitMs =
        Number.isFinite(raRaw) && raRaw > 0
          ? Math.min(raRaw * 1000, MAX_BACKOFF_MS)
          : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      log.warn(
        { url, status: res.status, waitMs },
        'velocity-seed: rate-limited — backing off + rotating token',
      );
      await sleep(waitMs);
      token = pickGithubToken() ?? token;
      continue;
    }
    return { res, token };
  }
  return null;
}

/**
 * Build cumulative daily points from a per-day new-star count map and the
 * current total. Walks days descending, subtracting each day's gains to get the
 * count as it stood at the END of each day. Always ends with a today anchor.
 *
 * Pure.
 */
export function buildRecentPoints(
  perDay: Map<string, number>,
  total: number,
  now: Date = new Date(),
): StarActivityPoint[] {
  const days = Array.from(perDay.keys()).sort();
  const cumByDay = new Map<string, number>();
  let after = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    cumByDay.set(d, total - after);
    after += perDay.get(d) ?? 0;
  }
  const points: StarActivityPoint[] = days.map((d) => ({
    d,
    s: cumByDay.get(d) ?? total,
    delta: perDay.get(d) ?? 0,
  }));
  const today = now.toISOString().slice(0, 10);
  if (points.length === 0 || points[points.length - 1]!.d !== today) {
    points.push({ d: today, s: total, delta: 0 });
  }
  return points;
}

/**
 * Newest-first stargazer walk: paginate DESC from the last page, bucket the last
 * `recentDays` of `starred_at` timestamps by day, stop once a whole page predates
 * the window (everything older lies on lower pages). Returns the per-day count.
 */
async function walkRecentPerDay(
  fullName: string,
  token0: string | undefined,
  recentDays: number,
  log: FetcherContext['log'],
): Promise<Map<string, number>> {
  const cutoff = Date.now() - recentDays * DAY_MS;
  const perDay = new Map<string, number>();
  let token = token0;

  const consume = (data: unknown[]): number => {
    let oldestT = Infinity;
    for (const e of data) {
      const starredAt = (e as { starred_at?: unknown })?.starred_at;
      if (typeof starredAt !== 'string') continue;
      const t = Date.parse(starredAt);
      if (!Number.isFinite(t)) continue;
      if (t < oldestT) oldestT = t;
      if (t >= cutoff) {
        const d = starredAt.slice(0, 10);
        perDay.set(d, (perDay.get(d) ?? 0) + 1);
      }
    }
    return oldestT;
  };

  const probe = await fetchPageWithBackoff(
    `${GITHUB_API}/repos/${fullName}/stargazers?per_page=${PER_PAGE}&page=1`,
    token,
    log,
  );
  if (!probe || !probe.res.ok) return perDay;
  token = probe.token;
  let lastRem = remaining(probe.res);
  const link = probe.res.headers.get('link') || '';
  const m = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  const lastPage = Math.min(m ? Number.parseInt(m[1]!, 10) : 1, PAGE_LIST_CAP);

  if (lastPage === 1) {
    const data = (await probe.res.json().catch(() => null)) as unknown;
    if (Array.isArray(data)) consume(data);
    return perDay;
  }

  for (let page = lastPage; page >= 1; page--) {
    if (lastRem !== null && lastRem < RATE_FLOOR) break;
    if (page < lastPage) await sleep(PAGE_DELAY_MS);
    const r = await fetchPageWithBackoff(
      `${GITHUB_API}/repos/${fullName}/stargazers?per_page=${PER_PAGE}&page=${page}`,
      token,
      log,
    );
    if (!r || !r.res.ok) break; // exhausted backoff or hard error — keep what we have
    token = r.token;
    lastRem = remaining(r.res);
    const data = (await r.res.json().catch(() => null)) as unknown;
    if (!Array.isArray(data) || data.length === 0) continue;
    const oldestT = consume(data);
    if (Number.isFinite(oldestT) && oldestT < cutoff) break;
  }
  return perDay;
}

async function seedOne(
  fullName: string,
  log: FetcherContext['log'],
): Promise<'ok' | 'thin' | 'skip'> {
  const token = pickGithubToken() ?? undefined;
  const total = await fetchCurrentStars(fullName, token);
  if (total === null) return 'skip';

  const perDay = await walkRecentPerDay(fullName, token, RECENT_DAYS, log);
  const recentPoints = buildRecentPoints(perDay, total);
  if (recentPoints.length < 2) return 'thin';

  const slug = payloadSlug(fullName);
  const existing = await readDataStore<StarActivityPayload>(slug).catch(() => null);
  const existingPoints = Array.isArray(existing?.points) ? existing.points : [];
  const firstRecentDay = recentPoints[0]!.d;
  // Keep older history (chart); the recent window comes from this walk.
  const older = existingPoints.filter((p) => p && p.d < firstRecentDay);
  const merged = [...older, ...recentPoints];

  const payload: StarActivityPayload = {
    repoId: fullName,
    points: merged,
    firstObservedAt:
      existing?.firstObservedAt ?? `${merged[0]?.d ?? recentPoints[0]!.d}T00:00:00Z`,
    backfillSource:
      existing?.backfillSource && existing.backfillSource !== 'snapshot-only'
        ? existing.backfillSource
        : 'stargazer-api',
    coversFirstStar: existing?.coversFirstStar ?? older.length > 0,
    updatedAt: new Date().toISOString(),
  };
  await writeDataStore(slug, payload, { writer: 'velocity-seed' });
  return 'ok';
}

// --- fetcher ---------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'velocity-seed',
  // Daily 06:13 UTC — off-peak, after star-activity (04:17) + star-activity-deltas
  // (05:30) have run, so the velocity ranking it selects on is fresh.
  schedule: '13 6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('velocity-seed dry-run');
      return done(startedAt, 0, false, errors);
    }

    if (!pickGithubToken()) {
      ctx.log.warn('velocity-seed: no GitHub token in pool — skipping run');
      return done(startedAt, 0, false, errors);
    }

    const [registry, deltas] = await Promise.all([
      readDataStore<RegistryPayloadLite>('repo-registry').catch(() => null),
      readDataStore<StarActivityDeltasPayload>('star-activity-deltas').catch(() => null),
    ]);

    const candidates = pickTopByVelocity(deltas, registry, SEED_TOP_N);
    if (candidates.length === 0) {
      ctx.log.warn('velocity-seed: no candidates available');
      return done(startedAt, 0, false, errors);
    }

    let ok = 0;
    let thin = 0;
    let skip = 0;

    const queue = [...candidates];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const fullName = queue.shift();
        if (!fullName) break;
        try {
          const r = await seedOne(fullName, ctx.log);
          if (r === 'ok') ok += 1;
          else if (r === 'thin') thin += 1;
          else skip += 1;
        } catch (err) {
          skip += 1;
          errors.push({
            stage: `repo:${fullName}`,
            message: (err as Error).message ?? String(err),
          });
        }
      }
    });
    await Promise.all(workers);

    ctx.log.info(
      { candidates: candidates.length, ok, thin, skip },
      'velocity-seed published',
    );

    const markerPublished = await writeDynamicOutputMarker({
      fetcher: 'velocity-seed',
      outputPattern: 'star-activity:<owner>__<name>',
      startedAt,
      candidates: candidates.length,
      updated: ok,
      skipped: thin + skip,
      failed: errors.length,
    }).catch((err) => {
      errors.push({
        stage: 'write:worker-health:velocity-seed',
        message: (err as Error).message ?? String(err),
      });
      return false;
    });

    return done(startedAt, ok, markerPublished, errors);
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
    fetcher: 'velocity-seed',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
