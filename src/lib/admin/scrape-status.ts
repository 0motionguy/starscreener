// scrape-status — operator-facing summary of every collector's health.
//
// Purpose: power /admin/scrapes (the "run now" control panel) and
// /admin/health (the read-only dashboard) without coupling either page
// to the per-source health helpers in src/lib/source-health.ts. Those
// helpers carry product-side semantics (cold/degraded/stale tiers tuned
// for the public surfaces); the admin pages need a flatter, source-
// agnostic view derived directly from the meta sidecars + log files.
//
// All reads here are pure file-system reads — no Redis, no network,
// no mutations. Safe to run on every request.
//
// Sidecar shape (data/_meta/<source>.json) — duck-typed, since there's
// no shared zod schema yet:
//   { source, reason: "ok" | "<failure-reason>", ts: ISO, count, durationMs }
//
// Counts: where the data file exposes a top-level array (.posts,
// .stories, .items, .papers, .models, .launches), we report its length
// as a stable signal-count. Some files are wrapper objects with no
// obvious array — for those we fall back to `null` rather than guess.
// This avoids the "show 1 because the file exists" anti-pattern.

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

export const COLLECTORS = [
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
  "twitter",
  "arxiv",
  "huggingface",
  "npm",
] as const;

export type CollectorName = (typeof COLLECTORS)[number];

export type FreshnessTier =
  | "GREEN"
  | "YELLOW"
  | "RED"
  | "DEAD"
  | "UNKNOWN";

export interface ScrapeStatus {
  source: CollectorName;
  /** ISO timestamp from the meta sidecar's `ts`. null if no sidecar yet. */
  lastRunAt: string | null;
  lastRunStatus: "success" | "fail" | "never-run";
  /** Wall-clock duration of the most recent run in ms. */
  lastRunDurationMs: number | null;
  /** Length of the data file's primary array (or null for opaque shapes). */
  signalCount: number | null;
  /** Always null in v1 — we don't yet snapshot prior counts. Reserved. */
  signalCountDelta: number | null;
  /** Failure reason from the sidecar (`reason !== "ok"`) or first log line. */
  lastErrorReason: string | null;
  /** Freshness budget in ms for this source. */
  budgetMs: number | null;
  /** Now − lastRunAt. null when never-run. */
  ageMs: number | null;
  freshnessTier: FreshnessTier;
}

// Per-source freshness budgets (ms). Mirrors the cron cadence × 2 + a
// generous margin, matching the ranges in src/lib/source-health.ts. We
// intentionally keep these private to this module so the admin pages
// can evolve their thresholds without touching public surfaces.
const HOUR_MS = 60 * 60 * 1_000;
const BUDGET_MS: Record<CollectorName, number> = {
  reddit: 4 * HOUR_MS,
  hackernews: 4 * HOUR_MS,
  bluesky: 4 * HOUR_MS,
  devto: 26 * HOUR_MS,
  lobsters: 4 * HOUR_MS,
  producthunt: 16 * HOUR_MS,
  twitter: 6 * HOUR_MS,
  arxiv: 24 * HOUR_MS,
  huggingface: 12 * HOUR_MS,
  npm: 50 * HOUR_MS,
};

// Maps each collector to the data file that holds its primary signal
// payload. Used purely for signal-count derivation; missing files are
// treated as `signalCount = null`, not an error.
const DATA_FILE: Record<CollectorName, string> = {
  reddit: "data/reddit-all-posts.json",
  hackernews: "data/hackernews-trending.json",
  bluesky: "data/bluesky-trending.json",
  devto: "data/devto-trending.json",
  lobsters: "data/lobsters-trending.json",
  producthunt: "data/producthunt-launches.json",
  twitter: "data/twitter-trending.json",
  arxiv: "data/arxiv-recent.json",
  huggingface: "data/huggingface-trending.json",
  npm: "data/npm-packages.json",
};

// Field on the data file (when it's a wrapper object) that holds the
// primary array of items. When the file is itself an array we ignore
// this map.
const DATA_ARRAY_KEY: Record<CollectorName, string> = {
  reddit: "posts",
  hackernews: "stories",
  bluesky: "items",
  devto: "items",
  lobsters: "stories",
  producthunt: "launches",
  twitter: "items",
  arxiv: "papers",
  huggingface: "models",
  npm: "packages",
};

const META_DIR = path.join(process.cwd(), "data", "_meta");
const SCAN_RUN_DIR = path.join(process.cwd(), ".data", "admin-scan-runs");

interface RawMetaSidecar {
  source?: unknown;
  reason?: unknown;
  ts?: unknown;
  count?: unknown;
  durationMs?: unknown;
}

