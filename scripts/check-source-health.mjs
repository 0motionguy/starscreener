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
//   - ts older than the source's staleness threshold
//
// Sources without an explicit budget use DEFAULT_STALENESS_HOURS.
// Untracked sources (no _meta sidecar yet) are intentionally skipped, not
// flagged. Adding meta wiring to a new source automatically opts it into
// the watch.

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { budgetHoursForSource } from "./_freshness-budgets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const META_DIR = resolve(__dirname, "..", "data", "_meta");
const DEFAULT_STALENESS_HOURS = 24;

function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV ?? "production",
    release: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    initialScope: {
      tags: {
        source: "health-watch",
        runtime: "github-actions",
      },
    },
  });
  return true;
}

function fmtAge(hours) {
  if (!Number.isFinite(hours)) return "?";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

async function main() {
  const sentryReady = initSentry();
  let entries;
  try {
    entries = await readdir(META_DIR);
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.error(`[health-watch] ${META_DIR} does not exist - no sources to check`);
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
    const ageHours = Number.isFinite(ts) ? (Date.now() - ts) / 3_600_000 : NaN;
    const threshold = budgetHoursForSource(source, DEFAULT_STALENESS_HOURS);

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
        reason: `STALE - last write ${fmtAge(ageHours)} ago (threshold ${threshold}h)`,
      });
      continue;
    }

    reports.push({ source, ok: true, ageHours, threshold });
  }

  reports.sort((a, b) => Number(a.ok) - Number(b.ok) || a.source.localeCompare(b.source));
  console.log(`# Source health - ${new Date().toISOString()}`);
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
    if (sentryReady) {
      const repoProfilesFailure = fails.find((r) => r.source === "repo-profiles");
      Sentry.captureMessage(
        `[health-watch] ${fails.length} unhealthy source(s); repo-profiles stale alert=${repoProfilesFailure ? "yes" : "no"}`,
        {
          level: "error",
          tags: {
            alert: repoProfilesFailure
              ? "repo-profiles-freshness-over-6h"
              : "source-freshness-regression",
            source: repoProfilesFailure ? "repo-profiles" : "health-watch",
          },
          extra: {
            checkedAt: new Date().toISOString(),
            failCount: fails.length,
            fails: fails.map((f) => ({
              source: f.source,
              reason: f.reason ?? "",
              ageHours: Number.isFinite(f.ageHours) ? Number(f.ageHours.toFixed(2)) : null,
              thresholdHours: f.threshold ?? null,
            })),
          },
        },
      );
      await Sentry.flush(2_000);
    }
    console.error(`\n[health-watch] ${fails.length} source(s) unhealthy of ${reports.length} checked. Failing workflow.`);
    process.exit(1);
  }
  console.log(`[health-watch] all ${reports.length} sources healthy.`);
}

main().catch((err) => {
  console.error("[health-watch] fatal:", err?.stack ?? err);
  process.exit(2);
});
