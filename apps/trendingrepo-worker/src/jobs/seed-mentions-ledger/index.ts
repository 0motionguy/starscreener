// One-shot seed job: backfill the cumulative mentions ledger from all
// historical event sources so the trending hub's Mentions column doesn't
// read 0 on day one.
//
// Architecture (per docs/HANDOVER-2026-05-21-MENTIONS-LEDGER.md):
//   - Storage = Redis SETs keyed by (repo, source). SADD dedupes, SCARD = count.
//   - This job projects three input sources into LedgerWorkItem[] and feeds
//     them through Phase A's applyLedger() — the same primitive the
//     mentions-ledger fetcher uses. Reusing applyLedger() guarantees the seed
//     leaves Redis in exactly the same shape the fetcher does (HINCRBY
//     lockstep with SCARD, ZADD leaderboard recompute, etc.).
//
// Input sources, in apply order:
//   1. The 5 current snapshot slugs (hackernews-repo-mentions,
//      reddit-mentions, bluesky-mentions, devto-mentions, lobsters-mentions).
//      IDs come out in the SAME shape the live fetcher produces, so SADD
//      perfectly dedupes against future fetcher runs.
//   2. data/repo-mentions-detail.jsonl — the 27k-line append-only event log.
//      Only `source` + `fullName` + `url` are reliably present; we use the
//      mention URL as the stable SADD member (URLs are 1:1 with mentions
//      across all 5 sources). This is the warmth seed for repos that haven't
//      had a live snapshot in days.
//   3. data/repo-mentions-detail-rollup.json — the 7d top-N rollup file.
//      Same URL-as-ID strategy. Catches URLs the JSONL missed.
//
// Sources outside SEED_SOURCES (tavily today; twitter intentionally too —
// see below) are skipped. SEED_SOURCES is the original 5 named sources that
// shared a stable URL-as-id contract across the JSONL/rollup history files.
// Twitter joined the live ledger in 2026-05-30 with tweet NUMERIC IDs as the
// SADD member; backfilling from this job would inject URL-shaped IDs that
// don't dedupe against the live fetcher's tweet-id-shaped IDs, causing
// over-count. The live fetcher's own runs will accumulate twitter going
// forward without help from the seed.
//
// Idempotent — re-running adds nothing new because SADD dedupes member
// strings regardless of which input source produced them.
//
// Invocation (operator runs on toolbox after worker build):
//   ssh toolbox 'cd ~/trendingrepo-worker && npm run job:seed-mentions-ledger'
// Or locally for verification:
//   npm run job:seed-mentions-ledger

import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initSentry, flushSentry, captureException } from '../../lib/sentry.js';
import { getLogger } from '../../lib/log.js';
import { readDataStore } from '../../lib/redis.js';
import {
  applyLedger,
  buildRedisOps,
  extractIds,
  projectSnapshots,
  type LedgerSource,
  type LedgerWorkItem,
  type RedisOps,
  type UpstreamSnapshots,
} from '../../fetchers/mentions-ledger/index.js';

// --------------------------------------------------------------------------
// Snapshot slugs — match the Phase A fetcher exactly. Re-declared here (and
// not imported) because mentions-ledger keeps SLUG_BY_SOURCE module-private.
// Both files share one canonical truth: the upstream collectors' writeDataStore
// keys (e.g. hackernews/index.ts writes `hackernews-repo-mentions`).
// --------------------------------------------------------------------------

// Twitter is intentionally excluded from the seed; see file header.
const SNAPSHOT_SLUGS: Record<Exclude<LedgerSource, 'twitter'>, string> = {
  hackernews: 'hackernews-repo-mentions',
  reddit: 'reddit-mentions',
  bluesky: 'bluesky-mentions',
  devto: 'devto-mentions',
  lobsters: 'lobsters-mentions',
};

