import * as Sentry from "@sentry/nextjs";

import { getDataStore, type RedisClientLike } from "./data-store";

// StarScreener — GitHub PAT pool with per-token rate-limit accounting.
//
// PROBLEM
//   Every GitHub API call in the in-process pipeline (ingest adapter, code
//   search, stargazer + events backfills) reads `process.env.GITHUB_TOKEN`
//   directly. One token revocation kills all ingestion. At 10x scale we
//   blow through the 5,000/hr quota; at 100x it's infeasible. SOURCES.md
//   item #1 of "Critical observations" flags this as the top SPOF.
//
// SOLUTION
//   This module exposes a singleton pool that holds N PATs (the existing
//   GITHUB_TOKEN PLUS any tokens listed in `GITHUB_TOKEN_POOL`, comma-
//   separated). Per-token state tracks last-known `remaining` quota and
//   `reset` epoch. `getNextToken()` picks the token with the most remaining
//   quota; tokens at quota=0 with a future `reset` are skipped until reset
//   passes. Caller MUST call `recordRateLimit(token, remaining, reset)`
//   after every response so the pool stays current.
//
// DESIGN GUARANTEES
//   1. `getNextToken()` THROWS when every token is exhausted. Silent
//      degradation is forbidden — the operator needs to know they're out
//      of quota so they can rotate / add tokens.
//   2. Selection state is process-local for the hot path, but every observed
//      token state is published to Redis for fleet telemetry and cold-start
//      hydration. Redis failures never block a GitHub call.
//   3. Tokens with no recorded quota are assumed healthy (they get the
//      benefit of the doubt on first use; the response will record the
//      real number).
//   4. Test mock-injectable: `createGitHubTokenPool({ env, now })`.
//
// MODELED AFTER
//   - src/lib/api/rate-limit-store.ts (singleton + lazy init shape)
//   - src/lib/data-store.ts (factory with env override + onFallback hook)

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** GitHub's free-tier authenticated quota per token. Used as the optimistic
 *  "remaining" assumption for tokens we haven't called yet. */
export const DEFAULT_GITHUB_QUOTA = 5_000;

/** How long (ms) a 401-quarantined token stays out of rotation before the
 *  pool optimistically reuses it. 24h gives an operator time to rotate the
 *  PAT without forcing a process restart for recovery. */
export const QUARANTINE_TTL_MS = 24 * 60 * 60 * 1000;

export interface TokenState {
  /** The token string. Never logged in full — see `redact()`. */
  readonly token: string;
  /**
   * Best-known remaining quota. `null` means "never seen a response from
   * this token yet" — treat as healthy until proven otherwise.
   */
  remaining: number | null;
  /**
   * Best-known reset epoch in seconds (matches GitHub's
   * `X-RateLimit-Reset` header). `null` means unknown / no recorded
   * exhaustion.
   */
  resetUnixSec: number | null;
  /** Last response observation timestamp (ms). For debugging only. */
  lastObservedMs: number | null;
  /**
   * Wall-clock ms (from the pool's `now()` source) until which this token
   * is quarantined and will be skipped by `getNextToken()`. Set when a 401
   * is observed (token revoked / invalid). Auto-clears after a fixed TTL
   * so a re-issued token recovers without a process restart.
   */
  quarantinedUntilMs: number | null;
  /**
   * Hysteresis flag for the low-quota Sentry warning. Set to `true` when a
   * `recordRateLimit` observation drops `remaining` below 500, preventing
   * subsequent calls from re-firing the warning. Reset to `false` when
   * `remaining` climbs back above 1000 (typical post-reset recovery), so
   * the next dip pages operators again. Without hysteresis, a single
   * exhaustion would flood Sentry with one warning per request.
   */
  lowQuotaWarned: boolean;
}

export interface GitHubTokenPool {
  /**
   * Pick the next token to use. Returns the healthiest token (highest
   * known remaining quota, with unknown-quota tokens treated as the
   * optimistic max). Throws if every token is exhausted (remaining<=0
   * and resetUnixSec is in the future).
   */
  getNextToken(): string;
  /**
   * Update per-token state from response headers. Called from the adapter
   * after every GitHub response. Unknown tokens (e.g. someone bypassed
   * the pool) are ignored — the pool only tracks tokens it owns.
   */
  recordRateLimit(token: string, remaining: number, resetUnixSec: number): void;
  /**
   * Mark a token as quarantined for `QUARANTINE_TTL_MS` (default 24h).
   * Use when a 401 is observed — the PAT is invalid / revoked and shouldn't
   * be picked again until the operator rotates it. Auto-clears after the
   * TTL elapses so a re-issued token in the same env slot recovers.
   * Pool-foreign tokens are silently ignored (same shape as `recordRateLimit`).
   */
  quarantine(token: string): void;
  /** Return current state for observability / tests. */
  snapshot(): readonly TokenState[];
  /** Cold-start hydration state for admin telemetry / tests. */
  hydrationStatus(): {
    enabled: boolean;
    started: boolean;
    completed: boolean;
  };
  /** Number of tokens currently in the pool. */
  size(): number;
}

