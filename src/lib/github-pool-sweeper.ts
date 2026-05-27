// StarScreener — GitHub-token-pool Redis hygiene sweeper.
//
// PROBLEM
//   `pool:github:tokens:*` keys are published by both the Next.js pool
//   (src/lib/github-token-pool.ts) and the worker pool
//   (apps/trendingrepo-worker/src/lib/util/github-token-pool.ts). They share
//   a 30-day TTL, which is correct for keeping last-known state warm across
//   cold starts, but it means dead state lingers for a month:
//   - Quarantined-then-rotated tokens stay marked as quarantined
//   - Reset-window-expired entries still show `remaining: 0`
//   - Workers/lambdas that have long since died still own published rows
//
//   Symptom observed 2026-05-27: 22 rows in Redis for ~12 unique tokens,
//   ~11 marked quarantined with `resetUnixSec` 2000+ minutes in the past.
//   Confusing operationally and would mask a real exhaustion event.
//
// SOLUTION
//   `planSweep()` is a pure function: given the scanned entries and the
//   current time, it produces an "expire this, keep that" plan. Criteria
//   for deletion:
//     1. Quarantine ended more than `QUARANTINE_DECAY_GRACE_MS` ago
//        (default 48h) — well past the 24h auto-clear, the operator is
//        either fine or has rotated the PAT already.
//     2. Last observed reset epoch is in the past by more than
//        `RESET_DECAY_GRACE_MS` (default 24h) AND the row claims
//        `remaining: 0`. The 24h grace lets the existing pool reconcile on
//        the next live call before we throw the row away.
//     3. Payload is malformed JSON or missing required fields — drop.
//
//   `runSweep()` is the impure shell: lazy-imports ioredis (same pattern as
//   `src/lib/redis.ts`), KEYS the namespace, runs the plan, DEL the casualties.
//   Returns a structured summary for the cron endpoint to surface.
//
// DESIGN NOTES
//   - We never touch app-side `src/lib/github-token-pool.ts` — that file is
//     load-bearing and the active session may be editing it. Sweeper is
//     additive only.
//   - We use KEYS (not SCAN) because the namespace cardinality is bounded by
//     the PAT count (≤100 in any sane deployment). SCAN would be safer at
//     millions of keys but adds complexity with no benefit here.
//   - Test injection: `runSweep` accepts an optional `redisClient` so unit
//     tests can drive the I/O without spinning up ioredis.

export const GH_POOL_KEY_PREFIX = "pool:github:tokens:";

// 48h after quarantine elapses, the row is information-free — drop.
export const QUARANTINE_DECAY_GRACE_MS = 48 * 60 * 60 * 1000;

// 24h after the rate-limit reset window elapsed, a row reporting
// `remaining: 0` hasn't been refreshed → the underlying token is either
// dead (operator rotated it) or unused (no fetcher picked it). Drop.
export const RESET_DECAY_GRACE_MS = 24 * 60 * 60 * 1000;

export interface PublishedTokenState {
  tokenLabel: string;
  remaining: number | null;
  resetUnixSec: number | null;
  lastObservedMs: number | null;
  quarantinedUntilMs: number | null;
  lambdaId?: string;
  writtenAt?: string;
}

export interface PoolEntry {
  key: string;
  rawPayload: string | null;
}

export type ExpiryReason =
  | "malformed"
  | "quarantine-expired"
  | "reset-stale-and-exhausted";

export interface SweepPlan {
  scanned: number;
  /** Keys to DEL. */
  toExpire: Array<{ key: string; reason: ExpiryReason }>;
  /** Keys to keep (with parsed state for callers that want observability). */
  toKeep: Array<{ key: string; state: PublishedTokenState }>;
}

/**
 * Parse a published-token-state JSON payload defensively. Returns null when
 * the row is missing required fields so the caller can mark it malformed.
 */
export function parseTokenState(raw: string | null): PublishedTokenState | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.tokenLabel !== "string" || r.tokenLabel.length === 0) {
    return null;
  }
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  return {
    tokenLabel: r.tokenLabel,
    remaining: num(r.remaining),
    resetUnixSec: num(r.resetUnixSec),
    lastObservedMs: num(r.lastObservedMs),
    quarantinedUntilMs: num(r.quarantinedUntilMs),
    lambdaId: str(r.lambdaId),
    writtenAt: str(r.writtenAt),
  };
}

interface SweepOptions {
  quarantineGraceMs?: number;
  resetGraceMs?: number;
}

/**
 * Pure planner. Given the raw scanned entries and the current time, decide
 * which keys to expire. Caller is responsible for the actual DEL.
 *
 * No I/O. No globals. Deterministic for unit tests.
 */
