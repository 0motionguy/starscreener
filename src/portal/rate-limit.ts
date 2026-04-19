// StarScreener — Portal in-memory rate limiter.
//
// Token-bucket per client key, keyed by IP (X-Forwarded-For fallback) or
// X-API-Key header when present. Scoped to /portal/* routes only — never
// applied to the existing /api/* surface.
//
// IMPORTANT — Vercel serverless affinity:
// Buckets live in a Node module-level Map, which is per-instance. Vercel
// may run several concurrent serverless instances, so a burst that lands
// across instances can exceed the advertised rate. In practice this means
// attackers can burst ~N * limit where N is the number of warm instances;
// the limits remain useful as a DoS ceiling but are NOT a strong guarantee.
// Migrate to an external store (Upstash Redis, Vercel Edge Config) in v0.2
// when horizontal scale matters.

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  reset_at_ms: number; // epoch ms when the next token will be available
}

export interface RateLimitConfig {
  capacity: number;
  refillPerWindowMs: number;
  windowMs: number;
}

const UNAUTH: RateLimitConfig = {
  capacity: 10,
  refillPerWindowMs: 10,
  windowMs: 60_000,
};

const AUTH: RateLimitConfig = {
  capacity: 1000,
  refillPerWindowMs: 1000,
  windowMs: 60_000,
};

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  config: RateLimitConfig;
}

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket, nowMs: number): void {
  const elapsed = nowMs - bucket.lastRefillMs;
  if (elapsed <= 0) return;
  const refillRatePerMs =
    bucket.config.refillPerWindowMs / bucket.config.windowMs;
  const tokensToAdd = elapsed * refillRatePerMs;
  bucket.tokens = Math.min(bucket.config.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefillMs = nowMs;
}

/**
 * Consume one token for `key`. Returns a RateLimitResult with ok=false
 * when the bucket is empty and a reset_at_ms indicating when the next
 * whole token becomes available.
 */
export function consumeToken(
  key: string,
  authed: boolean,
  nowMs: number = Date.now(),
): RateLimitResult {
  const config = authed ? AUTH : UNAUTH;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      tokens: config.capacity,
      lastRefillMs: nowMs,
      config,
    };
    buckets.set(key, bucket);
  } else {
    // Config can shift if the same key sends both authed+unauthed; keep
    // the most recent config but clamp capacity.
    bucket.config = config;
    bucket.tokens = Math.min(bucket.tokens, config.capacity);
    refill(bucket, nowMs);
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      reset_at_ms: nowMs,
    };
  }

  // Empty bucket — compute when the next whole token lands.
  const msPerToken = config.windowMs / config.refillPerWindowMs;
  const tokensShortOfOne = 1 - bucket.tokens;
  const msToOne = Math.ceil(tokensShortOfOne * msPerToken);
  return {
    ok: false,
    remaining: 0,
    reset_at_ms: nowMs + msToOne,
  };
}

/** Test-only helper — drops every bucket. Not exported via index.ts. */
export function _resetBucketsForTests(): void {
  buckets.clear();
}

/** Test-only helper — override config. Not exported via index.ts. */
export function _overrideConfigForTests(
  which: "auth" | "unauth",
  config: RateLimitConfig,
): void {
  Object.assign(which === "auth" ? AUTH : UNAUTH, config);
}
