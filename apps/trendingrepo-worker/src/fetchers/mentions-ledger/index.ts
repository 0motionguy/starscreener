// Mentions-ledger fetcher — cumulative all-time mention counter per (repo, source).
//
// Motivation: the active upstream collectors (hackernews, bluesky, devto,
// lobsters) overwrite a 7-day-windowed snapshot every run. The trending hub's
// Mentions cell needs a cumulative count that grows forever; this fetcher
// projects the snapshot into a Redis-SET ledger keyed by stable mention IDs,
// so re-runs are naturally idempotent (SADD dedupes).
//
// Storage model (operator-confirmed 2026-05-21):
//   SADD   ss:mentions:v1:<owner>/<name>:<source>  <mention-id>...
//   HINCRBY ss:mentions:v1:<owner>/<name>:_index   <source>  <new-members>
//   ZADD   ss:mentions:leaderboard:v1              <total>   <owner>/<name>
//
// SADD returns the count of new members; we only HINCRBY when that count > 0
// so the index hash stays in lockstep with SCARD without a separate read.
// Leaderboard ZADD is best-effort — recomputes top-200 repos by total each run.
//
// Cadence: cron `7,22,37,52 * * * *` — 4x/hour, offset from the upstream
// collector windows (hackernews :10, bluesky :17, devto :30 (6h), lobsters :37)
// so we sweep after most of them have published.
//
// Out of scope here: seed of historical snapshots (Phase D worker job
// `seed-mentions-ledger`). This fetcher only ingests what the upstream
// collectors are currently publishing; the seed job pulls deeper history.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { loadEnv } from '../../lib/env.js';

// --------------------------------------------------------------------------
// Upstream snapshot shapes — minimal slices we depend on. We re-declare here
// (not import) because the per-source bucket types are buried inside each
// fetcher and not exported; the fields we read are stable contract anchors.
// --------------------------------------------------------------------------

interface HnSnapshot {
  mentions?: Record<string, { stories?: Array<{ id?: number | string }> }>;
}

interface RedditSnapshot {
  mentions?: Record<string, { posts?: Array<{ id?: string }> }>;
}

interface BlueskySnapshot {
  mentions?: Record<string, { posts?: Array<{ uri?: string }> }>;
}

interface DevtoSnapshot {
  mentions?: Record<string, { articles?: Array<{ id?: number | string }> }>;
}

interface LobstersSnapshot {
  mentions?: Record<string, { stories?: Array<{ shortId?: string }> }>;
}

// Twitter slug is FLAT (one posts[] array across all repos) — `groupTwitterByRepo`
// adapts it into the nested {mentions: {repo: {posts: [{id}]}}} shape the
// projector iterates. We only depend on `id` + `repoFullName` here.
interface TwitterFlatSnapshot {
  posts?: Array<{ id?: string; repoFullName?: string }>;
}

interface TwitterAdaptedSnapshot {
  mentions?: Record<string, { posts?: Array<{ id?: string }> }>;
}

// --------------------------------------------------------------------------
// Source registry. Reddit remains a known bucket shape for historical data and
// tests, but it is not an active projection source while the Reddit topic is
// paused end-to-end on HOSTUP.
// --------------------------------------------------------------------------

export const LEDGER_SOURCES = [
  'hackernews',
  'reddit',
  'bluesky',
  'devto',
  'lobsters',
  'twitter',
] as const;
export type LedgerSource = (typeof LEDGER_SOURCES)[number];

const ACTIVE_LEDGER_SOURCES: readonly LedgerSource[] = [
  'hackernews',
  'bluesky',
  'devto',
  'lobsters',
  'twitter',
];
const ACTIVE_LEDGER_SOURCE_SET = new Set<LedgerSource>(ACTIVE_LEDGER_SOURCES);

const SLUG_BY_SOURCE: Record<LedgerSource, string> = {
  hackernews: 'hackernews-repo-mentions',
  reddit: 'reddit-mentions',
  bluesky: 'bluesky-mentions',
  devto: 'devto-mentions',
  lobsters: 'lobsters-mentions',
  twitter: 'twitter-repo-signals',
};

const KEY_PREFIX = 'ss:mentions:v1';
const LEADERBOARD_KEY = 'ss:mentions:leaderboard:v1';
const LEADERBOARD_TOP_N = 200;

// --------------------------------------------------------------------------
// ID extractors — one per source. Stable IDs already exist in every payload.
// Returns an array of strings (Redis SADD members are strings).
// --------------------------------------------------------------------------