// Workspace-root data files. Resolved relative to the worker package because
// the job ships inside the worker but reads files at the monorepo root.
// Layout: <repo-root>/apps/trendingrepo-worker → <repo-root>/data.
const REPO_ROOT_DATA_DIR = path.resolve(
  process.cwd().endsWith('trendingrepo-worker')
    ? path.join(process.cwd(), '..', '..')
    : process.cwd(),
  'data',
);
const JSONL_FILENAME = 'repo-mentions-detail.jsonl';
const ROLLUP_FILENAME = 'repo-mentions-detail-rollup.json';

// --------------------------------------------------------------------------
// Pass 1 — snapshot projection. Pulls each live slug from Redis and runs
// the Phase A projector. IDs match the live fetcher's ID universe, so SADD
// dedupes perfectly against future fetcher runs.
// --------------------------------------------------------------------------

interface SnapshotShape {
  mentions?: Record<string, unknown>;
}

async function readSnapshot(slug: string): Promise<SnapshotShape | null> {
  try {
    return await readDataStore<SnapshotShape>(slug);
  } catch {
    return null;
  }
}

async function projectFromSnapshots(): Promise<LedgerWorkItem[]> {
  const [hn, reddit, bluesky, devto, lobsters] = await Promise.all([
    readSnapshot(SNAPSHOT_SLUGS.hackernews),
    readSnapshot(SNAPSHOT_SLUGS.reddit),
    readSnapshot(SNAPSHOT_SLUGS.bluesky),
    readSnapshot(SNAPSHOT_SLUGS.devto),
    readSnapshot(SNAPSHOT_SLUGS.lobsters),
  ]);
  // Cast through `unknown` because readSnapshot returns the generic shape;
  // projectSnapshots inspects the same `.mentions` field on each.
  return projectSnapshots({
    hackernews: hn,
    reddit,
    bluesky,
    devto,
    lobsters,
  } as unknown as UpstreamSnapshots);
}

// --------------------------------------------------------------------------
// Pass 2 — JSONL projection. Streams the 27k-line event log without loading
// the whole file into memory. URL-as-stable-ID — both the JSONL and live
// fetchers produce URL-mappable mentions, so dedupe holds.
// --------------------------------------------------------------------------

// Seed-time source set. Deliberately a subset of LEDGER_SOURCES — twitter is
// EXCLUDED here (URL-shaped seed IDs would not dedupe against tweet-id-shaped
// live IDs; see file header).
const SEED_SOURCES = ['hackernews', 'reddit', 'bluesky', 'devto', 'lobsters'] as const satisfies readonly LedgerSource[];
const KNOWN_SOURCES = new Set<LedgerSource>(SEED_SOURCES);

function isLedgerSource(value: unknown): value is LedgerSource {
  return typeof value === 'string' && KNOWN_SOURCES.has(value as LedgerSource);
}

interface JsonlEvent {
  source?: unknown;
  fullName?: unknown;
  url?: unknown;
}

// Returns a Map<repo, Map<source, Set<id>>> so dedupe is per-(repo, source)
// without holding 27k items in a flat array. Memory: ~50 bytes/url × 27k =
// ~1.5 MB, well within budget.
export type IdAccumulator = Map<string, Map<LedgerSource, Set<string>>>;

export function recordEvent(
  acc: IdAccumulator,
  repo: string,
  source: LedgerSource,
  id: string,
): void {
  let perSource = acc.get(repo);
  if (!perSource) {
    perSource = new Map();
    acc.set(repo, perSource);
  }
  let ids = perSource.get(source);
  if (!ids) {
    ids = new Set();
    perSource.set(source, ids);
  }
  ids.add(id);
}

export function accumulatorToItems(acc: IdAccumulator): LedgerWorkItem[] {
  const items: LedgerWorkItem[] = [];
  for (const [repo, perSource] of acc) {
    for (const [source, ids] of perSource) {
      if (ids.size === 0) continue;
      items.push({ repo, source, ids: Array.from(ids) });
    }
  }
  return items;
}

/**
 * Parse a single JSONL line into a (repo, source, id) tuple. Defensive:
 * skips malformed JSON, unknown sources, missing repo/url. Exposed for
 * unit-test direct invocation.
 */
