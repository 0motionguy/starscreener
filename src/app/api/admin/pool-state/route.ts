import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";
import {
  getGitHubTokenPool,
  redactToken,
  type PublishedTokenState,
} from "@/lib/github-token-pool";
import { githubKeyFingerprint } from "@/lib/pool/github-telemetry";
import { redditUserAgentFingerprint } from "@/lib/pool/reddit-ua-pool";
import { redis } from "@/lib/redis";
import { keys } from "@/lib/redis/keys";

import redditUserAgents from "@/../config/reddit-user-agents.json";
import nitterConfig from "@/../config/nitter-instances.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PoolStatus = "GREEN" | "YELLOW" | "RED" | "DEAD";
export type HeadroomStatus = PoolStatus;

export interface UsageSummary {
  requests24h: number;
  success24h: number;
  fail24h: number;
  rateLimited24h?: number;
  last429At?: string | null;
  lastCallAt: string | null;
  lastOperation: string | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
}

export interface QuarantineState {
  active: boolean;
  reason: string | null;
  until: string | null;
}

export interface GithubPoolRow extends UsageSummary {
  fingerprint: string;
  lastRateLimitRemaining: number | null;
  lastRateLimitReset: string | null;
  quarantine: QuarantineState;
  idle: boolean;
  status: PoolStatus;
}

export interface RedditPoolRow extends UsageSummary {
  fingerprint: string;
  userAgentLabel: string;
  last429At: string | null;
  requests30m: number;
  fail30m: number;
  rateLimited30m: number;
  quarantine: QuarantineState;
  status: PoolStatus;
}

export interface TwitterSourceRow extends UsageSummary {
  source: "apify" | "nitter";
  status: PoolStatus;
}

export interface NitterInstanceRow {
  url: string;
  status: "unknown" | "healthy" | "dead";
  lastChecked: string | null;
  deadCount24h: number;
  successRate24h: number | null;
}

export interface SingletonRow {
  name: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  status: PoolStatus;
}

export interface PoolAnomaly {
  severity: "YELLOW" | "RED";
  label: string;
  detail: string;
}

export interface RateLimitHeadroomRow {
  source: "github" | "reddit" | "twitter-apify";
  status: HeadroomStatus;
  headroomPct: number | null;
  detail: string;
}

export interface AdminPoolStateResponse {
  ok: true;
  generatedAt: string;
  anomalies: PoolAnomaly[];
  headroom: RateLimitHeadroomRow[];
  github: {
    totalConfigured: number;
    health: PoolStatus;
    rows: GithubPoolRow[];
  };
  reddit: {
    totalConfigured: number;
    health: PoolStatus;
    rows: RedditPoolRow[];
    rateLimitedLastHour: number;
    rateLimitedLast30Min: number;
    requestsLast30Min: number;
  };
  twitter: {
    apify: {
      lastSuccess: string | null;
      lastFailure: string | null;
      estimatedQuotaState: string;
      status: PoolStatus;
    };
    sources: TwitterSourceRow[];
    nitterInstances: NitterInstanceRow[];
    degradationRate24h: number;
  };
  singletons: SingletonRow[];
}

interface ErrorResponse {
  ok: false;
  error: string;
}

interface MetaFile {
  reason?: string;
  ts?: string;
  writtenAt?: string;
}

interface GithubKeyDescriptor {
  label: string;
  usageFingerprints: string[];
  publishedState: PublishedTokenState | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IDLE_KEY_MS = 12 * HOUR_MS;
const NITTER_DEAD_COUNT_ALERT_MIN = 1;
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

function hourBuckets(now: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    out.push(
      new Date(now.getTime() - i * HOUR_MS)
        .toISOString()
        .slice(0, 13)
        .replace("T", "-"),
    );
  }
  return out;
}

function minuteBuckets(now: Date, minutes: number): string[] {
  const out: string[] = [];
  const anchor = new Date(now);
  anchor.setSeconds(0, 0);
  for (let i = 0; i < minutes; i += 1) {
    out.push(
      new Date(anchor.getTime() - i * 60_000)
        .toISOString()
        .slice(0, 16)
        .replace("T", "-")
        .replace(":", "-"),
    );
  }
  return out;
}

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function latestIso(values: Array<string | null>): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const value of values) {
    const ms = value ? Date.parse(value) : NaN;
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = new Date(ms).toISOString();
      latestMs = ms;
    }
  }
  return latest;
}

