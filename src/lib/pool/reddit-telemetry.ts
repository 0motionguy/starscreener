import { redis } from "@/lib/redis";
import { keys } from "@/lib/redis/keys";

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
  const minuteBucket = new Date()
    .toISOString()
    .slice(0, 16)
    .replace("T", "-")
    .replace(":", "-");
  const usageKey = keys.pool.reddit.usage(
    params.userAgentFingerprint,
    hourBucket,
  );
  const usage30mKey = keys.pool.reddit.usage30m(
    params.userAgentFingerprint,
    minuteBucket,
  );
  const rateLimited = params.statusCode === 429 ? 1 : 0;

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
  if (rateLimited > 0) {
    await redis.hincrby(usageKey, "rateLimited", rateLimited);
    await redis.hset(usageKey, "last429At", new Date().toISOString());
  }
  await redis.expire(usageKey, 60 * 60 * 25);

  await redis.hincrby(usage30mKey, "requests", 1);
  if (params.success) {
    await redis.hincrby(usage30mKey, "success", 1);
  } else {
    await redis.hincrby(usage30mKey, "fail", 1);
  }
  if (rateLimited > 0) {
    await redis.hincrby(usage30mKey, "rateLimited", rateLimited);
  }
  await redis.expire(usage30mKey, 60 * 60 * 3);
}

export async function quarantineUserAgent(
  params: RedditQuarantineParams,
): Promise<void> {
  const key = keys.pool.reddit.quarantine(params.userAgentFingerprint);
  await redis.set(key, JSON.stringify(params), "EXAT", params.untilTimestamp);
}

export async function isUserAgentQuarantined(
  userAgentFingerprint: string,
): Promise<boolean> {
  const key = keys.pool.reddit.quarantine(userAgentFingerprint);
  const value = await redis.get(key);
  return value !== null;
}
