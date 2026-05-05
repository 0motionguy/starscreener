import { redis } from "@/lib/redis";
import { keys } from "@/lib/redis/keys";
import { createHash } from "node:crypto";
import { redactSensitiveText } from "@/lib/log-redaction";

const DEFAULT_GITHUB_POOL_NAMESPACE = "prod";

function githubPoolNamespace(): string {
  const raw =
    process.env.GITHUB_POOL_NAMESPACE ??
    process.env.GITHUB_POOL_TELEMETRY_NAMESPACE ??
    DEFAULT_GITHUB_POOL_NAMESPACE;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return DEFAULT_GITHUB_POOL_NAMESPACE;
  const safe = trimmed.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
  return safe || DEFAULT_GITHUB_POOL_NAMESPACE;
}

export type GithubQuarantineReason =
  | "rate_limit"
  | "invalid_token"
  | "forbidden"
  | "5xx";

export interface GithubCallTelemetry {
  keyFingerprint: string;
  statusCode: number;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  responseTimeMs: number;
  operation: string;
  success: boolean;
}

export function githubKeyFingerprint(token: string | null | undefined): string {
  const trimmed = token?.trim() ?? "";
  if (trimmed.length === 0) return "none";
  const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  return `${trimmed.slice(-4)}-${hash}`;
}

export async function recordGithubCall(
  params: GithubCallTelemetry,
): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const usageKey = keys.pool.github.usage(
    githubPoolNamespace(),
    params.keyFingerprint,
    hourBucket,
  );

  try {
    await redis.hincrby(usageKey, "requests", 1);
    if (params.success) await redis.hincrby(usageKey, "success", 1);
    else await redis.hincrby(usageKey, "fail", 1);

    if (params.rateLimitRemaining !== null) {
      await redis.hset(
        usageKey,
        "lastRateLimitRemaining",
        params.rateLimitRemaining,
      );
    }
    if (params.rateLimitReset !== null) {
      await redis.hset(usageKey, "lastRateLimitReset", params.rateLimitReset);
    }
    await redis.hset(usageKey, "lastStatusCode", params.statusCode);
    await redis.hset(usageKey, "lastResponseMs", params.responseTimeMs);
    await redis.hset(usageKey, "lastOperation", params.operation);
    await redis.hset(usageKey, "lastCallAt", new Date().toISOString());
    await redis.expire(usageKey, 60 * 60 * 25);
  } catch (err) {
    warnTelemetryFailure("recordGithubCall", err);
  }
}

export async function quarantineKey(params: {
  keyFingerprint: string;
  reason: GithubQuarantineReason;
  untilTimestamp: number;
}): Promise<void> {
  const key = keys.pool.github.quarantine(
    githubPoolNamespace(),
    params.keyFingerprint,
  );
  try {
    await redis.set(key, JSON.stringify(params), "EXAT", params.untilTimestamp);
  } catch (err) {
    warnTelemetryFailure("quarantineKey", err);
  }
}

export async function isKeyQuarantined(
  keyFingerprint: string,
): Promise<boolean> {
  const key = keys.pool.github.quarantine(
    githubPoolNamespace(),
    keyFingerprint,
  );
  try {
    const value = await redis.get(key);
    return value !== null;
  } catch (err) {
    warnTelemetryFailure("isKeyQuarantined", err);
    return false;
  }
}

let warned = false;

function warnTelemetryFailure(op: string, err: unknown): void {
  if (warned) return;
  warned = true;
  const message = redactSensitiveText(
    err instanceof Error ? err.message : String(err),
  );
  console.warn(`[github-telemetry] ${op} failed: ${message}`);
}

export function _resetGithubTelemetryWarningsForTests(): void {
  warned = false;
}