export type EnvLike = Record<string, string | undefined>;

export interface CreateGitHubTokenPoolOptions {
  /** Override `process.env`. Defaults to `process.env`. */
  env?: EnvLike;
  /**
   * Override the wall clock. Defaults to `Date.now()`. Only used to
   * compare against `resetUnixSec * 1000`.
   */
  now?: () => number;
  /**
   * Called when the pool boots with zero tokens. Defaults to a noop;
   * the singleton path replaces this with a one-shot console.warn so
   * the operator sees the missing-config in logs.
   */
  onEmpty?: () => void;
  /**
   * COLD-START-HYDRATE — when `true`, the first `getNextToken()` call
   * fire-and-forget kicks off `hydrateFromRedis()` so subsequent picks
   * see last-known per-token state published by sibling lambdas. Default
   * `false` so the test factory stays synchronous and offline. The
   * singleton path opts in.
   */
  hydrate?: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by `getNextToken()` when no token has remaining quota. */
export class GitHubTokenPoolExhaustedError extends Error {
  public readonly resetsAtUnixSec: number | null;
  public readonly allQuarantined: boolean;
  constructor(
    resetsAtUnixSec: number | null,
    opts: { allQuarantined?: boolean } = {},
  ) {
    const allQuarantined = opts.allQuarantined === true;
    const when =
      resetsAtUnixSec !== null
        ? `; soonest reset at ${new Date(resetsAtUnixSec * 1000).toISOString()}`
        : "";
    const message = allQuarantined
      ? `[github-token-pool] All tokens quarantined (401 invalid/revoked). ` +
        `Rotate the PATs in GITHUB_TOKEN / GH_TOKEN_POOL.`
      : `[github-token-pool] All tokens exhausted${when}. ` +
        `Add more PATs to GITHUB_TOKEN_POOL or wait for the reset window.`;
    super(message);
    this.name = "GitHubTokenPoolExhaustedError";
    this.resetsAtUnixSec = resetsAtUnixSec;
    this.allQuarantined = allQuarantined;
  }
}

/** Thrown when `getNextToken()` is called on an empty pool. */
export class GitHubTokenPoolEmptyError extends Error {
  constructor() {
    super(
      "[github-token-pool] Pool is empty. Set GITHUB_TOKEN and/or " +
        "GITHUB_TOKEN_POOL (comma-separated) before invoking GitHub APIs.",
    );
    this.name = "GitHubTokenPoolEmptyError";
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class DefaultGitHubTokenPool implements GitHubTokenPool {
  private readonly states: TokenState[];
  private readonly index = new Map<string, TokenState>();
  private readonly now: () => number;
  /** Round-robin cursor used to break ties between equally-healthy tokens. */
  private cursor = 0;
  /**
   * COLD-START-HYDRATE state. `hydrationEnabled` opts the pool into reading
   * Redis on first use (singleton path = true; test factory = false).
   * `hydrationPromise` is the in-flight fire-and-forget promise; presence of
   * a non-null value means hydration has started (we never block on it).
   * `hasHydrated` flips true after a successful Redis read so callers can
   * tell if the pool is operating on warm vs cold state.
   */
  private readonly hydrationEnabled: boolean;
  private hydrationPromise: Promise<void> | null = null;
  private hasHydrated = false;

  constructor(tokens: string[], now: () => number, hydrationEnabled = false) {
    this.now = now;
    this.hydrationEnabled = hydrationEnabled;
    this.states = tokens.map((token) => ({
      token,
      remaining: null,
      resetUnixSec: null,
      lastObservedMs: null,
      quarantinedUntilMs: null,
      lowQuotaWarned: false,
    }));
    for (const state of this.states) {
      this.index.set(state.token, state);
    }
  }

  size(): number {
    return this.states.length;
  }

  snapshot(): readonly TokenState[] {
    // Return shallow clones so callers can't mutate internal state.
    return this.states.map((s) => ({ ...s }));
  }

  hydrationStatus(): {
    enabled: boolean;
    started: boolean;
    completed: boolean;
  } {
    return {
      enabled: this.hydrationEnabled,
      started: this.hydrationPromise !== null,
      completed: this.hasHydrated,
    };
  }

  getNextToken(): string {
    if (this.states.length === 0) {
      throw new GitHubTokenPoolEmptyError();
    }

    // COLD-START-HYDRATE — kick off Redis read on first call. Fire-and-forget
    // so we never add latency to the first pick; subsequent picks (and any
    // recordRateLimit between them) benefit from the warm state. Errors are
    // swallowed: a Redis brownout must NEVER break a GitHub call.
    if (this.hydrationEnabled && this.hydrationPromise === null) {
      this.hydrationPromise = this.hydrateFromRedis()
        .then(() => undefined)
        .catch(() => undefined);
    }

    const nowMs = this.now();
    const nowSec = Math.floor(nowMs / 1000);

    // Build the candidate list: tokens that are NOT currently exhausted
    // and NOT currently quarantined. A token is exhausted iff remaining<=0
    // AND its reset is still in the future. Once reset passes, the token
    // is healthy again (we optimistically assume the full quota until the
    // next response proves otherwise). A token is quarantined iff
    // `quarantinedUntilMs` is set and still in the future.
    type Candidate = { state: TokenState; effectiveRemaining: number; idx: number };
    const candidates: Candidate[] = [];
    let soonestReset: number | null = null;
    let quarantinedCount = 0;

    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i];

      // Auto-clear expired quarantines so a re-issued PAT recovers without
      // any operator action beyond updating the env var.
      if (
        state.quarantinedUntilMs !== null &&
        state.quarantinedUntilMs <= nowMs
      ) {
        state.quarantinedUntilMs = null;
      }
      if (state.quarantinedUntilMs !== null) {
        quarantinedCount++;
        continue;
      }

      const isExhausted =
        state.remaining !== null &&
        state.remaining <= 0 &&
        state.resetUnixSec !== null &&
        state.resetUnixSec > nowSec;

      if (isExhausted) {
        if (
          soonestReset === null ||
          (state.resetUnixSec !== null && state.resetUnixSec < soonestReset)
        ) {
          soonestReset = state.resetUnixSec;
        }
        continue;
      }

      // Unknown remaining → assume optimistic full quota so untested tokens
      // get a fair shot at being picked first.
      const effectiveRemaining =
        state.remaining === null ? DEFAULT_GITHUB_QUOTA : state.remaining;
      candidates.push({ state, effectiveRemaining, idx: i });
    }

    if (candidates.length === 0) {
      const allQuarantined =
        quarantinedCount > 0 && quarantinedCount === this.states.length;
      const exhaustedError = new GitHubTokenPoolExhaustedError(soonestReset, {
        allQuarantined,
      });
      // Sentry alert: pool exhaustion is the canonical "page operators NOW"
      // event. Captured at the throw site so callers don't need to repeat
      // this — they re-throw / bubble whatever they want for app-level UX.
      Sentry.captureException(exhaustedError, {
        tags: {
          pool: "github",
          all_quarantined: String(allQuarantined),
          soonest_reset_iso:
            soonestReset !== null
              ? new Date(soonestReset * 1000).toISOString()
              : "none",
        },
      });
      throw exhaustedError;
    }

    // Pick the highest effective remaining. On ties, advance the round-robin
    // cursor so equally-healthy tokens are spread evenly across calls. This
    // is the property the "all healthy → round-robin" test exercises.
    let maxRemaining = -1;
    for (const c of candidates) {
      if (c.effectiveRemaining > maxRemaining) {
        maxRemaining = c.effectiveRemaining;
      }
    }
    const tied = candidates.filter((c) => c.effectiveRemaining === maxRemaining);

    // Rotate through the tied set deterministically. The cursor advances
    // every call so consecutive calls with the same tied set distribute
    // round-robin even when GitHub hasn't yet decremented the headers.
    const pick = tied[this.cursor % tied.length];
    this.cursor = (this.cursor + 1) % Math.max(tied.length, 1);
    return pick.state.token;
  }

