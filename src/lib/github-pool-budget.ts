import * as Sentry from "@sentry/nextjs";

import { readAggregatePoolState } from "@/lib/github-token-pool-aggregate";
import { redis } from "@/lib/redis";

const DEFAULT_LIMIT_PER_TOKEN = 5_000;
const ROLLING_WINDOW_MS = 15 * 60 * 1000;
const ALERT_THRESHOLD_USED_PCT = 80;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_SAMPLES = 512;

interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...rest: unknown[]): Promise<unknown>;
}

export interface GithubPoolBudgetSample {
  ts: number;
  usedPct: number;
  remaining: number;
  capacity: number;
  tokensSeen: number;
  redisUnavailable: boolean;
}

export interface GithubPoolBudgetRolling {
  windowMinutes: number;
  sampleCount: number;
  minUsedPct: number;
  p50UsedPct: number;
  p95UsedPct: number;
  maxUsedPct: number;
  latestUsedPct: number;
  alerting: boolean;
}

let redisClient: RedisLike = redis as unknown as RedisLike;
let sentryCaptureMessage: typeof Sentry.captureMessage = Sentry.captureMessage;

function sampleKey(): string {
  return "pool:github:budget:used:samples";
}

function alertedAtKey(): string {
  return "pool:github:budget:used:alerted-at";
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx] ?? 0;
}

export function isGithubPoolBudgetMuteActive(
  now: Date = new Date(),
  schedule: string | undefined = process.env.GITHUB_POOL_BUDGET_MUTE_WINDOWS_UTC,
): boolean {
  const raw = (schedule ?? "").trim();
  if (!raw) return false;
  const force = raw.toLowerCase();
  if (force === "1" || force === "true" || force === "always") return true;

  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const windows = raw.split(",").map((token) => token.trim()).filter(Boolean);
  for (const windowSpec of windows) {
    const [startRaw, endRaw] = windowSpec.split("-").map((x) => x?.trim());
    if (!startRaw || !endRaw) continue;
    const start = parseMinuteOfDay(startRaw);
    const end = parseMinuteOfDay(endRaw);
    if (start === null || end === null) continue;
    if (start <= end) {
      if (nowMinutes >= start && nowMinutes < end) return true;
      continue;
    }
    // Overnight window, e.g. 23:50-00:20
    if (nowMinutes >= start || nowMinutes < end) return true;
  }
  return false;
}

function parseMinuteOfDay(raw: string): number | null {
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1] ?? "", 10);
  const mm = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function encodeSample(sample: GithubPoolBudgetSample): string {
  return JSON.stringify(sample);
}

function decodeSample(raw: string): GithubPoolBudgetSample | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ts = Number(parsed.ts);
    const usedPct = Number(parsed.usedPct);
    const remaining = Number(parsed.remaining);
    const capacity = Number(parsed.capacity);
    const tokensSeen = Number(parsed.tokensSeen);
    const redisUnavailable = Boolean(parsed.redisUnavailable);
    if (
      !Number.isFinite(ts) ||
      !Number.isFinite(usedPct) ||
      !Number.isFinite(remaining) ||
      !Number.isFinite(capacity) ||
      !Number.isFinite(tokensSeen)
    ) {
      return null;
    }
    return {
      ts: Math.floor(ts),
      usedPct: clampPct(usedPct),
      remaining: Math.max(0, Math.floor(remaining)),
      capacity: Math.max(0, Math.floor(capacity)),
      tokensSeen: Math.max(0, Math.floor(tokensSeen)),
      redisUnavailable,
    };
  } catch {
    return null;
  }
}

export async function collectGithubPoolBudgetSample(
  nowMs: number = Date.now(),
): Promise<GithubPoolBudgetSample> {
  const aggregate = await readAggregatePoolState();
  const capacity = aggregate.tokensSeen * DEFAULT_LIMIT_PER_TOKEN;
  const remaining = Math.max(0, aggregate.totalRemainingAcrossFleet);
  const usedPct =
    capacity > 0 ? clampPct(((capacity - remaining) / capacity) * 100) : 0;

  return {
    ts: nowMs,
    usedPct,
    remaining,
    capacity,
    tokensSeen: aggregate.tokensSeen,
    redisUnavailable: aggregate.redisUnavailable,
  };
}

async function readRolling(nowMs: number): Promise<GithubPoolBudgetRolling> {
  const values = (
    await redisClient.zrangebyscore(sampleKey(), nowMs - ROLLING_WINDOW_MS, nowMs)
  )
    .map(decodeSample)
    .filter((v): v is GithubPoolBudgetSample => v !== null)
    .sort((a, b) => a.usedPct - b.usedPct)
    .map((v) => v.usedPct);

  const latest = values.length > 0 ? values[values.length - 1] ?? 0 : 0;

  return {
    windowMinutes: 15,
    sampleCount: values.length,
    minUsedPct: values[0] ?? 0,
    p50UsedPct: percentile(values, 0.5),
    p95UsedPct: percentile(values, 0.95),
    maxUsedPct: values.length > 0 ? values[values.length - 1] ?? 0 : 0,
    latestUsedPct: latest,
    alerting: values.length > 0 && percentile(values, 0.95) >= ALERT_THRESHOLD_USED_PCT,
  };
}

export async function recordGithubPoolBudget(
  sample: GithubPoolBudgetSample,
  opts: { muteActive: boolean } = { muteActive: false },
): Promise<GithubPoolBudgetRolling | null> {
  try {
    await redisClient.zadd(sampleKey(), sample.ts, encodeSample(sample));
    await redisClient.zremrangebyscore(sampleKey(), 0, sample.ts - ROLLING_WINDOW_MS);
    await redisClient.zremrangebyrank(sampleKey(), 0, -(MAX_SAMPLES + 1));

    const rolling = await readRolling(sample.ts);
    if (!rolling.alerting || opts.muteActive) return rolling;

    const prev = await redisClient.get(alertedAtKey());
    const prevMs = prev ? Number.parseInt(String(prev), 10) : 0;
    if (!Number.isFinite(prevMs) || sample.ts - prevMs >= ALERT_COOLDOWN_MS) {
      await redisClient.set(alertedAtKey(), String(sample.ts), "EX", 60 * 60);
      sentryCaptureMessage(
        `[github_pool_budget_used] rolling p95 used >= ${ALERT_THRESHOLD_USED_PCT}%`,
        {
          level: "error",
          tags: {
            source: "github",
            category: "quarantine",
            alert: "github-pool-budget-used-80",
          },
          extra: {
            sample,
            rolling,
          } as Record<string, unknown>,
        },
      );
    }

    return rolling;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[github-pool-budget] record failed: ${message}`);
    return null;
  }
}

export function _setGithubPoolBudgetDepsForTests(deps: {
  redis?: RedisLike;
  captureMessage?: typeof Sentry.captureMessage;
}): void {
  if (deps.redis) redisClient = deps.redis;
  if (deps.captureMessage) sentryCaptureMessage = deps.captureMessage;
}

export function _resetGithubPoolBudgetDepsForTests(): void {
  redisClient = redis as unknown as RedisLike;
  sentryCaptureMessage = Sentry.captureMessage;
}
