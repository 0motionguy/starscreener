#!/usr/bin/env node
// Source health watcher.
//
// Reads every data/_meta/<source>.json sidecar (written by scrape scripts via
// scripts/_data-meta.mjs) and exits non-zero if any source is in a bad state.
// Driven from .github/workflows/health-watch.yml on a 30-min cadence so
// GitHub Actions surfaces the failure (and emails workflow owners) when a
// scraper goes silently down.
//
// Bad states:
//   - reason !== "ok" (network_error / partial / unknown)
//   - ts older than the source's STALENESS_HOURS threshold
//
// Sources without an entry in STALENESS_HOURS use DEFAULT_STALENESS_HOURS.
// Tune by editing the table below — no other code change needed.
//
// Untracked sources (no _meta sidecar yet) are intentionally skipped, not
// flagged. Adding meta wiring to a new source automatically opts it into
// the watch.

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const META_DIR = resolve(__dirname, "..", "data", "_meta");

// Per-source freshness budgets. Pick generous thresholds (~6-10× the source's
// own cron cadence) so transient cron skips don't fire spurious alerts —
// the goal is "this source has stopped reporting", not "this source is
// briefly behind".
const STALENESS_HOURS = {
  // Sub-hourly / hourly cadence sources
  bluesky: 8,
  lobsters: 8,
  // Worker-driven (~12h effective on the Railway side)
  reddit: 12,
  hackernews: 12,
  // 3h-cadence cron sources
  arxiv: 12,
  huggingface: 12,
  "huggingface-datasets": 12,
  "huggingface-spaces": 12,
  "funding-news": 12,
  trending: 12,
  // Multiple-times-per-day cron
  producthunt: 16,
  // Daily-cadence sources
  devto: 30,
  npm: 30,
  "npm-daily": 30,
  "claude-rss": 30,
  "openai-rss": 30,
  "awesome-skills": 30,
};
const DEFAULT_STALENESS_HOURS = 24;

function fmtAge(hours) {
  if (!Number.isFinite(hours)) return "?";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

async function main() {
  let entries;
  try {
    entries = await readdir(META_DIR);
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.error(
        `[health-watch] ${META_DIR} does not exist — no sources to check`,
      );
      process.exit(0);
    }
    throw err;
  }

  const reports = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const source = file.replace(/\.json$/, "");
    const path = resolve(META_DIR, file);

    let meta;
    try {
      const raw = await readFile(path, "utf8");
      meta = JSON.parse(raw);
    } catch (err) {
      reports.push({
        source,
        ok: false,
        ageHours: NaN,
        reason: `unreadable meta file: ${err.message ?? err}`,
      });
      continue;
    }

    const ts = typeof meta.ts === "string" ? Date.parse(meta.ts) : NaN;
    const ageHours = Number.isFinite(ts)
      ? (Date.now() - ts) / 3_600_000
      : NaN;
    const threshold = STALENESS_HOURS[source] ?? DEFAULT_STALENESS_HOURS;

    if (meta.reason !== "ok") {
      reports.push({
        source,
        ok: false,
        ageHours,
        threshold,
        reason: `${meta.reason}${meta.error ? `: ${meta.error}` : ""}`,
      });
      continue;
    }

    if (!Number.isFinite(ageHours)) {
      reports.push({
        source,
        ok: false,
        ageHours,
        threshold,
        reason: `meta missing valid ts (got ${JSON.stringify(meta.ts)})`,
      });
      continue;
    }

    if (ageHours > threshold) {
      reports.push({
        source,
        ok: false,
        ageHours,
        threshold,
        reason: `STALE — last write ${fmtAge(ageHours)} ago (threshold ${threshold}h)`,
      });
      continue;
    }

    reports.push({ source, ok: true, ageHours, threshold });
  }

  // Print a markdown summary so GitHub Actions log shows a readable table.
  reports.sort((a, b) => Number(a.ok) - Number(b.ok) || a.source.localeCompare(b.source));
  console.log(`# Source health — ${new Date().toISOString()}`);
  console.log();
  console.log(`| source | status | age | threshold | reason |`);
  console.log(`|---|---|---|---|---|`);
  for (const r of reports) {
    const status = r.ok ? "OK" : "FAIL";
    const age = fmtAge(r.ageHours);
    const thr = r.threshold ? `${r.threshold}h` : "-";
    const reason = r.reason ?? "";
    console.log(`| ${r.source} | ${status} | ${age} | ${thr} | ${reason} |`);
  }
  console.log();

  const fails = reports.filter((r) => !r.ok);
  if (fails.length > 0) {
    console.error(
      `\n[health-watch] ${fails.length} source(s) unhealthy of ${reports.length} checked. Failing workflow.`,
    );
    process.exit(1);
  }
  console.log(
    `[health-watch] all ${reports.length} sources healthy.`,
  );
}

main().catch((err) => {
  console.error("[health-watch] fatal:", err?.stack ?? err);
  process.exit(2);
});
