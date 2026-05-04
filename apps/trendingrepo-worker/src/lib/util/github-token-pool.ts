// Worker GitHub PAT pool. Reads GH_TOKEN_POOL (comma-separated, preferred —
// that's the env var surface in CI) or GITHUB_TOKEN (single, legacy fallback
// only when no pool exists). De-dupes, trims, drops empties. Round-robin
// pick on each call.
//
// SHARED-QUOTA COORDINATION
//   Both lanes (Next.js app + this worker) read the same PATs from the same
//   env vars. Without coordination they double-bill the same 5,000/hr quota.
//   The app-side pool at src/lib/github-token-pool.ts publishes per-token
//   state to `pool:github:tokens:<redactedLabel>` Redis keys (remaining,
//   resetUnixSec, quarantinedUntilMs). This pool consults those keys before
//   handing out a token and skips ones the app lane has observed exhausted
//   or quarantined. The reverse direction (worker→app) is symmetric: this
//   pool publishes its own observations under the same key shape so the
//   app lane sees worker-discovered exhaustion too.
//
//   Hydration is fire-and-forget: pickGithubToken() stays sync and never
//   blocks. The first call after process start kicks off a Redis read in
//   the background; subsequent calls benefit from the warm cache. Redis
//   brownouts degrade gracefully — pool falls back to plain round-robin.

import { getRedis } from '../redis.js';

const POOL_REDIS_KEY_PREFIX = 'pool:github:tokens';
const QUARANTINE_TTL_MS = 24 * 60 * 60 * 1000;
const POOL_REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;

let cachedTokens: string[] | null = null;
let cursor = 0;

interface SharedTokenHint {
  remaining: number | null;
  resetUnixSec: number | null;
  quarantinedUntilMs: number | null;
}

const sharedHints = new Map<string, SharedTokenHint>();
let hydrationPromise: Promise<void> | null = null;
let hasHydrated = false;

function loadTokens(env: NodeJS.ProcessEnv = process.env): string[] {
  const seenPool = new Set<string>();
  const poolTokens: string[] = [];
  const pushIfNew = (raw: string | undefined): void => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed || seenPool.has(trimmed)) return;
    seenPool.add(trimmed);
    poolTokens.push(trimmed);
  };
  for (const name of ['GH_TOKEN_POOL', 'GITHUB_TOKEN_POOL'] as const) {
    const pool = env[name];
    if (typeof pool === 'string' && pool.trim().length > 0) {
      for (const raw of pool.split(',')) pushIfNew(raw);
    }
  }
  if (poolTokens.length > 0) return poolTokens;

  const singleton = env.GITHUB_TOKEN?.trim();
  return singleton ? [singleton] : [];
}

export function getGithubTokens(): string[] {
  if (cachedTokens === null) {
    cachedTokens = loadTokens();
  }
  return cachedTokens;
}

/**
 * Render a token for log/key use without leaking the secret. Mirrors the
 * `redactToken` form used by src/lib/github-token-pool.ts so the Redis key
 * namespace matches across lanes.
 */
function redactToken(token: string): string {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function poolRedisKeyFor(tokenLabel: string): string {
  return `${POOL_REDIS_KEY_PREFIX}:${tokenLabel}`;
}

function isUnusable(hint: SharedTokenHint | undefined, nowMs: number): boolean {
  if (!hint) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (hint.quarantinedUntilMs !== null && hint.quarantinedUntilMs > nowMs) {
    return true;
  }
  if (
    hint.remaining !== null &&
    hint.remaining <= 0 &&
    hint.resetUnixSec !== null &&
    hint.resetUnixSec > nowSec
  ) {
    return true;
  }
  return false;
}

function parseHint(raw: unknown): SharedTokenHint | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  return {
    remaining: num(r.remaining),
    resetUnixSec: num(r.resetUnixSec),
    quarantinedUntilMs: num(r.quarantinedUntilMs),
  };
}

async function hydrateFromRedis(): Promise<void> {
  let handle;
  try {
    handle = await getRedis();
  } catch {
    return;
  }
  if (!handle) return;
  const tokens = getGithubTokens();
  for (const token of tokens) {
    const label = redactToken(token);
    let raw: string | null;
    try {
      raw = await handle.get(poolRedisKeyFor(label));
    } catch {
      continue;
    }
    if (raw === null) continue;
    const hint = parseHint(raw);
    if (hint) sharedHints.set(token, hint);
  }
  hasHydrated = true;
}

function ensureHydration(): void {
  if (hydrationPromise !== null) return;
  hydrationPromise = hydrateFromRedis().catch(() => undefined);
}

