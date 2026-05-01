// StarScreener — fleet-wide GitHub token pool aggregation.
//
// PROBLEM
//   `getGitHubTokenPool()` is process-local. At N Vercel lambdas each one
//   has its own snapshot — `/admin/pool` shows whichever lambda you happened
//   to hit. At 10K users this is dangerously misleading: the local view can
//   say "healthy" while the FLEET-wide quota is dying.
//
// SOLUTION
//   Each lambda's pool fire-and-forgets a redacted state payload to Redis on
//   every `recordRateLimit` / `quarantine` call (see github-token-pool.ts —
//   `publishTokenStateToRedis`). This module reads those keys back and
//   reduces them into one fleet-wide snapshot for `/admin/pool-aggregate`.
//
// WHY KNOWN-LIST INSTEAD OF SCAN
//   The shared `RedisClientLike` interface only exposes `get/set/del` — no
//   SCAN. We don't need it: every lambda boots with the SAME env (same
//   GITHUB_TOKEN + GH_TOKEN_POOL), so the set of token labels is identical
//   across the fleet. Reading the local pool's snapshot gives us the
//   complete label list; we then `get` each `pool:github:tokens:<label>`.
//   Bonus: this is safer than SCAN — we can never accidentally read
//   foreign keys.
//
// PUBLIC-DATA INVARIANT
//   The aggregate view is admin-only and never exposes the raw PAT (only
//   the redacted `tokenLabel`). The `lambdaId` field is best-effort
//   `VERCEL_REGION:pid` — useful for "is one lambda dragging the average
//   down?" but not sensitive.

import {
  POOL_REDIS_KEY_PREFIX,
  POOL_REDIS_TTL_SECONDS,
  getGitHubTokenPool,
  poolRedisKeyFor,
  redactToken,
  type PublishedTokenState,
} from "./github-token-pool";
import { getDataStore } from "./data-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-token row in the aggregate view. `latestState` is whichever lambda
 * wrote most recently — last write wins for the headline numbers.
 */
export interface AggregateTokenRow {
  tokenLabel: string;
  /** Most-recent state write across the fleet (last writer wins). null if no lambda has reported yet. */
  latestState: PublishedTokenState | null;
  /** Number of distinct lambdas that have reported on this token recently (TTL-bounded). */
  contributorLambdas: number;
}

/**
 * Fleet-wide snapshot. `tokensSeen` counts the number of distinct token
 * labels in the local pool; `lambdasReporting` is the union across all
 * tokens of distinct contributor lambdas. The two latter aggregates are
 * computed across `latestState` values only — by design we don't try to
 * sum stale-by-many-minutes values from per-lambda histories.
 */
export interface AggregatePoolState {
  tokensSeen: number;
  totalRemainingAcrossFleet: number;
  exhaustedCount: number;
  quarantinedCount: number;
  lambdasReporting: number;
  perToken: AggregateTokenRow[];
  /** True when Redis is unreachable / unconfigured — view degraded to local-only. */
  redisUnavailable: boolean;
  /** ISO timestamp the aggregate was assembled. */
  assembledAt: string;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function isExhausted(state: PublishedTokenState, nowSec: number): boolean {
  return (
    state.remaining !== null &&
    state.remaining <= 0 &&
    state.resetUnixSec !== null &&
    state.resetUnixSec > nowSec
  );
}

function isQuarantined(state: PublishedTokenState, nowMs: number): boolean {
  return state.quarantinedUntilMs !== null && state.quarantinedUntilMs > nowMs;
}

function parsePublishedState(raw: unknown): PublishedTokenState | null {
  if (raw === null || raw === undefined) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (obj === null || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  // Validate the minimum-viable shape — anything weirder is treated as
  // missing rather than crashing the admin page.
  if (typeof o.tokenLabel !== "string") return null;
  if (typeof o.lambdaId !== "string") return null;
  if (typeof o.writtenAt !== "string") return null;
  return {
    tokenLabel: o.tokenLabel,
    remaining: typeof o.remaining === "number" ? o.remaining : null,
    resetUnixSec:
      typeof o.resetUnixSec === "number" ? o.resetUnixSec : null,
    lastObservedMs:
      typeof o.lastObservedMs === "number" ? o.lastObservedMs : null,
    quarantinedUntilMs:
      typeof o.quarantinedUntilMs === "number" ? o.quarantinedUntilMs : null,
    lambdaId: o.lambdaId,
    writtenAt: o.writtenAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read every `pool:github:tokens:*` key the local pool knows about and
 * reduce them into a fleet-wide snapshot. NEVER throws — when Redis is
 * unreachable, returns `redisUnavailable: true` with empty per-token rows
 * so the admin page renders a clear degraded-mode banner.
 *
 * Today this only stores ONE state per token (last writer wins). To track
 * per-lambda history we'd need a hash or a list per token; the simpler
 * design covers the headline question ("is the FLEET healthy?") without
 * adding key explosion. `contributorLambdas` is therefore 0 or 1 per row
 * — a placeholder for when we extend the publish payload to include a
 * second key per (token, lambda) pair.
 */
export async function readAggregatePoolState(): Promise<AggregatePoolState> {
  const assembledAt = new Date().toISOString();
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  // Token labels = derived from the local pool snapshot. Every lambda has
  // the same env, so the same label set. This bypasses the need for SCAN.
  const localPool = getGitHubTokenPool();
  const tokenLabels = Array.from(
    new Set(localPool.snapshot().map((s) => redactToken(s.token))),
  );

  const store = getDataStore();
  const client = store.redisClient();
  if (!client) {
    return {
      tokensSeen: tokenLabels.length,
      totalRemainingAcrossFleet: 0,
      exhaustedCount: 0,
      quarantinedCount: 0,
      lambdasReporting: 0,
      perToken: tokenLabels.map((tokenLabel) => ({
        tokenLabel,
        latestState: null,
        contributorLambdas: 0,
      })),
      redisUnavailable: true,
      assembledAt,
    };
  }

  const reads = await Promise.all(
    tokenLabels.map(async (tokenLabel) => {
      try {
        const raw = await client.get(poolRedisKeyFor(tokenLabel));
        return { tokenLabel, state: parsePublishedState(raw) };
      } catch {
        return { tokenLabel, state: null as PublishedTokenState | null };
      }
    }),
  );

  let totalRemaining = 0;
  let exhausted = 0;
  let quarantined = 0;
  const distinctLambdas = new Set<string>();
  const perToken: AggregateTokenRow[] = [];

  for (const { tokenLabel, state } of reads) {
    if (state) {
      // Sum remaining only when we have a confirmed number; null = "not
      // observed yet, optimistically healthy" — don't fudge a number.
      if (typeof state.remaining === "number") {
        totalRemaining += Math.max(0, state.remaining);
      }
      if (isExhausted(state, nowSec)) exhausted += 1;
      if (isQuarantined(state, nowMs)) quarantined += 1;
      distinctLambdas.add(state.lambdaId);
    }
    perToken.push({
      tokenLabel,
      latestState: state,
      contributorLambdas: state ? 1 : 0,
    });
  }

  return {
    tokensSeen: tokenLabels.length,
    totalRemainingAcrossFleet: totalRemaining,
    exhaustedCount: exhausted,
    quarantinedCount: quarantined,
    lambdasReporting: distinctLambdas.size,
    perToken,
    redisUnavailable: false,
    assembledAt,
  };
}

// Re-exports so the admin page can import from one module.
export {
  POOL_REDIS_KEY_PREFIX,
  POOL_REDIS_TTL_SECONDS,
  poolRedisKeyFor,
};