export function extractIds(
  source: LedgerSource,
  bucket: unknown,
): string[] {
  if (!bucket || typeof bucket !== 'object') return [];
  const out: string[] = [];
  switch (source) {
    case 'hackernews': {
      const stories = (bucket as { stories?: Array<{ id?: unknown }> }).stories ?? [];
      for (const s of stories) {
        const id = s?.id;
        if (id === undefined || id === null || id === '') continue;
        out.push(String(id));
      }
      break;
    }
    case 'reddit': {
      const posts = (bucket as { posts?: Array<{ id?: unknown }> }).posts ?? [];
      for (const p of posts) {
        const id = p?.id;
        if (id === undefined || id === null || id === '') continue;
        out.push(String(id));
      }
      break;
    }
    case 'bluesky': {
      const posts = (bucket as { posts?: Array<{ uri?: unknown }> }).posts ?? [];
      for (const p of posts) {
        const uri = p?.uri;
        if (uri === undefined || uri === null || uri === '') continue;
        out.push(String(uri));
      }
      break;
    }
    case 'devto': {
      const articles = (bucket as { articles?: Array<{ id?: unknown }> }).articles ?? [];
      for (const a of articles) {
        const id = a?.id;
        if (id === undefined || id === null || id === '') continue;
        out.push(String(id));
      }
      break;
    }
    case 'lobsters': {
      const stories = (bucket as { stories?: Array<{ shortId?: unknown }> }).stories ?? [];
      for (const s of stories) {
        const id = s?.shortId;
        if (id === undefined || id === null || id === '') continue;
        out.push(String(id));
      }
      break;
    }
    case 'twitter': {
      // After groupTwitterByRepo the bucket holds {posts: [{id}]}. Tweet IDs
      // are globally unique numeric strings — same shape contract as Reddit.
      const posts = (bucket as { posts?: Array<{ id?: unknown }> }).posts ?? [];
      for (const p of posts) {
        const id = p?.id;
        if (id === undefined || id === null || id === '') continue;
        out.push(String(id));
      }
      break;
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Twitter slug shape adapter.
//
// The other 5 mention sources publish `{mentions: Record<fullName, bucket>}`.
// Twitter's `twitter-repo-signals` is flat: `{posts: Array<{id, repoFullName}>}`
// (one array across all tracked repos). This helper groups the flat list by
// repoFullName so the existing `projectSnapshots` projector can iterate it
// unchanged. Pure / I/O-free — exported for unit testing.
// --------------------------------------------------------------------------

export function groupTwitterByRepo(
  snap: TwitterFlatSnapshot | null | undefined,
): TwitterAdaptedSnapshot {
  const out: Record<string, { posts: Array<{ id: string }> }> = {};
  if (!snap || !Array.isArray(snap.posts)) return { mentions: out };
  for (const post of snap.posts) {
    if (!post || typeof post !== 'object') continue;
    const repo = post.repoFullName;
    const id = post.id;
    if (!repo || typeof repo !== 'string' || repo.indexOf('/') < 0) continue;
    if (!id || typeof id !== 'string') continue;
    let bucket = out[repo];
    if (!bucket) {
      bucket = { posts: [] };
      out[repo] = bucket;
    }
    bucket.posts.push({ id });
  }
  return { mentions: out };
}

// --------------------------------------------------------------------------
// RedisOps — the narrow set of raw-Redis commands the ledger needs. Lets the
// unit test inject a stub without touching the shared RedisHandle abstraction
// (which only exposes get/set/del/quit because it's a JSON-blob KV adapter).
//
// Production wires this to either ioredis (preferred when REDIS_URL is set)
// or @upstash/redis (REST fallback). Both expose sadd / hincrby / zadd /
// hgetall natively; we adapt only the calling shape.
// --------------------------------------------------------------------------

export interface RedisOps {
  /** SADD key member... — returns count of newly added members. */
  sadd(key: string, members: string[]): Promise<number>;
  /** HINCRBY key field delta — returns new field value. */
  hincrby(key: string, field: string, delta: number): Promise<number>;
  /** HGETALL key — returns the index hash for total recompute. */
  hgetall(key: string): Promise<Record<string, string>>;
  /** ZADD key score member — best-effort, no return needed. */
  zadd(key: string, score: number, member: string): Promise<void>;
  /** Cleanup hook — no-op on Upstash, quit() on ioredis. */
  quit?(): Promise<void>;
}

// --------------------------------------------------------------------------
// Build a RedisOps from the worker's env-driven Redis selection. Mirrors the
// branching in lib/redis.ts:getRedis() but exposes the raw set/hash/zset
// commands the ledger fetcher needs.
// --------------------------------------------------------------------------

export async function buildRedisOps(): Promise<RedisOps | null> {
  const env = loadEnv();
  if (env.DATA_STORE_DISABLE === '1' || env.DATA_STORE_DISABLE === 'true') {
    return null;
  }

  if (env.REDIS_URL) {
    const { Redis: IORedisCtor } = await import('ioredis');
    const client = new IORedisCtor(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    return {
      async sadd(key, members) {
        if (members.length === 0) return 0;
        return Number(await client.sadd(key, ...members));
      },
      async hincrby(key, field, delta) {
        return Number(await client.hincrby(key, field, delta));
      },
      async hgetall(key) {
        return (await client.hgetall(key)) as Record<string, string>;
      },
      async zadd(key, score, member) {
        await client.zadd(key, score, member);
      },
      async quit() {
        try {
          await client.quit();
        } catch {
          /* ignore */
        }
      },
    };
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    const client = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    return {
      async sadd(key, members) {
        if (members.length === 0) return 0;
        // Upstash typings: sadd(key, ...members) returns number
        const result = await (
          client as unknown as {
            sadd(key: string, ...members: string[]): Promise<number>;
          }
        ).sadd(key, ...members);
        return Number(result ?? 0);
      },
      async hincrby(key, field, delta) {
        const result = await (
          client as unknown as {
            hincrby(key: string, field: string, delta: number): Promise<number>;
          }
        ).hincrby(key, field, delta);
        return Number(result ?? 0);
      },
      async hgetall(key) {
        const result = await (
          client as unknown as {
            hgetall(key: string): Promise<Record<string, string> | null>;
          }
        ).hgetall(key);
        return result ?? {};
      },
      async zadd(key, score, member) {
        await (
          client as unknown as {
            zadd(
              key: string,
              entry: { score: number; member: string },
            ): Promise<unknown>;
          }
        ).zadd(key, { score, member });
      },
    };
  }

  return null;
}

// --------------------------------------------------------------------------
// Pure projection — given the 5 snapshots, produce a flat list of
// (repo, source, ids[]) work items. Exposed for unit-test direct invocation.
// --------------------------------------------------------------------------

export interface LedgerWorkItem {
  repo: string;
  source: LedgerSource;
  ids: string[];
}

export interface UpstreamSnapshots {
  hackernews?: HnSnapshot | null;
  reddit?: RedditSnapshot | null;
  bluesky?: BlueskySnapshot | null;
  devto?: DevtoSnapshot | null;
  lobsters?: LobstersSnapshot | null;
  // Twitter comes through post-adapter (groupTwitterByRepo) so the projector
  // can iterate it like the others. The raw `twitter-repo-signals` slug is
  // flat — the adapter runs in `run()` before projection.
  twitter?: TwitterAdaptedSnapshot | null;
}

export function projectSnapshots(snapshots: UpstreamSnapshots): LedgerWorkItem[] {
  const items: LedgerWorkItem[] = [];
  for (const source of ACTIVE_LEDGER_SOURCES) {
    const snap = snapshots[source];
    if (!snap || typeof snap !== 'object') continue;
    const mentions = (snap as { mentions?: Record<string, unknown> }).mentions;
    if (!mentions || typeof mentions !== 'object') continue;
    for (const [repo, bucket] of Object.entries(mentions)) {
      if (!repo || repo.indexOf('/') < 0) continue;
      const ids = extractIds(source, bucket);
      if (ids.length === 0) continue;
      items.push({ repo, source, ids });
    }
  }
  return items;
}

// --------------------------------------------------------------------------
// Apply the projected work items to Redis. Idempotent — SADD with the same
// member returns 0 the second time, and HINCRBY only fires when the SADD
// actually added something. Exposed for unit-test direct invocation.
//
// After the pass, recomputes totals for every repo touched (HGETALL on the
// index hash) and ZADDs the top-N to the leaderboard.
// --------------------------------------------------------------------------

// Flattened per-repo snapshot entry — matches the shape the app read-side
// (src/lib/mentions-ledger.ts MentionsLedgerEntry) expects.
export interface LedgerSnapshotEntry {
  fullName: string;
  perSource: Record<string, number>;
  total: number;
  sources: string[];
}

export interface ApplyResult {
  reposTouched: number;
  newMentions: number;
  leaderboardSize: number;
  /** Fresh {fullName, perSource, total} for every repo touched this run. */
  entries: LedgerSnapshotEntry[];
}

export async function applyLedger(
  ops: RedisOps,
  items: LedgerWorkItem[],
): Promise<ApplyResult> {
  const touchedRepos = new Set<string>();
  let newMentions = 0;

  for (const item of items) {
    if (!ACTIVE_LEDGER_SOURCE_SET.has(item.source)) continue;
    const setKey = `${KEY_PREFIX}:${item.repo}:${item.source}`;
    const indexKey = `${KEY_PREFIX}:${item.repo}:_index`;
    const added = await ops.sadd(setKey, item.ids);
    if (added > 0) {
      await ops.hincrby(indexKey, item.source, added);
      newMentions += added;
    }
    touchedRepos.add(item.repo);
  }

  // Recompute totals for repos touched this run and update the leaderboard.
  // Also capture the per-source breakdown so the fetcher can flatten it into
  // the `mentions-ledger` snapshot slug (the app read-side).
  const totals: Array<{ repo: string; total: number }> = [];
  const entries: LedgerSnapshotEntry[] = [];
  for (const repo of touchedRepos) {
    const indexKey = `${KEY_PREFIX}:${repo}:_index`;
    const hash = await ops.hgetall(indexKey);
    let total = 0;
    const perSource: Record<string, number> = {};
    for (const [field, value] of Object.entries(hash)) {
      if (!ACTIVE_LEDGER_SOURCE_SET.has(field as LedgerSource)) continue;
      const n = Number.parseInt(String(value), 10);
      if (Number.isFinite(n) && n > 0) {
        perSource[field] = n;
        total += n;
      }
    }
    if (total > 0) {
      totals.push({ repo, total });
      const sources = Object.keys(perSource).sort((a, b) => (perSource[b] ?? 0) - (perSource[a] ?? 0));
      entries.push({ fullName: repo, perSource, total, sources });
    }
  }

  // Top-N by total — leaderboard is a ZSET, sorted ascending by score, so
  // ZRANGE -200 -1 yields the top-N. We add every touched repo (even those
  // outside the current top-200) so the leaderboard naturally drifts as
  // counts accumulate; ZREMRANGEBYRANK would trim, but operator scope for
  // Phase A is "best-effort leaderboard update" — trimming can come later.
  totals.sort((a, b) => b.total - a.total);
  const top = totals.slice(0, LEADERBOARD_TOP_N);
  for (const { repo, total } of top) {
    await ops.zadd(LEADERBOARD_KEY, total, repo);
  }

  return {
    reposTouched: touchedRepos.size,
    newMentions,
    leaderboardSize: top.length,
    entries,
  };
}

// --------------------------------------------------------------------------
// Flatten — read-then-merge this run's touched entries over the existing
// `mentions-ledger` snapshot so the slug accumulates lifetime totals for every
// repo ever touched (untouched repos retain their last computed entry). This
// is the slug the app read-side (src/lib/mentions-ledger.ts) consumes.
// --------------------------------------------------------------------------

interface LedgerSnapshot {
  entries: LedgerSnapshotEntry[];
  writtenAt: string;
}

export function mergeLedgerSnapshot(
  existing: LedgerSnapshot | null,
  fresh: LedgerSnapshotEntry[],
  now: string,
): LedgerSnapshot {
  const byRepo = new Map<string, LedgerSnapshotEntry>();
  for (const e of existing?.entries ?? []) {
    const sanitized = sanitizeLedgerSnapshotEntry(e);
    if (sanitized) byRepo.set(sanitized.fullName.toLowerCase(), sanitized);
  }
  for (const e of fresh) {
    const sanitized = sanitizeLedgerSnapshotEntry(e);
    if (sanitized) byRepo.set(sanitized.fullName.toLowerCase(), sanitized);
  }
  return { entries: Array.from(byRepo.values()), writtenAt: now };
}

function sanitizeLedgerSnapshotEntry(
  entry: LedgerSnapshotEntry | null | undefined,
): LedgerSnapshotEntry | null {
  if (!entry || typeof entry.fullName !== 'string' || entry.fullName.length === 0) {
    return null;
  }
  const perSource: Record<string, number> = {};
  let total = 0;
  for (const [source, value] of Object.entries(entry.perSource ?? {})) {
    if (!ACTIVE_LEDGER_SOURCE_SET.has(source as LedgerSource)) continue;
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) continue;
    perSource[source] = count;
    total += count;
  }
  if (total <= 0) return null;
  const sources = Object.keys(perSource).sort((a, b) => (perSource[b] ?? 0) - (perSource[a] ?? 0));
  return {
    fullName: entry.fullName,
    perSource,
    total,
    sources,
  };
}

// --------------------------------------------------------------------------
// Fetcher entrypoint.
// --------------------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'mentions-ledger',
  // 4x/hour, offset from hackernews(:10) bluesky(:17) lobsters(:37). Dev.to
  // has its own cadence; we re-sweep often enough to catch
  // anything they publish without piling up cron-tick collisions.
  schedule: '7,22,37,52 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('mentions-ledger dry-run');
      return done(startedAt, 0, false, errors);
    }

    // Read active upstream snapshots in parallel. Each can be null if its
    // collector hasn't published yet; the projector tolerates nulls.
    const [hn, bluesky, devto, lobsters, twitterRaw] = await Promise.all([
      readDataStore<HnSnapshot>(SLUG_BY_SOURCE.hackernews).catch((err) => {
        errors.push({ stage: 'read:hackernews', message: (err as Error).message });
        return null;
      }),
      readDataStore<BlueskySnapshot>(SLUG_BY_SOURCE.bluesky).catch((err) => {
        errors.push({ stage: 'read:bluesky', message: (err as Error).message });
        return null;
      }),
      readDataStore<DevtoSnapshot>(SLUG_BY_SOURCE.devto).catch((err) => {
        errors.push({ stage: 'read:devto', message: (err as Error).message });
        return null;
      }),
      readDataStore<LobstersSnapshot>(SLUG_BY_SOURCE.lobsters).catch((err) => {
        errors.push({ stage: 'read:lobsters', message: (err as Error).message });
        return null;
      }),
      readDataStore<TwitterFlatSnapshot>(SLUG_BY_SOURCE.twitter).catch((err) => {
        errors.push({ stage: 'read:twitter', message: (err as Error).message });
        return null;
      }),
    ]);

    // Twitter publishes a flat posts[] — group by repoFullName to match the
    // nested shape the projector expects.
    const twitter = groupTwitterByRepo(twitterRaw);
    const items = projectSnapshots({
      hackernews: hn,
      bluesky,
      devto,
      lobsters,
      twitter,
    });
    const totalIds = items.reduce((sum, i) => sum + i.ids.length, 0);
    ctx.log.info(
      {
        workItems: items.length,
        totalIds,
        hn: hn ? Object.keys(hn.mentions ?? {}).length : 0,
        reddit: 'paused',
        bluesky: bluesky ? Object.keys(bluesky.mentions ?? {}).length : 0,
        devto: devto ? Object.keys(devto.mentions ?? {}).length : 0,
        lobsters: lobsters ? Object.keys(lobsters.mentions ?? {}).length : 0,
        twitter: twitter.mentions ? Object.keys(twitter.mentions).length : 0,
      },
      'mentions-ledger projected',
    );

    if (items.length === 0) {
      ctx.log.warn('mentions-ledger: no work items projected from upstream snapshots');
      return done(startedAt, 0, false, errors);
    }

    const ops = await buildRedisOps();
    if (!ops) {
      ctx.log.warn('mentions-ledger: Redis disabled or unconfigured - skipping write pass');
      return done(startedAt, totalIds, false, errors);
    }

    try {
      const result = await applyLedger(ops, items);

      // Flatten: read-then-merge this run's touched entries over the existing
      // `mentions-ledger` snapshot so the app read-side gets lifetime totals.
      const now = new Date().toISOString();
      const existing = await readDataStore<LedgerSnapshot>('mentions-ledger').catch(() => null);
      const snapshot = mergeLedgerSnapshot(existing, result.entries, now);
      const writeRes = await writeDataStore('mentions-ledger', snapshot);

      ctx.log.info(
        {
          reposTouched: result.reposTouched,
          newMentions: result.newMentions,
          leaderboardSize: result.leaderboardSize,
          snapshotEntries: snapshot.entries.length,
          snapshotRedis: writeRes.source,
        },
        'mentions-ledger applied',
      );
      return done(startedAt, totalIds, writeRes.source === 'redis', errors);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.error({ err: message }, 'mentions-ledger apply failed');
      errors.push({ stage: 'apply', message });
      return done(startedAt, totalIds, false, errors);
    } finally {
      if (ops.quit) {
        await ops.quit();
      }
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
    fetcher: 'mentions-ledger',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
