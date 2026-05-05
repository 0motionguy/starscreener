import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { GET as getFreshnessState, type FreshnessStateResponse } from "@/app/api/cron/freshness/state/route";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";
import { OpsAlertFatalError } from "@/lib/errors";
import { keys } from "@/lib/redis/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_INTERVAL_MS = 30 * 60 * 1000;
const STALE_CUTOFF_MS = CRON_INTERVAL_MS * 4;
const ATTEMPT_THROTTLE_MS = 10 * 60 * 1000;
const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const LAST_TTL_SECONDS = 24 * 60 * 60;
const STREAK_ALERT_THRESHOLD = 3;
const LOG_DIR = path.join(process.cwd(), ".data", "auto-recover-runs");

const SOURCE_SCRIPTS: Record<string, string> = {
  "trending-repos": "scripts/scrape-trending.mjs",
  hackernews: "scripts/scrape-hackernews.mjs",
  reddit: "scripts/scrape-reddit.mjs",
  bluesky: "scripts/scrape-bluesky.mjs",
  devto: "scripts/scrape-devto.mjs",
  lobsters: "scripts/scrape-lobsters.mjs",
  producthunt: "scripts/scrape-producthunt.mjs",
  npm: "scripts/scrape-npm.mjs",
  arxiv: "scripts/scrape-arxiv.mjs",
  huggingface: "scripts/scrape-huggingface.mjs",
  "huggingface-datasets": "scripts/scrape-huggingface-datasets.mjs",
  "huggingface-spaces": "scripts/scrape-huggingface-spaces.mjs",
  "funding-news": "scripts/scrape-funding-news.mjs",
};

type RecoveryResult = {
  source: string;
  status: "triggered" | "skipped" | "failed";
  reason: string;
  pid: number | null;
  script: string | null;
  ageMs: number | null;
  freshnessStatus: string;
  attemptAt: string;
};

type RecoveryRecord = RecoveryResult & {
  failureStreak: number;
};

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function fetchFreshnessState(secret: string): Promise<FreshnessStateResponse> {
  const req = new NextRequest("http://localhost/api/cron/freshness/state", {
    headers: { authorization: `Bearer ${secret}` },
  });
  const res = await getFreshnessState(req);
  const body = (await res.json()) as FreshnessStateResponse | { ok?: false; error?: string; reason?: string };
  if (!("sources" in body) || !Array.isArray(body.sources)) {
    throw new OpsAlertFatalError("sources-auto-recover: freshness state unavailable", {
      route: "/api/cron/sources-auto-recover",
      status: res.status,
    });
  }
  return body;
}

async function runRecovery(source: string, scriptRel: string): Promise<{ ok: boolean; pid: number | null; reason: string }> {
  const scriptAbs = path.join(process.cwd(), scriptRel);
  await fs.access(scriptAbs);
  await fs.mkdir(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(LOG_DIR, `${source}-${stamp}.log`);
  const logFd = await fs.open(logPath, "a");
  try {
    const child = spawn(process.execPath, [scriptAbs], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd.fd, logFd.fd],
    });
    child.unref();
    await logFd.close();
    return { ok: true, pid: child.pid ?? null, reason: "spawned" };
  } catch (error) {
    await logFd.close().catch(() => void 0);
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, pid: null, reason: `spawn_failed:${msg}` };
  }
}

async function writeRecoveryRecord(record: RecoveryRecord): Promise<void> {
  const redis = getDataStore().redisClient();
  if (!redis) return;

  const serialized = JSON.stringify(record);
  const eventKey = keys.recovery.event(record.source, record.attemptAt);
  const lastKey = keys.recovery.last(record.source);
  const attemptKey = keys.recovery.lastAttempt(record.source);
  const streakKey = keys.recovery.streak(record.source);

  let streak = 0;
  const previousRaw = await redis.get(streakKey).catch(() => null);
  const previous = Number.parseInt(toStringOrNull(previousRaw) ?? "0", 10);
  const previousSafe = Number.isFinite(previous) && previous > 0 ? previous : 0;
  streak = record.status === "failed" ? previousSafe + 1 : 0;
  record.failureStreak = streak;

  const withStreak = JSON.stringify(record);
  await Promise.all([
    redis.set(eventKey, withStreak, { ex: EVENT_TTL_SECONDS }),
    redis.set(lastKey, withStreak, { ex: EVENT_TTL_SECONDS }),
    redis.set(attemptKey, record.attemptAt, { ex: LAST_TTL_SECONDS }),
    redis.set(streakKey, String(streak), { ex: EVENT_TTL_SECONDS }),
  ]);

  if (streak >= STREAK_ALERT_THRESHOLD) {
    const err = new OpsAlertFatalError("sources auto-recover repeated failures", {
      source: record.source,
      failureStreak: streak,
      lastReason: record.reason,
      route: "/api/cron/sources-auto-recover",
    });
    Sentry.captureException(err);
  }
}

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ ok: false, reason: "CRON_SECRET not configured" }, { status: 503 });
  }

  const freshness = await fetchFreshnessState(cronSecret);
  const now = Date.now();
  const redis = getDataStore().redisClient();
  const results: RecoveryResult[] = [];

  const candidates = freshness.sources.filter((source) => {
    if (source.ageMs === null) return true;
    return source.ageMs > STALE_CUTOFF_MS && (source.status === "RED" || source.status === "DEAD");
  });

  for (const source of candidates) {
    const attemptAt = new Date().toISOString();
    const script = SOURCE_SCRIPTS[source.name] ?? null;
    if (!script) {
      const result: RecoveryResult = {
        source: source.name,
        status: "skipped",
        reason: "no_recovery_script",
        pid: null,
        script: null,
        ageMs: source.ageMs,
        freshnessStatus: source.status,
        attemptAt,
      };
      await writeRecoveryRecord({ ...result, failureStreak: 0 });
      results.push(result);
      continue;
    }

    const lastAttemptKey = keys.recovery.lastAttempt(source.name);
    const lastAttemptRaw = redis ? await redis.get(lastAttemptKey).catch(() => null) : null;
    const lastAttemptMs = parseDate(toStringOrNull(lastAttemptRaw));
    if (lastAttemptMs !== null && now - lastAttemptMs < ATTEMPT_THROTTLE_MS) {
      const result: RecoveryResult = {
        source: source.name,
        status: "skipped",
        reason: "throttled_lt_10m",
        pid: null,
        script,
        ageMs: source.ageMs,
        freshnessStatus: source.status,
        attemptAt,
      };
      await writeRecoveryRecord({ ...result, failureStreak: 0 });
      results.push(result);
      continue;
    }

    const spawned = await runRecovery(source.name, script);
    const result: RecoveryResult = {
      source: source.name,
      status: spawned.ok ? "triggered" : "failed",
      reason: spawned.reason,
      pid: spawned.pid,
      script,
      ageMs: source.ageMs,
      freshnessStatus: source.status,
      attemptAt,
    };
    await writeRecoveryRecord({ ...result, failureStreak: 0 });
    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    checkedAt: freshness.checkedAt,
    scannedSources: freshness.sources.length,
    candidates: candidates.length,
    triggered: results.filter((item) => item.status === "triggered").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
