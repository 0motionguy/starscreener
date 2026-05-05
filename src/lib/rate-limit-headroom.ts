import * as Sentry from "@sentry/nextjs";
import { redis } from "@/lib/redis";

const WINDOW_MS = 60 * 60 * 1000;
const ALERT_THRESHOLD_PCT = 10;
const MAX_SAMPLES_PER_SOURCE = 2048;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
// Explicit shape — RuntimeRedis (the project's wrapper) doesn't surface
// zset/hash methods statically, but the underlying client does. Tests inject
// a mock; runtime uses the cast `redis` directly.
interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hget(key: string, field: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...rest: unknown[]): Promise<unknown>;
}
let redisClient: RedisLike = redis as unknown as RedisLike;
let sentryCaptureMessage: typeof Sentry.captureMessage = Sentry.captureMessage;

export interface RateLimitRolling {
  source: string;
  sampleCount: number;
  minPct: number;
  p50Pct: number;
  p95Pct: number;
  lastLimit: number;
  lastRemaining: number;
  updatedAt: string;
  alerting: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
}

function sampleKey(source: string): string {
  return `ratelimit:${source}:samples`;
}

function rollingKey(source: string): string {
  return `ratelimit:${source}:rolling`;
}

function alertKey(source: string): string {
  return `ratelimit:${source}:alerted-at`;
}

function normalizeSample(remaining: number, limit: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / limit) * 100));
}

export async function recordRateLimitSample(params: {
  source: string;
  remaining: number | null;
  limit: number | null;
}): Promise<void> {
  if (!params.source || params.remaining === null || params.limit === null) return;
  if (!Number.isFinite(params.remaining) || !Number.isFinite(params.limit) || params.limit <= 0) return;

  const nowMs = Date.now();
  const pct = normalizeSample(params.remaining, params.limit);
  const member = `${nowMs}:${Math.round(params.remaining)}:${Math.round(params.limit)}:${pct.toFixed(3)}`;
  const sKey = sampleKey(params.source);
  const rKey = rollingKey(params.source);

  try {
    await redisClient.zadd(sKey, nowMs, member);
    await redisClient.zremrangebyscore(sKey, 0, nowMs - WINDOW_MS);
    await redisClient.zremrangebyrank(sKey, 0, -(MAX_SAMPLES_PER_SOURCE + 1));

    const raw = await redisClient.zrangebyscore(sKey, nowMs - WINDOW_MS, nowMs);
    const values = raw
      .map((entry: string): number | null => {
        const parts = String(entry).split(":");
        const v = Number.parseFloat(parts[3] ?? "");
        return Number.isFinite(v) ? v : null;
      })
      .filter((v: number | null): v is number => v !== null)
      .sort((a: number, b: number) => a - b);
    if (values.length === 0) return;

    const rolling: RateLimitRolling = {
      source: params.source,
      sampleCount: values.length,
      minPct: values[0] ?? 0,
      p50Pct: percentile(values, 0.5),
      p95Pct: percentile(values, 0.95),
      lastLimit: Math.round(params.limit),
      lastRemaining: Math.round(params.remaining),
      updatedAt: new Date(nowMs).toISOString(),
      alerting: percentile(values, 0.95) < ALERT_THRESHOLD_PCT,
    };

    await redisClient.hset(rKey, "json", JSON.stringify(rolling));
    await redisClient.expire(rKey, 60 * 60 * 25);

    if (rolling.alerting) {
      const prev = await redisClient.get(alertKey(params.source));
      const prevMs = prev ? Number.parseInt(String(prev), 10) : 0;
      if (!Number.isFinite(prevMs) || nowMs - prevMs >= ALERT_COOLDOWN_MS) {
        await redisClient.set(alertKey(params.source), String(nowMs), "EX", 60 * 60);
        sentryCaptureMessage(
          `[rate-limit-headroom] ${params.source} p95 below ${ALERT_THRESHOLD_PCT}%`,
          {
            level: "error",
            tags: {
              source: params.source,
              alert: "rate-limit-headroom-low",
              category: "quarantine",
            },
            extra: rolling as unknown as Record<string, unknown>,
          },
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rate-limit-headroom] failed for ${params.source}: ${message}`);
  }
}

export async function getRateLimitRolling(
  source: string,
): Promise<RateLimitRolling | null> {
  try {
    const raw = await redisClient.hget(rollingKey(source), "json");
    if (!raw) return null;
    const parsed = JSON.parse(String(raw)) as RateLimitRolling;
    return parsed;
  } catch {
    return null;
  }
}

export function _setRateLimitHeadroomDepsForTests(deps: {
  redis?: RedisLike;
  captureMessage?: typeof Sentry.captureMessage;
}): void {
  if (deps.redis) redisClient = deps.redis;
  if (deps.captureMessage) sentryCaptureMessage = deps.captureMessage;
}

export function _resetRateLimitHeadroomDepsForTests(): void {
  redisClient = redis as unknown as RedisLike;
  sentryCaptureMessage = Sentry.captureMessage;
}
