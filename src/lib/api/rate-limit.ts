// StarScreener — Rate limiter for public API routes.
//
// Two surfaces, same semantics:
//
//   checkRateLimit(request, opts)       — SYNCHRONOUS, memory-only
//   checkRateLimitAsync(request, opts)  — ASYNC, Upstash-backed when env set,
//                                         memory fallback otherwise
//
// The sync variant is preserved for back-compat with every existing caller.
// The async variant is what new and migrated routes should use — it's the
// only path that holds across Vercel Lambdas.
//
// Rationale: on Vercel serverless the sync in-memory counter resets per warm
// Lambda, so a determined attacker cycling through cold starts can exceed
// the advertised limit. The Upstash-backed async path fixes that by sharing
// state across every instance via REST.
//
// See `./rate-limit-store.ts` for the store abstraction and Upstash
// implementation. Tests for each path live in
// `src/lib/pipeline/__tests__/rate-limit.test.ts` (memory) and
// `src/lib/pipeline/__tests__/rate-limit-upstash.test.ts` (upstash).

import { tierFor, type UserTier } from "@/lib/pricing/tiers";

import { createStore, type RateLimitStore } from "./rate-limit-store";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60_000, // 1 minute
  maxRequests: 60,
};

function getClientIp(request: Request): string {
  // Prefer the Vercel-signed header — it cannot be forged by a client because
  // Vercel's edge sets it from the real socket address. The legacy
  // `x-forwarded-for` is trusted only when the Vercel header is absent
  // (local dev, non-Vercel hosts) AND we still take the leftmost segment.
  // See security audit note 2026-05-18 for why blind XFF trust was unsafe.
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    return vercel.split(",")[0]?.trim() ?? "unknown";
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Synchronous — in-memory only. Preserved for back-compat; do not change
// the signature without migrating every caller in the same commit.
// ---------------------------------------------------------------------------

export function checkRateLimit(
  request: Request,
  options: Partial<RateLimitOptions> = {},
): RateLimitResult {
  const { windowMs, maxRequests } = { ...DEFAULT_OPTIONS, ...options };
  const key = getClientIp(request);
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { tokens: maxRequests - 1, lastRefill: now });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor((elapsed / windowMs) * maxRequests);

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: bucket.tokens, resetAt: now + windowMs };
  }

  return { allowed: false, remaining: 0, resetAt: bucket.lastRefill + windowMs };
}

// ---------------------------------------------------------------------------
// Asynchronous — Upstash-backed when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set, memory fallback otherwise. This is the
// only variant that holds across serverless Lambdas.
// ---------------------------------------------------------------------------

// Lazy singleton so we only instantiate the Upstash client once per cold
// start and never at module load (module load runs during `next build`,
// where env vars for the Upstash REST client may not be available).
let sharedStore: RateLimitStore | null = null;
function getStore(): RateLimitStore {
  if (!sharedStore) sharedStore = createStore();
  return sharedStore;
}

export interface AsyncRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** Ms until the current window closes. Useful for Retry-After headers. */
  retryAfterMs: number;
  /** Current count in the window (for debugging / headers). */
  count: number;
}

/**
 * Fixed-window rate limit check. Backed by Upstash Redis when configured,
 * per-instance memory map otherwise. Never throws on transport errors — on
 * Upstash failure it silently falls back to memory (see
 * UpstashRateLimitStore for details).
 *
 * Callers should prefer this variant over `checkRateLimit` for any route
 * that is exposed on Vercel serverless and where cross-Lambda enforcement
 * matters. The sync variant remains available for back-compat.
 *
 * Subject keying (S3.5 hardening, 2026-05-18): pass `subject` (typically the
 * authenticated profile id) so authenticated routes key their bucket on the
 * user, not on the forgeable IP. When `subject` is omitted the limiter falls
 * back to `getClientIp(request)` — which now prefers Vercel's signed
 * `x-vercel-forwarded-for` over the trivially-forgeable `x-forwarded-for`.
 *
 * Tier multiplier (S5.A.4, 2026-05-18): pass `tier` to scale `maxRequests` by
 * the tier's `rateLimitMultiplier`. Free=1×, Pro=10×, Team=25×, Enterprise=100×
 * (see src/lib/pricing/tiers.ts). The effective cap is rounded UP so a Pro
 * user always gets at least 10× the free limit. The bucket key carries the
 * effective cap, so a user upgrading mid-bucket gets a fresh allowance.
 *
 * Callers should resolve the tier via `getUserTier(userId)` (or
 * `getUserTierRecord(userId).tier`) once per request and pass the result.
 * The limiter does not look up the tier itself — that would force a
 * mtime stat on every request, including anonymous ones that don't need
 * tier resolution at all.
 */
export async function checkRateLimitAsync(
  request: Request,
  options: Partial<RateLimitOptions> & {
    subject?: string;
    tier?: UserTier;
  } = {},
  /** Test hook: inject a store instead of the shared singleton. */
  store: RateLimitStore = getStore(),
): Promise<AsyncRateLimitResult> {
  const { windowMs, maxRequests } = { ...DEFAULT_OPTIONS, ...options };
  const subject = options.subject?.trim();

  // Tier multiplier — Free=1× by default, scales up via tier.rateLimitMultiplier.
  // Math.ceil so a 1.5× multiplier would yield ceil(60 * 1.5) = 90 (never less).
  const tier = options.tier;
  const multiplier =
    tier !== undefined ? tierFor(tier).features.rateLimitMultiplier : 1;
  const effectiveMax = Math.max(1, Math.ceil(maxRequests * multiplier));

  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  // Key format:
  //   - subject path: `rl:u:<userId>:<window>:<effectiveMax>` (namespaced so a
  //     userId that happens to be shaped like an IP can never collide)
  //   - IP path:      `rl:<ip>:<window>:<effectiveMax>` (unchanged shape from
  //     pre-S3.5 hardening, so existing rate-limit-routes.test.ts fixtures
  //     still line up — they pre-seed buckets at the IP-keyed shape)
  // effectiveMax is in the key so a user upgrading mid-bucket gets a fresh
  // allowance (the old bucket TTLs out without blocking the new one).
  const key = subject
    ? `rl:u:${subject}:${windowMs}:${effectiveMax}`
    : `rl:${getClientIp(request)}:${windowMs}:${effectiveMax}`;

  const { count, ttlRemainingMs } = await store.incrementWithTtl(key, ttlSec);
  const now = Date.now();

  if (count > effectiveMax) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + ttlRemainingMs,
      retryAfterMs: ttlRemainingMs,
      count,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, effectiveMax - count),
    resetAt: now + ttlRemainingMs,
    retryAfterMs: 0,
    count,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Test-only — clears the shared sync bucket map. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}

/** Test-only — replace the shared async store (e.g. inject a fake). */
export function _setStoreForTests(store: RateLimitStore | null): void {
  sharedStore = store;
}