function classifyByAge(iso: string | null, budgetMs: number): PoolStatus {
  if (!iso) return "DEAD";
  const ageMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ageMs)) return "DEAD";
  if (ageMs > budgetMs + DAY_MS) return "DEAD";
  if (ageMs > budgetMs * 2) return "RED";
  if (ageMs > budgetMs) return "YELLOW";
  return "GREEN";
}

type UsageBag = UsageSummary & {
  lastRateLimitRemaining: number | null;
  lastRateLimitReset: string | null;
};

/**
 * AGN-467: builds the bucket × fingerprint key list for a given pool member
 * without touching Redis. Lets `githubState` / `redditState` collect ALL
 * keys for ALL pool members and dispatch a single pipelined HGETALL via
 * `redis.hgetallMany` (1 round trip on ioredis) instead of
 * `Promise.all(rows.map(readUsage))` (which fanned out N × buckets HGETALLs
 * per request, scaling with the GitHub PAT pool size).
 */
function buildUsageKeys(
  prefix: "github" | "reddit" | "twitter",
  fingerprintOrAliases: string | string[],
  buckets: string[],
): string[] {
  const fingerprints = Array.from(
    new Set(
      (Array.isArray(fingerprintOrAliases)
        ? fingerprintOrAliases
        : [fingerprintOrAliases]
      ).filter(Boolean),
    ),
  );
  return buckets.flatMap((bucket) =>
    fingerprints.map((fingerprint) =>
      prefix === "github"
        ? keys.pool.github.usage(
            githubPoolNamespace(),
            fingerprint,
            bucket,
          )
        : prefix === "reddit"
          ? keys.pool.reddit.usage(fingerprint, bucket)
          : keys.pool.twitter.usage(fingerprint, bucket),
    ),
  );
}

function summarizeUsageHashes(hashes: ReadonlyArray<Record<string, string>>): UsageBag {
  let requests24h = 0;
  let success24h = 0;
  let fail24h = 0;
  let rateLimited24h = 0;
  let last429At: string | null = null;
  let lastCallAt: string | null = null;
  let lastOperation: string | null = null;
  let lastStatusCode: number | null = null;
  let lastResponseMs: number | null = null;
  let lastRateLimitRemaining: number | null = null;
  let lastRateLimitReset: string | null = null;

  for (const hash of hashes) {
    requests24h += parseNumber(hash.requests) ?? 0;
    success24h += parseNumber(hash.success) ?? 0;
    fail24h += parseNumber(hash.fail) ?? 0;
    rateLimited24h += parseNumber(hash.rateLimited) ?? 0;

    const callAt = parseIso(hash.lastCallAt);
    if (callAt && (!lastCallAt || Date.parse(callAt) > Date.parse(lastCallAt))) {
      lastCallAt = callAt;
      lastOperation = hash.lastOperation ?? null;
      lastStatusCode = parseNumber(hash.lastStatusCode);
      lastResponseMs = parseNumber(hash.lastResponseMs);
      lastRateLimitRemaining = parseNumber(hash.lastRateLimitRemaining);
      const resetUnix = parseNumber(hash.lastRateLimitReset);
      lastRateLimitReset = resetUnix
        ? new Date(resetUnix * 1000).toISOString()
        : null;
    }
    const rateLimitedAt = parseIso(hash.last429At);
    if (
      rateLimitedAt &&
      (!last429At || Date.parse(rateLimitedAt) > Date.parse(last429At))
    ) {
      last429At = rateLimitedAt;
    }
  }

  return {
    requests24h,
    success24h,
    fail24h,
    rateLimited24h,
    last429At,
    lastCallAt,
    lastOperation,
    lastStatusCode,
    lastResponseMs,
    lastRateLimitRemaining,
    lastRateLimitReset,
  };
}

/**
 * Single-pool-member usage read. Kept for `twitterState` (apify/nitter,
 * 2 sources total — pipelining buys nothing). The N+1-prone GitHub /
 * Reddit paths now batch via `buildUsageKeys` + `redis.hgetallMany`.
 */
async function readUsage(
  prefix: "github" | "reddit" | "twitter",
  fingerprintOrAliases: string | string[],
  buckets: string[],
): Promise<UsageBag> {
  const usageKeys = buildUsageKeys(prefix, fingerprintOrAliases, buckets);
  if (usageKeys.length === 0) return summarizeUsageHashes([]);
  const hashes = redis.hgetallMany
    ? await redis.hgetallMany(usageKeys)
    : await Promise.all(usageKeys.map((key) => redis.hgetall(key)));
  return summarizeUsageHashes(hashes);
}