export function pickGithubToken(): string | null {
  const tokens = getGithubTokens();
  if (tokens.length === 0) return null;

  // Fire-and-forget hydration on first pick. Never blocks: the very first
  // call may pre-shared-state, but cursor advances normally so we still
  // distribute load across PATs while Redis warms up.
  ensureHydration();

  const nowMs = Date.now();
  const usable: string[] = [];
  for (const t of tokens) {
    if (!isUnusable(sharedHints.get(t), nowMs)) usable.push(t);
  }
  // If shared state says every token is exhausted, fall through to the full
  // list anyway — the worker MUST attempt a call rather than silently no-op,
  // so a stale Redis hint can't lock us out. The next response will record
  // the truth via recordRateLimit().
  const candidates = usable.length > 0 ? usable : tokens;
  const token = candidates[cursor % candidates.length] ?? null;
  cursor = (cursor + 1) % Math.max(candidates.length, 1);
  return token;
}

/**
 * Publish a per-token observation to the shared Redis namespace so the
 * Next.js lane (and future worker processes) skip exhausted tokens. Safe to
 * call after every GitHub response. Fire-and-forget: never throws, never
 * blocks the caller. Pool-foreign tokens are silently ignored.
 */
export function recordRateLimit(
  token: string,
  remaining: number,
  resetUnixSec: number,
): void {
  const tokens = getGithubTokens();
  if (!tokens.includes(token)) return;
  const hint: SharedTokenHint = {
    remaining: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : null,
    resetUnixSec:
      Number.isFinite(resetUnixSec) && resetUnixSec > 0
        ? Math.floor(resetUnixSec)
        : null,
    quarantinedUntilMs: sharedHints.get(token)?.quarantinedUntilMs ?? null,
  };
  sharedHints.set(token, hint);
  void publishHint(token, hint);
}

/**
 * Mark a PAT as quarantined for 24h. Use when a 401 is observed — the PAT
 * is invalid/revoked. Fire-and-forget: never throws.
 */
export function quarantine(token: string): void {
  const tokens = getGithubTokens();
  if (!tokens.includes(token)) return;
  const prev = sharedHints.get(token) ?? {
    remaining: null,
    resetUnixSec: null,
    quarantinedUntilMs: null,
  };
  const hint: SharedTokenHint = {
    ...prev,
    quarantinedUntilMs: Date.now() + QUARANTINE_TTL_MS,
  };
  sharedHints.set(token, hint);
  void publishHint(token, hint);
}

/**
 * Extract `(remaining, resetUnixSec)` from response Headers. Mirrors the
 * helper in src/lib/github-token-pool.ts so callers can do
 *   const rl = parseRateLimitHeaders(res.headers);
 *   if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec);
 */
export function parseRateLimitHeaders(
  headers: Headers,
): { remaining: number; resetUnixSec: number } | null {
  const remainingStr = headers.get('x-ratelimit-remaining');
  const resetStr = headers.get('x-ratelimit-reset');
  if (remainingStr === null || resetStr === null) return null;
  const remaining = Number.parseInt(remainingStr, 10);
  const resetUnixSec = Number.parseInt(resetStr, 10);
  if (!Number.isFinite(remaining) || !Number.isFinite(resetUnixSec)) {
    return null;
  }
  return { remaining, resetUnixSec };
}

async function publishHint(token: string, hint: SharedTokenHint): Promise<void> {
  let handle;
  try {
    handle = await getRedis();
  } catch {
    return;
  }
  if (!handle) return;
  const label = redactToken(token);
  // Wire-format compatible with PublishedTokenState in the app-side pool.
  const payload = {
    tokenLabel: label,
    remaining: hint.remaining,
    resetUnixSec: hint.resetUnixSec,
    lastObservedMs: Date.now(),
    quarantinedUntilMs: hint.quarantinedUntilMs,
    lambdaId: `worker:${process.pid}`,
    writtenAt: new Date().toISOString(),
  };
  try {
    await handle.set(poolRedisKeyFor(label), JSON.stringify(payload), {
      ex: POOL_REDIS_TTL_SECONDS,
    });
  } catch {
    // Swallow — Redis brownout MUST NOT break the GitHub call that triggered
    // this observation.
  }
}

/** Observability: did the first pick complete its Redis hydration? */
export function isHydrated(): boolean {
  return hasHydrated;
}

/** Test-only: drop all cached state so each test starts fresh. */
export function _resetGithubTokenPoolForTests(): void {
  cachedTokens = null;
  cursor = 0;
  sharedHints.clear();
  hydrationPromise = null;
  hasHydrated = false;
}