  recordRateLimit(token: string, remaining: number, resetUnixSec: number): void {
    const state = this.index.get(token);
    if (!state) {
      // Caller used a token the pool doesn't own — silently ignore so
      // callers that bypass the pool don't pollute pool state.
      return;
    }
    if (Number.isFinite(remaining)) {
      state.remaining = Math.max(0, Math.floor(remaining));
    }
    if (Number.isFinite(resetUnixSec) && resetUnixSec > 0) {
      state.resetUnixSec = Math.floor(resetUnixSec);
    }
    state.lastObservedMs = this.now();
    this._emitLowQuotaWarning(state);
    // Fire-and-forget publish so sibling Vercel lambdas can build a
    // fleet-wide aggregate at /admin/pool-aggregate. Never blocks the
    // request and never throws if Redis is missing.
    void publishTokenStateToRedis(state);
  }

  /**
   * Fire a Sentry warning the FIRST time a token's `remaining` drops below
   * 500 in a given low-quota episode. Hysteresis: the flag stays set until
   * `remaining` recovers above 1000 (typical post-reset jump back to the
   * full 5000 quota). Without this, every subsequent `recordRateLimit`
   * call below 500 would page Sentry — noisy and useless.
   */
  private _emitLowQuotaWarning(state: TokenState): void {
    if (state.remaining === null) return;
    if (state.remaining < 500 && !state.lowQuotaWarned) {
      state.lowQuotaWarned = true;
      Sentry.captureMessage(
        `[github-token-pool] Low quota: ${redactToken(state.token)} has ${state.remaining} remaining`,
        {
          level: "warning",
          tags: {
            pool: "github",
            token: redactToken(state.token),
            remaining: String(state.remaining),
          },
        },
      );
    } else if (state.remaining > 1000 && state.lowQuotaWarned) {
      // Recovery: clear the flag so the next dip below 500 fires again.
      state.lowQuotaWarned = false;
    }
  }

