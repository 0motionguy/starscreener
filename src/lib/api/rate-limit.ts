// Simple in-memory rate limiter for public API routes.
// On serverless (Vercel) this resets per-function-instance, which is still
// useful for blunting bursts. For true global rate limiting, replace with
// Redis / KV in production.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60_000, // 1 minute
  maxRequests: 60,
};

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export function checkRateLimit(
  request: Request,
  options: Partial<RateLimitOptions> = {},
): { allowed: boolean; remaining: number; resetAt: number } {
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