async function readMetaSidecar(source: CollectorName): Promise<RawMetaSidecar | null> {
  const file = path.join(META_DIR, `${source}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    return parsed as RawMetaSidecar;
  } catch {
    return null;
  }
}

async function readSignalCount(source: CollectorName): Promise<number | null> {
  const file = path.join(process.cwd(), DATA_FILE[source]);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed !== null && typeof parsed === "object") {
      const key = DATA_ARRAY_KEY[source];
      const arr = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(arr)) return arr.length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tail the most recent admin-scan-run log for this source and pull the
 * first non-empty line. Used as a best-effort fallback for "what did the
 * collector say last time it failed" when the sidecar's `reason` is too
 * terse. Returns null if the directory or matching log is absent.
 */
async function readLatestLogFirstLine(source: CollectorName): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(SCAN_RUN_DIR);
  } catch {
    return null;
  }
  const prefix = `${source}-`;
  const matching = entries.filter(
    (name) => name.startsWith(prefix) && name.endsWith(".log"),
  );
  if (matching.length === 0) return null;

  const stats = await Promise.all(
    matching.map(async (name) => {
      try {
        const full = path.join(SCAN_RUN_DIR, name);
        const stat = await fs.stat(full);
        return { full, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const valid = stats.filter(
    (s): s is { full: string; mtime: number } => s !== null,
  );
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.mtime - a.mtime);

  try {
    const raw = await fs.readFile(valid[0].full, "utf8");
    // Truncate to keep the dashboard payload bounded — operators only
    // need a hint, not the full stack trace.
    const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0);
    if (!firstLine) return null;
    return firstLine.length > 300 ? `${firstLine.slice(0, 297)}...` : firstLine;
  } catch {
    return null;
  }
}

function computeFreshnessTier(
  ageMs: number | null,
  budgetMs: number | null,
  status: "success" | "fail" | "never-run",
): FreshnessTier {
  if (status === "never-run" || ageMs === null || budgetMs === null) {
    return "UNKNOWN";
  }
  // 4× budget = effectively dead. Bigger margin than `stale` because
  // that's the operator-action threshold, not a soft warning.
  if (ageMs > budgetMs * 4) return "DEAD";
  if (ageMs > budgetMs) return "RED";
  if (ageMs > budgetMs * 0.5) return "YELLOW";
  return "GREEN";
}

async function buildStatus(source: CollectorName): Promise<ScrapeStatus> {
  const [meta, signalCount, latestLogLine] = await Promise.all([
    readMetaSidecar(source),
    readSignalCount(source),
    readLatestLogFirstLine(source),
  ]);

  let lastRunAt: string | null = null;
  let lastRunStatus: ScrapeStatus["lastRunStatus"] = "never-run";
  let lastRunDurationMs: number | null = null;
  let lastErrorReason: string | null = null;

  if (meta !== null) {
    if (typeof meta.ts === "string" && meta.ts.length > 0) {
      const parsed = Date.parse(meta.ts);
      if (Number.isFinite(parsed)) lastRunAt = meta.ts;
    }
    if (typeof meta.durationMs === "number" && Number.isFinite(meta.durationMs)) {
      lastRunDurationMs = meta.durationMs;
    }
    if (typeof meta.reason === "string") {
      if (meta.reason === "ok") {
        lastRunStatus = "success";
      } else {
        lastRunStatus = "fail";
        lastErrorReason = meta.reason;
      }
    } else if (lastRunAt) {
      // Sidecar has a timestamp but no reason — treat as success rather
      // than guess at failure. Operators see lastRunAt + signalCount and
      // can decide for themselves.
      lastRunStatus = "success";
    }
  }

  if (lastErrorReason === null && lastRunStatus === "fail" && latestLogLine) {
    lastErrorReason = latestLogLine;
  }

  const budgetMs = BUDGET_MS[source];
  const ageMs =
    lastRunAt !== null
      ? Math.max(0, Date.now() - Date.parse(lastRunAt))
      : null;
  const freshnessTier = computeFreshnessTier(ageMs, budgetMs, lastRunStatus);

  return {
    source,
    lastRunAt,
    lastRunStatus,
    lastRunDurationMs,
    signalCount,
    signalCountDelta: null,
    lastErrorReason,
    budgetMs,
    ageMs,
    freshnessTier,
  };
}

export async function getAllScrapeStatuses(): Promise<ScrapeStatus[]> {
  const statuses = await Promise.all(COLLECTORS.map(buildStatus));
  return statuses.sort((a, b) => a.source.localeCompare(b.source));
}

export async function getScrapeStatus(
  source: CollectorName,
): Promise<ScrapeStatus | null> {
  if (!(COLLECTORS as readonly string[]).includes(source)) return null;
  return buildStatus(source);
}