  quarantine(token: string): void {
    const state = this.index.get(token);
    if (!state) return;
    state.quarantinedUntilMs = this.now() + QUARANTINE_TTL_MS;
    state.lastObservedMs = this.now();
    // Sentry alert: a quarantine means GitHub returned 401 for this PAT —
    // the operator must rotate it. Distinct from rate-limit exhaustion
    // (which self-heals at reset) so we tag `reason: "401"` so the alert
    // routing can differentiate.
    Sentry.captureMessage(
      `[github-token-pool] PAT quarantined (401 invalid/revoked): ${redactToken(token)}`,
      {
        level: "error",
        tags: {
          pool: "github",
          token: redactToken(token),
          reason: "401",
        },
      },
    );
    // Fire-and-forget publish — same rationale as recordRateLimit.
    void publishTokenStateToRedis(state);
  }

  /**
   * COLD-START-HYDRATE — read each pool token's last-known state from Redis
   * (published by POOL-REDIS via `recordRateLimit` / `quarantine` from any
   * lambda) and seed the in-memory state. Idempotent: safe to call multiple
   * times. Returns `{ hydrated, total }` for observability.
   *
   * Tokens with no Redis entry are left at their constructor default (null
   * remaining/reset, treated as healthy at DEFAULT_GITHUB_QUOTA), matching
   * the existing "benefit of the doubt" semantics.
   *
   * Never throws — Redis brownouts return `{ hydrated: 0, total }` so the
   * caller's fire-and-forget pattern stays safe.
   */
  async hydrateFromRedis(): Promise<{ hydrated: number; total: number }> {
    const total = this.states.length;
    if (total === 0) return { hydrated: 0, total: 0 };

    let client: RedisClientLike | null;
    try {
      client = getDataStore().redisClient();
    } catch {
      return { hydrated: 0, total };
    }
    if (!client) return { hydrated: 0, total };

    let hydrated = 0;
    for (const state of this.states) {
      const tokenLabel = redactToken(state.token);
      let raw: unknown;
      try {
        raw = await client.get(poolRedisKeyFor(tokenLabel));
      } catch {
        continue;
      }
      if (raw === null || raw === undefined) continue;
      const parsed = parsePublishedTokenState(raw);
      if (!parsed) continue;
      // Match by label — `tokenLabel` is the canonical Redis key, but we
      // also defend against a payload that drifted from its key.
      if (parsed.tokenLabel !== tokenLabel) continue;

      if (parsed.remaining !== null) state.remaining = parsed.remaining;
      if (parsed.resetUnixSec !== null) state.resetUnixSec = parsed.resetUnixSec;
      if (parsed.lastObservedMs !== null) state.lastObservedMs = parsed.lastObservedMs;
      // Only seed the quarantine if it's still in the future per OUR clock —
      // a stale entry from before a quarantine TTL elapsed shouldn't lock
      // out a freshly-rotated PAT.
      if (
        parsed.quarantinedUntilMs !== null &&
        parsed.quarantinedUntilMs > this.now()
      ) {
        state.quarantinedUntilMs = parsed.quarantinedUntilMs;
      }
      hydrated++;
    }
    this.hasHydrated = true;
    return { hydrated, total };
  }
}

/**
 * Parse a `PublishedTokenState` blob as written by `publishTokenStateToRedis`.
 * Accepts either a raw JSON string (Upstash REST returns strings) or an
 * already-decoded object (some clients pre-parse). Returns `null` on any
 * shape mismatch so a malformed entry never crashes hydration.
 */
function parsePublishedTokenState(raw: unknown): PublishedTokenState | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.tokenLabel !== "string") return null;
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : v === null ? null : null;
  return {
    tokenLabel: r.tokenLabel,
    remaining: numOrNull(r.remaining),
    resetUnixSec: numOrNull(r.resetUnixSec),
    lastObservedMs: numOrNull(r.lastObservedMs),
    quarantinedUntilMs: numOrNull(r.quarantinedUntilMs),
    lambdaId: typeof r.lambdaId === "string" ? r.lambdaId : "",
    writtenAt: typeof r.writtenAt === "string" ? r.writtenAt : "",
  };
}

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

