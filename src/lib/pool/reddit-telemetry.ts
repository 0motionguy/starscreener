import { redis } from "@/lib/redis";

export interface RedditCallTelemetryParams {
  userAgentFingerprint: string;
  statusCode: number;
  responseTimeMs: number;
  operation: string;
  success: boolean;
}

export interface RedditQuarantineParams {
  userAgentFingerprint: string;
  reason: "rate_limit" | "blocked" | "5xx";
  untilTimestamp: number;
}

export async function recordRedditCall(
  params: RedditCallTelemetryParams,
): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const usageKey = `pool:reddit:usage:${params.userAgentFingerprint}:${hourBucket}`;

  await redis.hincrby(usageKey, "requests", 1);
  if (params.success) {
    await redis.hincrby(usageKey, "success", 1);
  } else {
    await redis.hincrby(usageKey, "fail", 1);
  }
  await redis.hset(usageKey, "lastStatusCode", params.statusCode);
  await redis.hset(usageKey, "lastResponseMs", params.responseTimeMs);
  await redis.hset(usageKey, "lastOperation", params.operation);
  await redis.hset(usageKey, "lastCallAt", new Date().toISOString());
  await redis.expire(usageKey, 60 * 60 * 25);
}

export async function quarantineUserAgent(
  params: RedditQuarantineParams,
): Promise<void> {
  const key = `pool:reddit:quarantine:${params.userAgentFingerprint}`;
  await redis.set(key, JSON.stringify(params), "EXAT", params.untilTimestamp);
}

export async function isUserAgentQuarantined(
  userAgentFingerprint: string,
): Promise<boolean> {
  const key = `pool:reddit:quarantine:${userAgentFingerprint}`;
  const value = await redis.get(key);
  return value !== null;
}
