// Worker GitHub PAT pool. Merges GITHUB_TOKEN and both comma-separated pool
// aliases. De-dupes, trims, drops empties. Round-robin pick on each call.
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
const POOL_REDIS_RESOURCE_KEY_PREFIX = 'pool:github:token-resources';
const QUARANTINE_TTL_MS = 24 * 60 * 60 * 1000;
const POOL_REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;

let cachedTokens: string[] | null = null;
let cursor = 0;

export type GithubRateLimitResource = 'search' | 'core' | 'graphql';
const GITHUB_RATE_LIMIT_RESOURCES = ['search', 'core', 'graphql'] as const;

interface ResourceHint {
  remaining: number | null;
  resetUnixSec: number | null;
}

interface SharedTokenHint {
  /** Legacy last-observed fields kept for app-side wire compatibility. */
  remaining: number | null;
  resetUnixSec: number | null;
  resources: Partial<Record<GithubRateLimitResource, ResourceHint>>;
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
  pushIfNew(env.GITHUB_TOKEN);
  for (const name of ['GH_TOKEN_POOL', 'GITHUB_TOKEN_POOL'] as const) {
    const pool = env[name];
    if (typeof pool === 'string' && pool.trim().length > 0) {
      for (const raw of pool.split(',')) pushIfNew(raw);
    }
  }
  return poolTokens;
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
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function poolRedisKeyFor(tokenLabel: string): string {
  return `${POOL_REDIS_KEY_PREFIX}:${tokenLabel}`;
}

function poolRedisResourceKeyFor(
  tokenLabel: string,
  resource: GithubRateLimitResource,
): string {
  return `${POOL_REDIS_RESOURCE_KEY_PREFIX}:${tokenLabel}:${resource}`;
}

function isUnusable(
  hint: SharedTokenHint | undefined,
  resource: GithubRateLimitResource,
  nowMs: number,
): boolean {
  if (!hint) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (hint.quarantinedUntilMs !== null && hint.quarantinedUntilMs > nowMs) {
    return true;
  }
  const resourceHint = hint.resources[resource];
  const limitHint = resourceHint ??
    (resource === 'core' && Object.keys(hint.resources).length === 0
      ? hint
      : undefined);
  if (
    limitHint?.remaining !== null &&
    limitHint?.remaining !== undefined &&
    limitHint.remaining <= 0 &&
    limitHint.resetUnixSec !== null &&
    limitHint.resetUnixSec > nowSec
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
  const resources: SharedTokenHint['resources'] = {};
  if (r.resources && typeof r.resources === 'object') {
    const rawResources = r.resources as Record<string, unknown>;
    for (const resource of GITHUB_RATE_LIMIT_RESOURCES) {
      const rawResource = rawResources[resource];
      if (!rawResource || typeof rawResource !== 'object') continue;
      const value = rawResource as Record<string, unknown>;
      resources[resource] = {
        remaining: num(value.remaining),
        resetUnixSec: num(value.resetUnixSec),
      };
    }
  }
  return {
    remaining: num(r.remaining),
    resetUnixSec: num(r.resetUnixSec),
    resources,
    quarantinedUntilMs: num(r.quarantinedUntilMs),
  };
}

function parseResourceHint(raw: unknown): ResourceHint | null {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const value = obj as Record<string, unknown>;
  const remaining =
    typeof value.remaining === 'number' && Number.isFinite(value.remaining)
      ? value.remaining
      : value.remaining === null ? null : undefined;
  const resetUnixSec =
    typeof value.resetUnixSec === 'number' && Number.isFinite(value.resetUnixSec)
      ? value.resetUnixSec
      : value.resetUnixSec === null ? null : undefined;
  if (remaining === undefined || resetUnixSec === undefined) return null;
  return { remaining, resetUnixSec };
}

function mergeHints(
  older: SharedTokenHint,
  newer: SharedTokenHint | undefined,
): SharedTokenHint {
  if (!newer) {
    const resources = resourcesWithLegacyCore(older);
    const core = resources.core;
    return {
      ...older,
      remaining: core?.remaining ?? null,
      resetUnixSec: core?.resetUnixSec ?? null,
      resources,
    };
  }
  const resources = {
    ...resourcesWithLegacyCore(older),
    ...resourcesWithLegacyCore(newer),
  };
  const core = resources.core;
  return {
    remaining: core?.remaining ?? null,
    resetUnixSec: core?.resetUnixSec ?? null,
    resources,
    quarantinedUntilMs: Math.max(
      older.quarantinedUntilMs ?? 0,
      newer.quarantinedUntilMs ?? 0,
    ) || null,
  };
}

function resourcesWithLegacyCore(
  hint: SharedTokenHint,
): SharedTokenHint['resources'] {
  if (Object.keys(hint.resources).length > 0) return hint.resources;
  if (hint.remaining === null && hint.resetUnixSec === null) return {};
  return {
    core: {
      remaining: hint.remaining,
      resetUnixSec: hint.resetUnixSec,
    },
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
    let hydratedHint: SharedTokenHint | null = null;
    try {
      hydratedHint = parseHint(await handle.get(poolRedisKeyFor(label)));
    } catch {
      // Resource subkeys may still be available.
    }
    if (hydratedHint) hydratedHint = mergeHints(hydratedHint, undefined);

    for (const resource of GITHUB_RATE_LIMIT_RESOURCES) {
      let resourceHint: ResourceHint | null = null;
      try {
        resourceHint = parseResourceHint(
          await handle.get(poolRedisResourceKeyFor(label, resource)),
        );
      } catch {
        // Keep any aggregate and other resource hints.
      }
      if (!resourceHint) continue;
      hydratedHint ??= {
        remaining: null,
        resetUnixSec: null,
        resources: {},
        quarantinedUntilMs: null,
      };
      hydratedHint.resources[resource] = resourceHint;
      if (resource === 'core') {
        hydratedHint.remaining = resourceHint.remaining;
        hydratedHint.resetUnixSec = resourceHint.resetUnixSec;
      }
    }

    if (hydratedHint) {
      sharedHints.set(token, mergeHints(hydratedHint, sharedHints.get(token)));
    }
  }
  hasHydrated = true;
}

function ensureHydration(): void {
  if (hydrationPromise !== null) return;
  hydrationPromise = hydrateFromRedis().catch(() => undefined);
}

export function pickGithubToken(
  resource: GithubRateLimitResource = 'core',
): string | null {
  const tokens = getGithubTokens();
  if (tokens.length === 0) return null;

  // Fire-and-forget hydration on first pick. Never blocks: the very first
  // call may pre-shared-state, but cursor advances normally so we still
  // distribute load across PATs while Redis warms up.
  ensureHydration();

  const nowMs = Date.now();
  const usable: string[] = [];
  for (const t of tokens) {
    if (!isUnusable(sharedHints.get(t), resource, nowMs)) usable.push(t);
  }
  // Known-exhausted/revoked credentials are never retried until their hint
  // expires; callers can preserve last-good data when the pool is unusable.
  if (usable.length === 0) return null;
  const token = usable[cursor % usable.length] ?? null;
  cursor = (cursor + 1) % usable.length;
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
  resource: GithubRateLimitResource = 'core',
): void {
  const tokens = getGithubTokens();
  if (!tokens.includes(token)) return;
  const previous = sharedHints.get(token);
  const resourceHint: ResourceHint = {
    remaining: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : null,
    resetUnixSec:
      Number.isFinite(resetUnixSec) && resetUnixSec > 0
        ? Math.floor(resetUnixSec)
        : null,
  };
  const resources = { ...previous?.resources, [resource]: resourceHint };
  const core = resource === 'core' ? resourceHint : resources.core;
  const hint: SharedTokenHint = {
    remaining: core?.remaining ?? previous?.remaining ?? null,
    resetUnixSec: core?.resetUnixSec ?? previous?.resetUnixSec ?? null,
    resources,
    quarantinedUntilMs: previous?.quarantinedUntilMs ?? null,
  };
  sharedHints.set(token, hint);
  void publishHint(token, hint, resource);
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
    resources: {},
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
): { remaining: number; resetUnixSec: number; resource: GithubRateLimitResource | null } | null {
  const remainingStr = headers.get('x-ratelimit-remaining');
  const resetStr = headers.get('x-ratelimit-reset');
  if (remainingStr === null || resetStr === null) return null;
  const remaining = Number.parseInt(remainingStr, 10);
  const resetUnixSec = Number.parseInt(resetStr, 10);
  if (!Number.isFinite(remaining) || !Number.isFinite(resetUnixSec)) {
    return null;
  }
  const rawResource = headers.get('x-ratelimit-resource');
  const resource = rawResource === 'search' || rawResource === 'core' || rawResource === 'graphql'
    ? rawResource
    : null;
  return { remaining, resetUnixSec, resource };
}

async function publishHint(
  token: string,
  hint: SharedTokenHint,
  resource?: GithubRateLimitResource,
): Promise<void> {
  let handle;
  try {
    handle = await getRedis();
  } catch {
    return;
  }
  if (!handle) return;
  const label = redactToken(token);
  const resourceHint = resource ? hint.resources[resource] : undefined;
  if (resource && resourceHint) {
    try {
      await handle.set(
        poolRedisResourceKeyFor(label, resource),
        JSON.stringify(resourceHint),
        { ex: POOL_REDIS_TTL_SECONDS },
      );
    } catch {
      // Keep the compatibility aggregate best-effort if the subkey fails.
    }
  }
  // Re-read local state after the async Redis lookup so an older in-flight
  // rate-limit publish cannot clear a newer 401 quarantine or resource hint.
  const local = mergeHints(hint, sharedHints.get(token));
  let remote: SharedTokenHint | null = null;
  try {
    remote = parseHint(await handle.get(poolRedisKeyFor(label)));
  } catch {
    // A failed read must not prevent publishing the local observation.
  }
  const latest = remote ? mergeHints(remote, local) : local;
  sharedHints.set(token, latest);
  // Wire-format compatible with PublishedTokenState in the app-side pool.
  const payload = {
    tokenLabel: label,
    remaining: latest.remaining,
    resetUnixSec: latest.resetUnixSec,
    resources: latest.resources,
    lastObservedMs: Date.now(),
    quarantinedUntilMs: latest.quarantinedUntilMs,
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