export function parseJsonlLine(
  line: string,
): { repo: string; source: LedgerSource; id: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: JsonlEvent;
  try {
    parsed = JSON.parse(trimmed) as JsonlEvent;
  } catch {
    return null;
  }
  const { source, fullName, url } = parsed;
  if (!isLedgerSource(source)) return null;
  if (typeof fullName !== 'string' || fullName.indexOf('/') < 0) return null;
  if (typeof url !== 'string' || url.length === 0) return null;
  return { repo: fullName, source, id: url };
}

async function projectFromJsonl(filePath: string): Promise<{
  items: LedgerWorkItem[];
  linesRead: number;
  linesSkipped: number;
}> {
  let linesRead = 0;
  let linesSkipped = 0;

  try {
    await fs.access(filePath);
  } catch {
    return { items: [], linesRead: 0, linesSkipped: 0 };
  }

  const acc: IdAccumulator = new Map();
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    linesRead += 1;
    const parsed = parseJsonlLine(line);
    if (!parsed) {
      linesSkipped += 1;
      continue;
    }
    recordEvent(acc, parsed.repo, parsed.source, parsed.id);
  }

  return { items: accumulatorToItems(acc), linesRead, linesSkipped };
}

// --------------------------------------------------------------------------
// Pass 3 — rollup projection. The 7d top-N rollup is a compact JSON with
// the same per-source URL data the JSONL has; we walk it to catch any
// recent URLs that haven't landed in the JSONL yet.
// --------------------------------------------------------------------------

interface RollupTopEntry {
  url?: unknown;
}
interface RollupPerSource {
  top?: RollupTopEntry[];
}
interface RollupRepo {
  perSource?: Record<string, RollupPerSource>;
}
interface RollupFile {
  repos?: Record<string, RollupRepo>;
}

export function projectFromRollupData(data: RollupFile | null): LedgerWorkItem[] {
  if (!data || typeof data !== 'object') return [];
  const repos = data.repos;
  if (!repos || typeof repos !== 'object') return [];
  const acc: IdAccumulator = new Map();
  for (const [repo, repoData] of Object.entries(repos)) {
    if (!repo || repo.indexOf('/') < 0) continue;
    const perSource = repoData?.perSource;
    if (!perSource || typeof perSource !== 'object') continue;
    for (const [sourceKey, sourceData] of Object.entries(perSource)) {
      if (!isLedgerSource(sourceKey)) continue;
      const entries = sourceData?.top;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const url = entry?.url;
        if (typeof url !== 'string' || url.length === 0) continue;
        recordEvent(acc, repo, sourceKey, url);
      }
    }
  }
  return accumulatorToItems(acc);
}

