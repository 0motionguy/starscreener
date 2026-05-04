import { redis } from "@/lib/redis";

export type TwitterSource = "apify" | "nitter";

export interface TwitterCallTelemetry {
  source: TwitterSource;
  success: boolean;
  statusCode?: number | null;
  responseTimeMs?: number | null;
}

export interface TwitterDegradationTelemetry {
  from: TwitterSource;
  error: string;
}

export async function recordTwitterCall(
  params: TwitterCallTelemetry,
): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const usageKey = `pool:twitter:usage:${params.source}:${hourBucket}`;

  await redis.hincrby(usageKey, "requests", 1);
  if (params.success) {
    await redis.hincrby(usageKey, "success", 1);
  } else {
    await redis.hincrby(usageKey, "fail", 1);
  }
  if (params.statusCode !== undefined && params.statusCode !== null) {
    await redis.hset(usageKey, "lastStatusCode", params.statusCode);
  }
  if (params.responseTimeMs !== undefined && params.responseTimeMs !== null) {
    await redis.hset(usageKey, "lastResponseMs", params.responseTimeMs);
  }
  await redis.hset(usageKey, "lastCallAt", new Date().toISOString());
  await redis.expire(usageKey, 60 * 60 * 25);
}

export async function recordDegradation(
  params: TwitterDegradationTelemetry,
): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const key = `pool:twitter:degradation:${hourBucket}`;
  await redis.hincrby(key, "count", 1);
  await redis.hincrby(key, `from:${params.from}`, 1);
  await redis.hset(key, "lastError", params.error.slice(0, 300));
  await redis.hset(key, "lastFrom", params.from);
  await redis.hset(key, "lastAt", new Date().toISOString());
  await redis.expire(key, 60 * 60 * 25);
}