/**
 * AGN-467: builds the quarantine key list for a given pool member without
 * touching Redis. Lets `githubState` collect ALL quarantine keys for ALL
 * GitHub PATs and dispatch a single `redis.mget` (1 round trip) instead
 * of N parallel GETs.
 */
function buildQuarantineKeys(
  prefix: "github" | "reddit",
  fingerprintOrAliases: string | string[],
): string[] {
  const fingerprints = Array.from(
    new Set(
      (Array.isArray(fingerprintOrAliases)
        ? fingerprintOrAliases
        : [fingerprintOrAliases]
      ).filter(Boolean),
    ),
  );
  return fingerprints.map((fingerprint) =>
    prefix === "github"
      ? keys.pool.github.quarantine(githubPoolNamespace(), fingerprint)
      : keys.pool.reddit.quarantine(fingerprint),
  );
}

function summarizeQuarantineRaws(
  raws: ReadonlyArray<string | null>,
): QuarantineState {
  let latestInactive: QuarantineState = { active: false, reason: null, until: null };
  for (const raw of raws) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { reason?: string; untilTimestamp?: number };
      const untilMs =
        typeof parsed.untilTimestamp === "number"
          ? parsed.untilTimestamp * 1000
          : null;
      const state: QuarantineState = {
        active: untilMs !== null && untilMs > Date.now(),
        reason: parsed.reason ?? null,
        until: untilMs ? new Date(untilMs).toISOString() : null,
      };
      if (state.active) return state;
      if (
        state.until &&
        (!latestInactive.until ||
          Date.parse(state.until) > Date.parse(latestInactive.until))
      ) {
        latestInactive = state;
      }
    } catch {
      return { active: true, reason: "unknown", until: null };
    }
  }
  return latestInactive;
}

async function readQuarantine(
  prefix: "github" | "reddit",
  fingerprintOrAliases: string | string[],
): Promise<QuarantineState> {
  const qkeys = buildQuarantineKeys(prefix, fingerprintOrAliases);
  if (qkeys.length === 0) return { active: false, reason: null, until: null };
  const raws = redis.mget
    ? await redis.mget(...qkeys)
    : await Promise.all(qkeys.map((key) => redis.get(key)));
  return summarizeQuarantineRaws(raws);
}

function githubLegacyFingerprint(token: string | null | undefined): string {
  const trimmed = token?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(-4) : "none";
}

function quarantineFromPublishedState(
  state: PublishedTokenState | null,
): QuarantineState {
  if (!state?.quarantinedUntilMs) {
    return { active: false, reason: null, until: null };
  }
  return {
    active: state.quarantinedUntilMs > Date.now(),
    reason: "published",
    until: new Date(state.quarantinedUntilMs).toISOString(),
  };
}