/**
 * Read tokens from env. Order:
 *   1. GITHUB_TOKEN              (back-compat — always first if set)
 *   2. GITHUB_TOKEN_POOL[*]      (comma-separated, in declared order)
 *
 * Duplicates are dropped (someone listing the same PAT in both vars
 * shouldn't get extra round-robin slots that all hit the same quota).
 * Empty / whitespace-only entries are dropped.
 */
function parseTokens(env: EnvLike): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushIfNew = (raw: string | undefined) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  pushIfNew(env.GITHUB_TOKEN);

  // Two env-var conventions accepted, in priority order:
  //   GH_TOKEN_POOL       — required by GitHub Actions ("GITHUB_*" prefix
  //                          is reserved by the platform), so this is the
  //                          name secrets are actually set under in CI.
  //   GITHUB_TOKEN_POOL   — legacy / dev-machine alias. Read both so a
  //                          half-migrated env keeps working.
  // If both are set, both are merged into the same pool (de-duplicated).
  for (const envVarName of ["GH_TOKEN_POOL", "GITHUB_TOKEN_POOL"] as const) {
    const pool = env[envVarName];
    if (typeof pool === "string" && pool.trim().length > 0) {
      for (const raw of pool.split(",")) {
        pushIfNew(raw);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

export function createGitHubTokenPool(
  options: CreateGitHubTokenPoolOptions = {},
): GitHubTokenPool {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const tokens = parseTokens(env);

  if (tokens.length === 0 && options.onEmpty) {
    options.onEmpty();
  }

  return new DefaultGitHubTokenPool(tokens, now, options.hydrate === true);
}

let singleton: GitHubTokenPool | null = null;
let warnedAboutEmptyPool = false;

/**
 * Lazily-initialised process-wide pool. Mirrors `getDataStore()` so the
 * adapter / backfill scripts can `import { getGitHubTokenPool }` and get
 * a stable instance. The first call resolves env; subsequent calls reuse
 * the cached pool. Use `_resetGitHubTokenPoolForTests()` to start over.
 */
export function getGitHubTokenPool(): GitHubTokenPool {
  if (!singleton) {
    singleton = createGitHubTokenPool({
      hydrate: true,
      onEmpty: () => {
        if (warnedAboutEmptyPool) return;
        warnedAboutEmptyPool = true;
        // Boot warn rather than throw — matches the rate-limit-store
        // behaviour where missing config degrades visibly without
        // crashing the process. Callers of `getNextToken()` will get a
        // hard error at the moment they need a token.
        if (process.env.NODE_ENV === "production") {
          console.warn(
            "[github-token-pool] No PATs configured. Set GITHUB_TOKEN " +
              "(single PAT) and/or GITHUB_TOKEN_POOL (comma-separated " +
              "additional PATs) to authenticate GitHub API calls.",
          );
        }
      },
    });
  }
  return singleton;
}

/** Test-only — drop the cached pool so each test starts fresh. */
export function _resetGitHubTokenPoolForTests(): void {
  singleton = null;
  warnedAboutEmptyPool = false;
}

// ---------------------------------------------------------------------------
// Helpers used by callers that log token state safely
// ---------------------------------------------------------------------------

/**
 * Render a token for log output without leaking the secret. Shows the
 * first 4 and last 4 characters with the middle masked.
 */
export function redactToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Extract `(remaining, resetUnixSec)` from a fetch Response's headers.
 * Returns null when either header is missing or unparseable. Pool callers
 * use this to convert headers → `recordRateLimit` arguments.
 */
export function parseRateLimitHeaders(
  headers: Headers,
): { remaining: number; resetUnixSec: number } | null {
  const remainingStr = headers.get("x-ratelimit-remaining");
  const resetStr = headers.get("x-ratelimit-reset");
  if (remainingStr === null || resetStr === null) return null;
  const remaining = Number.parseInt(remainingStr, 10);
  const resetUnixSec = Number.parseInt(resetStr, 10);
  if (!Number.isFinite(remaining) || !Number.isFinite(resetUnixSec)) {
    return null;
  }
  return { remaining, resetUnixSec };
}

// ---------------------------------------------------------------------------
// Fleet-wide pool aggregation (Redis publish)
//
// Each lambda's pool is process-local. To answer "is the FLEET healthy?"
// recordRateLimit / quarantine ALSO publish the token's state to Redis under
// `pool:github:tokens:<redactedLabel>`. Sibling lambdas read these keys at
// /admin/pool-aggregate.
//
// The full PAT is NEVER written. Only the redactToken() form is used both
// as the key suffix and as the in-payload `tokenLabel`. TTL is 30 days so
// dead lambdas don't pollute the keyspace forever.
// ---------------------------------------------------------------------------

/** Key prefix for per-token fleet-aggregate state. Read by the aggregator. */
export const POOL_REDIS_KEY_PREFIX = "pool:github:tokens";

/** TTL (seconds) on each per-token key. 30d covers a normal "operator forgot to rotate" window. */
export const POOL_REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Wire-format payload published per token. NEVER includes the raw PAT.
 * `lambdaId` is best-effort identification of the writer so the aggregator
 * can surface "how many distinct lambdas have reported on this token".
 */
export interface PublishedTokenState {
  tokenLabel: string;
  remaining: number | null;
  resetUnixSec: number | null;
  lastObservedMs: number | null;
  quarantinedUntilMs: number | null;
  lambdaId: string;
  writtenAt: string;
}

/** Build the Redis key that holds the latest state for one token label. */
export function poolRedisKeyFor(tokenLabel: string): string {
  return `${POOL_REDIS_KEY_PREFIX}:${tokenLabel}`;
}

function currentLambdaId(): string {
  const region =
    typeof process !== "undefined" && process.env
      ? (process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local")
      : "local";
  const pid =
    typeof process !== "undefined" && typeof process.pid === "number"
      ? process.pid
      : 0;
  return `${region}:${pid}`;
}

/**
 * Fire-and-forget publish of one token's state to Redis. NEVER awaits, NEVER
 * throws — any Redis failure is swallowed so a brownout cannot break the
 * GitHub call that triggered it. No-op when the data-store has no Redis
 * client (env-missing fallback).
 */
function publishTokenStateToRedis(state: TokenState): void {
  try {
    const store = getDataStore();
    const client = store.redisClient();
    if (!client) return;
    const tokenLabel = redactToken(state.token);
    const payload: PublishedTokenState = {
      tokenLabel,
      remaining: state.remaining,
      resetUnixSec: state.resetUnixSec,
      lastObservedMs: state.lastObservedMs,
      quarantinedUntilMs: state.quarantinedUntilMs,
      lambdaId: currentLambdaId(),
      writtenAt: new Date().toISOString(),
    };
    // Pool keys live in their own `pool:github:tokens:*` namespace, distinct
    // from the data-store's `ss:data:v1:*` payload namespace, so we go
    // through the raw Redis client rather than store.write().
    const json = JSON.stringify(payload);
    void Promise.resolve(
      client.set(poolRedisKeyFor(tokenLabel), json, {
        ex: POOL_REDIS_TTL_SECONDS,
      }),
    ).catch(() => {
      // Swallow — fire-and-forget. A failure here MUST NOT affect the
      // GitHub call that triggered it.
    });
  } catch {
    // getDataStore / redisClient threw synchronously; swallow.
  }
}