async function projectFromRollup(filePath: string): Promise<LedgerWorkItem[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as RollupFile;
    return projectFromRollupData(parsed);
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// Helper: keep one work item per (repo, source) by union'ing IDs across
// passes. Phase A's applyLedger() already handles duplicate IDs within a
// single SADD call — but pre-merging cuts the number of Redis round-trips.
// --------------------------------------------------------------------------

export function mergeWorkItems(...passes: LedgerWorkItem[][]): LedgerWorkItem[] {
  const acc: IdAccumulator = new Map();
  for (const pass of passes) {
    for (const item of pass) {
      for (const id of item.ids) {
        recordEvent(acc, item.repo, item.source, id);
      }
    }
  }
  return accumulatorToItems(acc);
}

// --------------------------------------------------------------------------
// Entrypoint
// --------------------------------------------------------------------------

interface SeedSummary {
  snapshotItems: number;
  jsonlLinesRead: number;
  jsonlLinesSkipped: number;
  jsonlItems: number;
  rollupItems: number;
  mergedItems: number;
  totalIds: number;
  reposTouched: number;
  newMentions: number;
  leaderboardSize: number;
}

export async function runSeedMentionsLedger(opts: {
  ops: RedisOps | null;
  dataDir: string;
  logger?: { info: (obj: unknown, msg?: string) => void; warn: (msg: string) => void };
}): Promise<SeedSummary> {
  const { ops, dataDir, logger } = opts;

  const snapshotItems = await projectFromSnapshots();
  logger?.info({ items: snapshotItems.length }, 'seed: snapshot pass projected');

  const jsonlPath = path.join(dataDir, JSONL_FILENAME);
  const jsonlResult = await projectFromJsonl(jsonlPath);
  logger?.info(
    {
      items: jsonlResult.items.length,
      linesRead: jsonlResult.linesRead,
      linesSkipped: jsonlResult.linesSkipped,
    },
    'seed: jsonl pass projected',
  );

  const rollupPath = path.join(dataDir, ROLLUP_FILENAME);
  const rollupItems = await projectFromRollup(rollupPath);
  logger?.info({ items: rollupItems.length }, 'seed: rollup pass projected');

  const merged = mergeWorkItems(snapshotItems, jsonlResult.items, rollupItems);
  const totalIds = merged.reduce((sum, item) => sum + item.ids.length, 0);
  logger?.info({ workItems: merged.length, totalIds }, 'seed: merged input projected');

  let reposTouched = 0;
  let newMentions = 0;
  let leaderboardSize = 0;
  if (!ops) {
    logger?.warn('seed: Redis disabled or unconfigured - skipping apply pass');
  } else if (merged.length === 0) {
    logger?.warn('seed: no work items - nothing to apply');
  } else {
    const result = await applyLedger(ops, merged);
    reposTouched = result.reposTouched;
    newMentions = result.newMentions;
    leaderboardSize = result.leaderboardSize;
    logger?.info(
      { reposTouched, newMentions, leaderboardSize },
      'seed: applyLedger completed',
    );
  }

  return {
    snapshotItems: snapshotItems.length,
    jsonlLinesRead: jsonlResult.linesRead,
    jsonlLinesSkipped: jsonlResult.linesSkipped,
    jsonlItems: jsonlResult.items.length,
    rollupItems: rollupItems.length,
    mergedItems: merged.length,
    totalIds,
    reposTouched,
    newMentions,
    leaderboardSize,
  };
}

async function main(): Promise<number> {
  initSentry();
  const log = getLogger();

  // --help / -h short-circuit so the operator can confirm registration
  // without touching Redis. Mirrors the worker root's usage banner style.
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    // eslint-disable-next-line no-console
    console.log(
      [
        'Usage: node dist/jobs/seed-mentions-ledger/index.js',
        '       npm run job:seed-mentions-ledger',
        '',
        'Backfills ss:mentions:v1:* from snapshot slugs + data/repo-mentions-detail.jsonl',
        '+ data/repo-mentions-detail-rollup.json. Idempotent — SADD dedupes.',
      ].join('\n'),
    );
    return 0;
  }

  try {
    const ops = await buildRedisOps();
    const summary = await runSeedMentionsLedger({
      ops,
      dataDir: REPO_ROOT_DATA_DIR,
      logger: log,
    });
    log.info(summary, 'seed-mentions-ledger done');
    if (ops?.quit) {
      await ops.quit();
    }
    await flushSentry();
    return 0;
  } catch (err) {
    captureException(err);
    log.error({ err: (err as Error).message }, 'seed-mentions-ledger failed');
    await flushSentry();
    return 1;
  }
}

// Skip the auto-run when imported by the test harness; only the
// CLI invocation (node dist/jobs/seed-mentions-ledger/index.js OR
// tsx src/jobs/seed-mentions-ledger/index.ts) should execute main().
// Mirrors the convention used by recompute-scores.ts / publish-leaderboards.ts
// — those auto-run because they're never imported anywhere else. This file
// IS imported by its sibling test, so guard the auto-run.
//
// Windows-safety: fileURLToPath normalizes both directions (forward slashes
// in import.meta.url, backslashes in process.argv[1]) into a comparable
// absolute path. A bare string compare against `file://${argv[1]}` fails
// under tsx on Windows.
function isDirectInvocation(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const here = path.resolve(fileURLToPath(import.meta.url));
    const there = path.resolve(argv1);
    return here === there;
  } catch {
    return false;
  }
}
if (isDirectInvocation()) {
  main().then((c) => process.exit(c));
}