function configuredGithubKeys(): GithubKeyDescriptor[] {
  const states = getGitHubTokenPool().snapshot();
  const legacyCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const labelIndexes = new Map<string, number>();

  for (const state of states) {
    const legacy = githubLegacyFingerprint(state.token);
    legacyCounts.set(legacy, (legacyCounts.get(legacy) ?? 0) + 1);
    const label = redactToken(state.token);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return states.map((state): GithubKeyDescriptor => {
    const label = redactToken(state.token);
    const labelIndex = (labelIndexes.get(label) ?? 0) + 1;
    labelIndexes.set(label, labelIndex);
    const safeLabel =
      (labelCounts.get(label) ?? 0) > 1 ? `${label}#${labelIndex}` : label;
    const legacy = githubLegacyFingerprint(state.token);
    const usageFingerprints = [githubKeyFingerprint(state.token)];
    if ((legacyCounts.get(legacy) ?? 0) === 1) {
      usageFingerprints.push(legacy);
    }
    return {
      label: safeLabel,
      usageFingerprints,
      publishedState: {
        tokenLabel: label,
        remaining: state.remaining,
        resetUnixSec: state.resetUnixSec,
        lastObservedMs: state.lastObservedMs,
        quarantinedUntilMs: state.quarantinedUntilMs,
        lambdaId: "local",
        writtenAt: state.lastObservedMs
          ? new Date(state.lastObservedMs).toISOString()
          : "",
      },
    };
  });
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function poolHealth(rows: Array<{ status: PoolStatus; requests24h: number }>): PoolStatus {
  if (rows.length === 0) return "DEAD";
  const quarantinedOrDead = rows.filter((row) => row.status === "RED" || row.status === "DEAD").length;
  if (quarantinedOrDead >= Math.ceil(rows.length / 2)) return "RED";
  const usage = rows.map((row) => row.requests24h);
  const mean = usage.reduce((sum, value) => sum + value, 0) / usage.length;
  if (mean > 0 && stddev(usage) > mean * 0.7) return "YELLOW";
  if (rows.some((row) => row.status === "YELLOW")) return "YELLOW";
  return "GREEN";
}

async function githubState(buckets: string[]): Promise<AdminPoolStateResponse["github"]> {
  const poolKeys = configuredGithubKeys();

  // AGN-467: batch ALL usage hash keys + ALL quarantine keys for the
  // entire GitHub PAT pool, then dispatch in 2 round trips total
  // (1 pipelined HGETALL + 1 MGET) instead of N × 24 HGETALLs and
  // N GETs running per-row inside Promise.all.
  const usageKeysPerRow = poolKeys.map((key) =>
    buildUsageKeys("github", key.usageFingerprints, buckets),
  );
  const quarantineKeysPerRow = poolKeys.map((key) =>
    buildQuarantineKeys("github", key.usageFingerprints),
  );
  const flatUsageKeys = usageKeysPerRow.flat();
  const flatQuarantineKeys = quarantineKeysPerRow.flat();

  const [allUsageHashes, allQuarantineRaws] = await Promise.all([
    flatUsageKeys.length === 0
      ? Promise.resolve<Record<string, string>[]>([])
      : redis.hgetallMany
        ? redis.hgetallMany(flatUsageKeys)
        : Promise.all(flatUsageKeys.map((key) => redis.hgetall(key))),
    flatQuarantineKeys.length === 0
      ? Promise.resolve<(string | null)[]>([])
      : redis.mget
        ? redis.mget(...flatQuarantineKeys)
        : Promise.all(flatQuarantineKeys.map((key) => redis.get(key))),
  ]);

  // Slice the flat result back into per-row windows preserving order.
  let usageCursor = 0;
  let quarantineCursor = 0;
  const rows: GithubPoolRow[] = poolKeys.map((key, idx): GithubPoolRow => {
    const usageWindow = allUsageHashes.slice(
      usageCursor,
      usageCursor + usageKeysPerRow[idx]!.length,
    );
    usageCursor += usageKeysPerRow[idx]!.length;
    const quarantineWindow = allQuarantineRaws.slice(
      quarantineCursor,
      quarantineCursor + quarantineKeysPerRow[idx]!.length,
    );
    quarantineCursor += quarantineKeysPerRow[idx]!.length;

    const usage = summarizeUsageHashes(usageWindow);
    const telemetryQuarantine = summarizeQuarantineRaws(quarantineWindow);
    const publishedQuarantine = quarantineFromPublishedState(key.publishedState);
    const quarantine = telemetryQuarantine.active
      ? telemetryQuarantine
      : publishedQuarantine.active
        ? publishedQuarantine
        : telemetryQuarantine.until
          ? telemetryQuarantine
          : publishedQuarantine;
    const publishedLastObserved = key.publishedState?.lastObservedMs
      ? new Date(key.publishedState.lastObservedMs).toISOString()
      : null;
    const lastCallAt =
      usage.lastCallAt ??
      publishedLastObserved ??
      parseIso(key.publishedState?.writtenAt);
    const idle =
      !lastCallAt ||
      Date.now() - Date.parse(lastCallAt) > IDLE_KEY_MS;
    const status: PoolStatus = quarantine.active
      ? "RED"
      : idle
        ? "RED"
        : "GREEN";
    return {
      fingerprint: key.label,
      ...usage,
      lastCallAt,
      lastRateLimitRemaining:
        usage.lastRateLimitRemaining ?? key.publishedState?.remaining ?? null,
      lastRateLimitReset:
        usage.lastRateLimitReset ??
        (key.publishedState?.resetUnixSec
          ? new Date(key.publishedState.resetUnixSec * 1000).toISOString()
          : null),
      quarantine,
      idle,
      status,
    };
  });
  return {
    totalConfigured: poolKeys.length,
    health: poolHealth(rows),
    rows,
  };
}

async function redditState(buckets: string[]): Promise<AdminPoolStateResponse["reddit"]> {
  const agents = (Array.isArray(redditUserAgents) ? redditUserAgents : [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const fingerprints = agents.map((agent) => redditUserAgentFingerprint(agent));

  // AGN-467: batch ALL Reddit UA usage hashes (24 buckets × N agents) +
  // ALL quarantine keys + the "last hour" hashes for `rateLimitedLastHour`
  // into 2 round trips total (1 pipelined HGETALL + 1 MGET) instead of
  // N × (24+1) round trips. Same scaling shape as `githubState` above.
  const usageKeysPerRow = fingerprints.map((fp) =>
    buildUsageKeys("reddit", fp, buckets),
  );
  const minute30mBuckets = minuteBuckets(new Date(), 30);
  const usage30mKeysPerRow = fingerprints.map((fp) =>
    minute30mBuckets.map((bucket) => keys.pool.reddit.usage30m(fp, bucket)),
  );
  const flatUsageKeys = usageKeysPerRow.flat();
  const flatUsage30mKeys = usage30mKeysPerRow.flat();
  const flatQuarantineKeys = fingerprints.map((fp) =>
    buildQuarantineKeys("reddit", fp)[0]!,
  );

  const [allUsageHashes, allUsage30mHashes, allQuarantineRaws] = await Promise.all([
    flatUsageKeys.length === 0
      ? Promise.resolve<Record<string, string>[]>([])
      : redis.hgetallMany
        ? redis.hgetallMany(flatUsageKeys)
        : Promise.all(flatUsageKeys.map((key) => redis.hgetall(key))),
    flatUsage30mKeys.length === 0
      ? Promise.resolve<Record<string, string>[]>([])
      : redis.hgetallMany
        ? redis.hgetallMany(flatUsage30mKeys)
        : Promise.all(flatUsage30mKeys.map((key) => redis.hgetall(key))),
    flatQuarantineKeys.length === 0
      ? Promise.resolve<(string | null)[]>([])
      : redis.mget
        ? redis.mget(...flatQuarantineKeys)
        : Promise.all(flatQuarantineKeys.map((key) => redis.get(key))),
  ]);

  let usageCursor = 0;
  let usage30mCursor = 0;
  const rows: RedditPoolRow[] = agents.map((userAgent, idx): RedditPoolRow => {
    const fingerprint = fingerprints[idx]!;
    const usageWindow = allUsageHashes.slice(
      usageCursor,
      usageCursor + usageKeysPerRow[idx]!.length,
    );
    const usage30mWindow = allUsage30mHashes.slice(
      usage30mCursor,
      usage30mCursor + usage30mKeysPerRow[idx]!.length,
    );
    usageCursor += usageKeysPerRow[idx]!.length;
    usage30mCursor += usage30mKeysPerRow[idx]!.length;
    const usage = summarizeUsageHashes(usageWindow);
    const quarantine = summarizeQuarantineRaws([allQuarantineRaws[idx] ?? null]);
    const last429At =
      usage.last429At ?? (usage.lastStatusCode === 429 ? usage.lastCallAt : null);
    const usage30m = summarizeUsageHashes(usage30mWindow);
    const status: PoolStatus = quarantine.active
      ? "RED"
      : usage.rateLimited24h && usage.rateLimited24h > 0
        ? "YELLOW"
        : usage.fail24h > usage.success24h && usage.fail24h > 0
          ? "YELLOW"
          : "GREEN";
    return {
      fingerprint,
      userAgentLabel: userAgent.split(" ")[0] ?? fingerprint,
      ...usage,
      last429At,
      requests30m: usage30m.requests24h,
      fail30m: usage30m.fail24h,
      rateLimited30m: usage30m.rateLimited24h ?? 0,
      quarantine,
      status,
    };
  });

  // `rateLimitedLastHour` reuses the current-hour bucket already fetched
  // above (buckets[0] is now-hour by construction). No extra Redis call.
  const currentBucketIdx = 0;
  let rateLimitedLastHour = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const hash = allUsageHashes[currentBucketIdx * rows.length + i] ?? {};
    rateLimitedLastHour += parseNumber(hash.rateLimited) ?? 0;
  }
  const rateLimitedLast30Min = rows.reduce(
    (sum, row) => sum + row.rateLimited30m,
    0,
  );
  const requestsLast30Min = rows.reduce((sum, row) => sum + row.requests30m, 0);

  return {
    totalConfigured: agents.length,
    health: poolHealth(rows),
    rows,
    rateLimitedLastHour,
    rateLimitedLast30Min,
    requestsLast30Min,
  };
}

async function twitterState(buckets: string[]): Promise<AdminPoolStateResponse["twitter"]> {
  const sources = await Promise.all(
    (["apify", "nitter"] as const).map(async (source): Promise<TwitterSourceRow> => {
      const usage = await readUsage("twitter", source, buckets);
      return {
        source,
        ...usage,
        status: usage.fail24h > usage.success24h ? "YELLOW" : "GREEN",
      };
    }),
  );
  const degradationHashes = await Promise.all(
    buckets.map((bucket) =>
      redis.hgetall(keys.pool.twitter.degradation(bucket)),
    ),
  );
  const degradations = degradationHashes.reduce((sum, hash) => sum + (parseNumber(hash.count) ?? 0), 0);
  const totalTwitterCalls = sources.reduce((sum, row) => sum + row.requests24h, 0);
  const degradationRate24h = totalTwitterCalls > 0 ? degradations / totalTwitterCalls : 0;
  const apify = sources.find((row) => row.source === "apify")!;
  const apifyStatus: PoolStatus = apify.fail24h > apify.success24h ? "YELLOW" : "GREEN";
  return {
    apify: {
      lastSuccess: apify.success24h > 0 ? apify.lastCallAt : null,
      lastFailure: apify.fail24h > 0 ? apify.lastCallAt : null,
      estimatedQuotaState: "unknown",
      status: apifyStatus,
    },
    sources,
    nitterInstances: normalizeNitterInstances(),
    degradationRate24h,
  };
}

function normalizeNitterInstances(): NitterInstanceRow[] {
  const raw = (nitterConfig as { instances?: unknown[] }).instances;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): NitterInstanceRow[] => {
    if (!entry || typeof entry !== "object") return [];
    const obj = entry as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url : null;
    if (!url) return [];
    const status =
      obj.status === "healthy" || obj.status === "dead" ? obj.status : "unknown";
    return [{
      url,
      status,
      lastChecked: typeof obj.lastChecked === "string" ? parseIso(obj.lastChecked) : null,
      deadCount24h: Number.isFinite(Number(obj.deadCount24h))
        ? Math.max(0, Number(obj.deadCount24h))
        : 0,
      successRate24h: null,
    }];
  });
}

export function shouldFlagDeadNitterInstance(
  instance: NitterInstanceRow,
  nowMs = Date.now(),
): boolean {
  if (instance.status !== "dead") return false;
  if (instance.deadCount24h < NITTER_DEAD_COUNT_ALERT_MIN) return false;
  const checkedMs = instance.lastChecked ? Date.parse(instance.lastChecked) : NaN;
  return !Number.isFinite(checkedMs) || nowMs - checkedMs > DAY_MS;
}

async function readMeta(source: string): Promise<MetaFile | null> {
  try {
    const raw = await readFile(resolve(process.cwd(), "data", "_meta", `${source}.json`), "utf8");
    return JSON.parse(raw) as MetaFile;
  } catch {
    return null;
  }
}

async function readStoreLatest(slugs: string[]): Promise<string | null> {
  const store = getDataStore();
  const values = await Promise.all(slugs.map((slug) => store.writtenAt(slug)));
  return latestIso(values.map(parseIso));
}

const SINGLETON_SPECS: Array<{
  name: string;
  meta?: string;
  slugs: string[];
  budgetMs: number;
}> = [
  { name: "BLUESKY", meta: "bluesky", slugs: ["bluesky-trending", "bluesky-mentions"], budgetMs: 6 * HOUR_MS },
  { name: "DEVTO", meta: "devto", slugs: ["devto-trending", "devto-mentions"], budgetMs: 24 * HOUR_MS },
  { name: "PRODUCTHUNT", meta: "producthunt", slugs: ["producthunt-launches"], budgetMs: 12 * HOUR_MS },
  { name: "SMITHERY", slugs: ["mcp-smithery-rank"], budgetMs: 12 * HOUR_MS },
  { name: "LIBRARIES_IO", slugs: ["mcp-dependents"], budgetMs: 12 * HOUR_MS },
  { name: "TRUSTMRR", slugs: ["trustmrr-startups", "revenue-overlays"], budgetMs: 36 * HOUR_MS },
  { name: "AA", slugs: ["agent-commerce"], budgetMs: 36 * HOUR_MS },
  { name: "RESEND", slugs: ["weekly-digest"], budgetMs: 7 * DAY_MS },
  { name: "KIMI", slugs: ["consensus-verdicts", "llm-aggregate-heartbeat"], budgetMs: 36 * HOUR_MS },
  { name: "ANTHROPIC", meta: "claude-rss", slugs: ["claude-rss"], budgetMs: 30 * HOUR_MS },
  { name: "HF", meta: "huggingface", slugs: ["huggingface-trending", "huggingface-datasets", "huggingface-spaces"], budgetMs: 24 * HOUR_MS },
  { name: "FIRECRAWL", slugs: ["funding-news", "funding-news-crunchbase"], budgetMs: 24 * HOUR_MS },
];

async function singletonRows(): Promise<SingletonRow[]> {
  return Promise.all(
    SINGLETON_SPECS.map(async (spec): Promise<SingletonRow> => {
      const [meta, storeLatest] = await Promise.all([
        spec.meta ? readMeta(spec.meta) : Promise.resolve(null),
        readStoreLatest(spec.slugs),
      ]);
      const metaTs = parseIso(meta?.ts ?? meta?.writtenAt);
      const lastSuccess =
        meta && meta.reason && !["ok", "empty_results"].includes(meta.reason)
          ? storeLatest
          : latestIso([metaTs, storeLatest]);
      const lastFailure =
        meta && meta.reason && !["ok", "empty_results"].includes(meta.reason)
          ? metaTs
          : null;
      return {
        name: spec.name,
        lastSuccess,
        lastFailure,
        status: classifyByAge(lastSuccess, spec.budgetMs),
      };
    }),
  );
}

export function buildAnomalies(
  github: AdminPoolStateResponse["github"],
  reddit: AdminPoolStateResponse["reddit"],
  twitter: AdminPoolStateResponse["twitter"],
  headroom: RateLimitHeadroomRow[],
): PoolAnomaly[] {
  const anomalies: PoolAnomaly[] = [];
  for (const row of github.rows) {
    if (row.idle) {
      anomalies.push({
        severity: "RED",
        label: `GitHub key ${row.fingerprint} idle`,
        detail: `Unused for >12h while the pool has ${github.totalConfigured} configured key(s).`,
      });
    }
  }
  const githubMean = github.rows.reduce((sum, row) => sum + row.requests24h, 0) / Math.max(1, github.rows.length);
  if (githubMean > 0 && stddev(github.rows.map((row) => row.requests24h)) > githubMean * 0.7) {
    anomalies.push({
      severity: "YELLOW",
      label: "GitHub rotation imbalance",
      detail: "Request distribution across configured keys is uneven over the last 24h.",
    });
  }
  const redditMean = reddit.rows.reduce((sum, row) => sum + row.requests24h, 0) / Math.max(1, reddit.rows.length);
  if (redditMean > 0 && stddev(reddit.rows.map((row) => row.requests24h)) > redditMean * 0.7) {
    anomalies.push({
      severity: "YELLOW",
      label: "Reddit UA rotation imbalance",
      detail: "User-Agent request distribution is uneven over the last 24h.",
    });
  }
  if (reddit.rateLimitedLastHour > 5) {
    anomalies.push({
      severity: "RED",
      label: "Reddit 429 pressure",
      detail: `${reddit.rateLimitedLastHour} rate-limited request(s) in the current hour bucket.`,
    });
  }
  if (reddit.rateLimitedLast30Min > 0) {
    anomalies.push({
      severity: "YELLOW",
      label: "Reddit 30-minute pressure",
      detail: `${reddit.rateLimitedLast30Min} rate-limited request(s) across ${reddit.requestsLast30Min} request(s) in the last 30 minutes.`,
    });
  }
  const deadNitterCount = twitter.nitterInstances.filter(
    (instance) => instance.status === "dead",
  ).length;
  const nitterCount = twitter.nitterInstances.length;
  const quorumLostThreshold = Math.ceil(nitterCount / 2);
  if (nitterCount > 0 && deadNitterCount >= quorumLostThreshold) {
    anomalies.push({
      severity: "RED",
      label: "Nitter quorum lost",
      detail: `${deadNitterCount}/${nitterCount} Nitter instances are dead (threshold ${quorumLostThreshold}/${nitterCount}).`,
    });
  }
  for (const instance of twitter.nitterInstances) {
    if (shouldFlagDeadNitterInstance(instance)) {
      anomalies.push({
        severity: "YELLOW",
        label: "Dead Nitter instance",
        detail: `${instance.url} has been marked dead ${instance.deadCount24h} time(s) in 24h and is stale (>24h) or missing health timestamp.`,
      });
    }
  }
  if (twitter.degradationRate24h > 0.5) {
    anomalies.push({
      severity: "YELLOW",
      label: "Twitter degraded",
      detail: `${Math.round(twitter.degradationRate24h * 100)}% of Twitter calls fell through to fallback telemetry.`,
    });
  }
  for (const row of headroom) {
    if (row.status === "YELLOW" || row.status === "RED") {
      anomalies.push({
        severity: row.status === "RED" ? "RED" : "YELLOW",
        label: `${row.source} rate-limit headroom`,
        detail: row.detail,
      });
    }
  }
  return anomalies;
}

export function buildRateLimitHeadroom(
  github: AdminPoolStateResponse["github"],
  reddit: AdminPoolStateResponse["reddit"],
  twitter: AdminPoolStateResponse["twitter"],
): RateLimitHeadroomRow[] {
  const githubKnown = github.rows
    .map((row) => row.lastRateLimitRemaining)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const githubMax = githubKnown.length * 5_000;
  const githubRemaining = githubKnown.reduce((sum, v) => sum + Math.max(0, v), 0);
  const githubPct = githubMax > 0 ? githubRemaining / githubMax : null;
  const githubStatus: HeadroomStatus =
    githubPct === null
      ? "DEAD"
      : githubPct <= 0.1
        ? "RED"
        : githubPct <= 0.25
          ? "YELLOW"
          : "GREEN";

  const redditRequestsLastHour = reddit.rows.reduce(
    (sum, row) => sum + row.requests24h / 24,
    0,
  );
  const redditPressure =
    redditRequestsLastHour > 0
      ? reddit.rateLimitedLastHour / redditRequestsLastHour
      : reddit.rateLimitedLastHour > 0
        ? 1
        : 0;
  const redditPct = Math.max(0, 1 - Math.min(1, redditPressure));
  const redditStatus: HeadroomStatus =
    redditPct <= 0.1 ? "RED" : redditPct <= 0.25 ? "YELLOW" : "GREEN";

  const apify = twitter.sources.find((row) => row.source === "apify");
  const apifyRequests = apify?.requests24h ?? 0;
  const apifyFailRate =
    apifyRequests > 0 ? (apify?.fail24h ?? 0) / apifyRequests : 0;
  const apifyPressure = Math.max(apifyFailRate, twitter.degradationRate24h);
  const apifyPct = Math.max(0, 1 - Math.min(1, apifyPressure));
  const apifyStatus: HeadroomStatus =
    apifyPct <= 0.1 ? "RED" : apifyPct <= 0.25 ? "YELLOW" : "GREEN";

  return [
    {
      source: "github",
      status: githubStatus,
      headroomPct: githubPct,
      detail:
        githubPct === null
          ? "No observed x-ratelimit-remaining values yet."
          : `${Math.round(githubPct * 100)}% remaining based on latest per-key quota snapshots.`,
    },
    {
      source: "reddit",
      status: redditStatus,
      headroomPct: redditPct,
      detail: `${reddit.rateLimitedLast30Min} rate-limited events in the last 30 minutes (${reddit.requestsLast30Min} requests).`,
    },
    {
      source: "twitter-apify",
      status: apifyStatus,
      headroomPct: apifyPct,
      detail: `${Math.round(apifyPressure * 100)}% pressure from fail/degradation telemetry over 24h.`,
    },
  ];
}

async function readAdminPoolState(): Promise<AdminPoolStateResponse> {
  const buckets = hourBuckets(new Date());
  const [github, reddit, twitter, singletons] = await Promise.all([
    githubState(buckets),
    redditState(buckets),
    twitterState(buckets),
    singletonRows(),
  ]);
  const headroom = buildRateLimitHeadroom(github, reddit, twitter);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    anomalies: buildAnomalies(github, reddit, twitter, headroom),
    headroom,
    github,
    reddit,
    twitter,
    singletons,
  };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminPoolStateResponse | ErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  try {
    return NextResponse.json(await readAdminPoolState());
  } catch (err) {
    console.error("[pool-state] aggregation failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to aggregate pool state" },
      { status: 500 },
    );
  }
}