export function planSweep(
  entries: PoolEntry[],
  now: number = Date.now(),
  options: SweepOptions = {},
): SweepPlan {
  const quarantineGrace = options.quarantineGraceMs ?? QUARANTINE_DECAY_GRACE_MS;
  const resetGrace = options.resetGraceMs ?? RESET_DECAY_GRACE_MS;
  const plan: SweepPlan = {
    scanned: entries.length,
    toExpire: [],
    toKeep: [],
  };
  for (const entry of entries) {
    const state = parseTokenState(entry.rawPayload);
    if (state === null) {
      plan.toExpire.push({ key: entry.key, reason: "malformed" });
      continue;
    }
    // Criterion 1: quarantine ended long enough ago that the row is stale.
    if (
      state.quarantinedUntilMs !== null &&
      state.quarantinedUntilMs > 0 &&
      state.quarantinedUntilMs < now - quarantineGrace
    ) {
      plan.toExpire.push({ key: entry.key, reason: "quarantine-expired" });
      continue;
    }
    // Criterion 2: row claims exhausted (remaining 0) AND the reset window
    // elapsed long ago. Either the token is dead or unused; live PATs would
    // republish a non-zero remaining on the next call.
    const resetMs =
      state.resetUnixSec !== null ? state.resetUnixSec * 1000 : null;
    if (
      state.remaining === 0 &&
      resetMs !== null &&
      resetMs < now - resetGrace
    ) {
      plan.toExpire.push({
        key: entry.key,
        reason: "reset-stale-and-exhausted",
      });
      continue;
    }
    plan.toKeep.push({ key: entry.key, state });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Impure shell — wire `planSweep` to a live Redis. Lazy-imports ioredis so
// this module stays safe to import from edge / client contexts (which never
// call runSweep but might transitively import the planner).
// ---------------------------------------------------------------------------

export interface SweeperRedisClient {
  keys(pattern: string): Promise<string[]>;
  /** Pipelined GET. Implementations can use MGET; we fall back to N-gets if
   * the client supports neither. */
  mget?(keys: string[]): Promise<Array<string | null>>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

export interface RunSweepResult {
  plan: SweepPlan;
  deleted: number;
  errors: string[];
}

interface RunSweepOptions extends SweepOptions {
  /** Inject a Redis client (for tests). Production path picks ioredis from
   * REDIS_URL. */
  redisClient?: SweeperRedisClient;
  /** Inject a clock (tests). */
  now?: () => number;
  /** Inject the env (tests). */
  env?: Record<string, string | undefined>;
  /** When true, plan without DELing. Useful for /admin dry-run. */
  dryRun?: boolean;
}

export async function runSweep(opts: RunSweepOptions = {}): Promise<RunSweepResult> {
  const errors: string[] = [];
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  let client: SweeperRedisClient | null = opts.redisClient ?? null;
  if (!client) {
    client = await createIoRedisSweeperClient(env, errors);
  }
  if (!client) {
    return {
      plan: { scanned: 0, toExpire: [], toKeep: [] },
      deleted: 0,
      errors: errors.length > 0 ? errors : ["redis client unavailable"],
    };
  }
  // Scan + bulk-read in one pass.
  let keys: string[];
  try {
    keys = await client.keys(`${GH_POOL_KEY_PREFIX}*`);
  } catch (err) {
    errors.push(`keys failed: ${stringifyErr(err)}`);
    return { plan: { scanned: 0, toExpire: [], toKeep: [] }, deleted: 0, errors };
  }
  const payloads = await readMany(client, keys, errors);
  const entries: PoolEntry[] = keys.map((key, idx) => ({
    key,
    rawPayload: payloads[idx] ?? null,
  }));
  const plan = planSweep(entries, now(), opts);

  let deleted = 0;
  if (!opts.dryRun && plan.toExpire.length > 0) {
    const expireKeys = plan.toExpire.map((e) => e.key);
    try {
      deleted = await client.del(...expireKeys);
    } catch (err) {
      errors.push(`del failed: ${stringifyErr(err)}`);
    }
  }
  return { plan, deleted, errors };
}

async function readMany(
  client: SweeperRedisClient,
  keys: string[],
  errors: string[],
): Promise<Array<string | null>> {
  if (keys.length === 0) return [];
  if (typeof client.mget === "function") {
    try {
      return await client.mget(keys);
    } catch (err) {
      errors.push(`mget failed: ${stringifyErr(err)} — falling back to N-gets`);
    }
  }
  const out: Array<string | null> = [];
  for (const key of keys) {
    try {
      out.push(await client.get(key));
    } catch (err) {
      errors.push(`get ${key} failed: ${stringifyErr(err)}`);
      out.push(null);
    }
  }
  return out;
}

async function createIoRedisSweeperClient(
  env: Record<string, string | undefined>,
  errors: string[],
): Promise<SweeperRedisClient | null> {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    errors.push(
      "REDIS_URL not set — sweeper is no-op (Upstash REST clients have no KEYS in this codepath)",
    );
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("ioredis") as {
      default?: new (url: string, opts: Record<string, unknown>) => unknown;
    };
    const Ctor = (mod.default ?? mod) as unknown as new (
      url: string,
      opts: Record<string, unknown>,
    ) => SweeperRedisClient;
    return new Ctor(url, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
      commandTimeout: 15_000,
    });
  } catch (err) {
    errors.push(`ioredis init failed: ${stringifyErr(err)}`);
    return null;
  }
}

function stringifyErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
