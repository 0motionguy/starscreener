import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";
import { getGitHubTokenPool } from "@/lib/github-token-pool";
import { githubKeyFingerprint } from "@/lib/pool/github-telemetry";
import { redditUserAgentFingerprint } from "@/lib/pool/reddit-ua-pool";
import { redis } from "@/lib/redis";

import redditUserAgents from "@/../config/reddit-user-agents.json";
import nitterConfig from "@/../config/nitter-instances.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PoolStatus = "GREEN" | "YELLOW" | "RED" | "DEAD";

export interface UsageSummary {
  requests24h: number;
  success24h: number;
  fail24h: number;
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

export interface AdminPoolStateResponse {
  ok: true;
  generatedAt: string;
  anomalies: PoolAnomaly[];
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IDLE_KEY_MS = 12 * HOUR_MS;

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

async function readUsage(
  prefix: "github" | "reddit" | "twitter",
  fingerprint: string,
  buckets: string[],
): Promise<UsageSummary & { lastRateLimitRemaining: number | null; lastRateLimitReset: string | null }> {
  const hashes = await Promise.all(
    buckets.map((bucket) => redis.hgetall(`pool:${prefix}:usage:${fingerprint}:${bucket}`)),
  );
  let requests24h = 0;
  let success24h = 0;
  let fail24h = 0;
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
  }

  return {
    requests24h,
    success24h,
    fail24h,
    lastCallAt,
    lastOperation,
    lastStatusCode,
    lastResponseMs,
    lastRateLimitRemaining,
    lastRateLimitReset,
  };
}

async function readQuarantine(
  prefix: "github" | "reddit",
  fingerprint: string,
): Promise<QuarantineState> {
  const raw = await redis.get(`pool:${prefix}:quarantine:${fingerprint}`);
  if (!raw) return { active: false, reason: null, until: null };
  try {
    const parsed = JSON.parse(raw) as { reason?: string; untilTimestamp?: number };
    const untilMs =
      typeof parsed.untilTimestamp === "number"
        ? parsed.untilTimestamp * 1000
        : null;
    return {
      active: untilMs !== null && untilMs > Date.now(),
      reason: parsed.reason ?? null,
      until: untilMs ? new Date(untilMs).toISOString() : null,
    };
  } catch {
    return { active: true, reason: "unknown", until: null };
  }
}

function configuredGithubFingerprints(): string[] {
  return Array.from(
    new Set(
      getGitHubTokenPool()
        .snapshot()
        .map((state) => githubKeyFingerprint(state.token)),
    ),
  );
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
  const fingerprints = configuredGithubFingerprints();
  const rows = await Promise.all(
    fingerprints.map(async (fingerprint): Promise<GithubPoolRow> => {
      const usage = await readUsage("github", fingerprint, buckets);
      const quarantine = await readQuarantine("github", fingerprint);
      const idle =
        !usage.lastCallAt ||
        Date.now() - Date.parse(usage.lastCallAt) > IDLE_KEY_MS;
      const status: PoolStatus = quarantine.active
        ? "RED"
        : idle
          ? "YELLOW"
          : "GREEN";
      return {
        fingerprint,
        ...usage,
        quarantine,
        idle,
        status,
      };
    }),
  );
  return {
    totalConfigured: fingerprints.length,
    health: poolHealth(rows),
    rows,
  };
}

async function redditState(buckets: string[]): Promise<AdminPoolStateResponse["reddit"]> {
  const agents = (Array.isArray(redditUserAgents) ? redditUserAgents : [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const rows = await Promise.all(
    agents.map(async (userAgent): Promise<RedditPoolRow> => {
      const fingerprint = redditUserAgentFingerprint(userAgent);
      const usage = await readUsage("reddit", fingerprint, buckets);
      const quarantine = await readQuarantine("reddit", fingerprint);
      const last429At = usage.lastStatusCode === 429 ? usage.lastCallAt : null;
      const status: PoolStatus = quarantine.active
        ? "RED"
        : last429At
          ? "YELLOW"
          : "GREEN";
      return {
        fingerprint,
        userAgentLabel: userAgent.split(" ")[0] ?? fingerprint,
        ...usage,
        last429At,
        quarantine,
        status,
      };
    }),
  );
  const currentBucket = buckets[0];
  const lastHourHashes = await Promise.all(
    rows.map((row) => redis.hgetall(`pool:reddit:usage:${row.fingerprint}:${currentBucket}`)),
  );
  const rateLimitedLastHour = lastHourHashes.reduce((sum, hash) => {
    return sum + (parseNumber(hash.lastStatusCode) === 429 ? (parseNumber(hash.requests) ?? 1) : 0);
  }, 0);
  return {
    totalConfigured: agents.length,
    health: poolHealth(rows),
    rows,
    rateLimitedLastHour,
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
    buckets.map((bucket) => redis.hgetall(`pool:twitter:degradation:${bucket}`)),
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
      successRate24h: null,
    }];
  });
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

function buildAnomalies(
  github: AdminPoolStateResponse["github"],
  reddit: AdminPoolStateResponse["reddit"],
  twitter: AdminPoolStateResponse["twitter"],
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
  for (const instance of twitter.nitterInstances) {
    const checkedMs = instance.lastChecked ? Date.parse(instance.lastChecked) : NaN;
    if (
      instance.status === "dead" &&
      (!Number.isFinite(checkedMs) || Date.now() - checkedMs > DAY_MS)
    ) {
      anomalies.push({
        severity: "YELLOW",
        label: "Dead Nitter instance",
        detail: `${instance.url} has been marked dead for >24h or has no health timestamp.`,
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
  return anomalies;
}

async function readAdminPoolState(): Promise<AdminPoolStateResponse> {
  const buckets = hourBuckets(new Date());
  const [github, reddit, twitter, singletons] = await Promise.all([
    githubState(buckets),
    redditState(buckets),
    twitterState(buckets),
    singletonRows(),
  ]);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    anomalies: buildAnomalies(github, reddit, twitter),
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

  return NextResponse.json(await readAdminPoolState());
}
