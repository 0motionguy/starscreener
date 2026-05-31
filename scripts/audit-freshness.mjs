#!/usr/bin/env node
// audit-freshness.mjs — fail-loud freshness gate (audit I2).
//
// Background: scripts/collect-twitter-signals.ts depends on Apify actor
// `apidojo~tweet-scraper`. Cookie-based providers are dead post-2026, so the
// Apify actor is the SINGLE point of failure for the Twitter axis. There was
// no alarm if the actor broke — this script is the alarm.
//
// What it does: scans data/_meta/<source>.json, parses the timestamp
// (`ts` per writeSourceMeta(); falls back to `writtenAt` for forward-compat),
// classifies each source against a per-source freshness budget, and exits
// non-zero if ANY source is stale OR an EXPECTED source is missing entirely.
//
// Generic by design: sibling sources (hackernews, reddit, etc.) are checked
// the same way. Add a new source by either dropping a meta file under
// data/_meta/ or extending DEFAULT_BUDGETS_MS below. Per-source override:
// include a `freshnessBudgetMs` field inside the meta file.

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const META_DIR = resolve(process.cwd(), "data/_meta");

// Per-source budgets, in milliseconds. Default chosen relative to the
// source's collector cadence — typically 2x cadence so a single missed
// run is a warning but two missed runs is a failure.
const HOUR = 60 * 60 * 1000;
const DEFAULT_BUDGETS_MS = {
  // Twitter/Apify is the audit-I2 motivating case. Cron is hourly; 12h
  // means the actor has been broken for half a day with no fallback.
  twitter: 12 * HOUR,
  hackernews: 6 * HOUR,
  reddit: 6 * HOUR,
  bluesky: 6 * HOUR,
  devto: 24 * HOUR,
  producthunt: 12 * HOUR,
  arxiv: 24 * HOUR,
  huggingface: 24 * HOUR,
  "huggingface-datasets": 24 * HOUR,
  "huggingface-spaces": 24 * HOUR,
  npm: 24 * HOUR,
  lobsters: 12 * HOUR,
  trending: 6 * HOUR,
  "funding-news": 24 * HOUR,
};

// Sources we REQUIRE a meta file for. Missing-but-required = failure
// (this is the actual Twitter-Apify alarm hook: when the collector
// stops writing, the meta file ages then disappears on a fresh deploy).
const REQUIRED_SOURCES = new Set([
  "hackernews",
  "reddit",
  "trending",
]);

// Default budget for any source not in DEFAULT_BUDGETS_MS. Generous so
// adding a new collector doesn't immediately fail the gate before its
// cadence stabilizes.
const FALLBACK_BUDGET_MS = 24 * HOUR;

function formatAge(ms) {
  if (ms < 0) return "future?";
  if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
  if (ms < HOUR) return `${Math.round(ms / 60000)}m`;
  if (ms < 24 * HOUR) return `${(ms / HOUR).toFixed(1)}h`;
  return `${(ms / (24 * HOUR)).toFixed(1)}d`;
}

function budgetForSource(source, meta) {
  if (meta && typeof meta.freshnessBudgetMs === "number" && meta.freshnessBudgetMs > 0) {
    return { ms: meta.freshnessBudgetMs, origin: "override" };
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_BUDGETS_MS, source)) {
    return { ms: DEFAULT_BUDGETS_MS[source], origin: "default" };
  }
  return { ms: FALLBACK_BUDGET_MS, origin: "fallback" };
}

async function loadMeta(file) {
  const path = resolve(META_DIR, file);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { __error: err?.message ?? String(err) };
  }
}

function tsFromMeta(meta) {
  // writeSourceMeta() emits `ts`; the audit-I2 spec used `writtenAt`.
  // Accept either so the gate keeps working if the writer is renamed.
  const candidate = meta?.ts ?? meta?.writtenAt;
  if (typeof candidate !== "string") return null;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  let entries;
  try {
    entries = await readdir(META_DIR);
  } catch (err) {
    console.error(`audit-freshness: data/_meta directory not found at ${META_DIR}: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }

  const metaFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const seen = new Set();
  const violations = [];
  const now = Date.now();

  console.log("audit-freshness — STARSCREENER source freshness gate");
  console.log("=====================================================");
  console.log(`now=${new Date(now).toISOString()}  meta_dir=${META_DIR}`);
  console.log("");
  console.log(`${pad("source", 24)}  ${pad("status", 6)}  ${pad("age", 8)}  ${pad("budget", 8)}  budget_origin`);
  console.log(`${"-".repeat(24)}  ${"-".repeat(6)}  ${"-".repeat(8)}  ${"-".repeat(8)}  -------------`);

  for (const file of metaFiles) {
    const source = file.replace(/\.json$/, "");
    seen.add(source);
    const meta = await loadMeta(file);
    if (meta?.__error) {
      console.log(`${pad(source, 24)}  ${pad("ERROR", 6)}  -         -         parse: ${meta.__error}`);
      violations.push({ source, kind: "parse_error", detail: meta.__error });
      continue;
    }
    const ts = tsFromMeta(meta);
    if (ts === null) {
      console.log(`${pad(source, 24)}  ${pad("ERROR", 6)}  -         -         missing ts/writtenAt`);
      violations.push({ source, kind: "missing_ts" });
      continue;
    }
    const ageMs = now - ts;
    const { ms: budgetMs, origin } = budgetForSource(source, meta);
    const stale = ageMs > budgetMs;
    const status = stale ? "STALE" : "OK";
    console.log(
      `${pad(source, 24)}  ${pad(status, 6)}  ${pad(formatAge(ageMs), 8)}  ${pad(formatAge(budgetMs), 8)}  ${origin}`,
    );
    if (stale) {
      violations.push({ source, kind: "stale", ageMs, budgetMs });
    }
  }

  // Required sources whose meta file is entirely absent.
  for (const req of REQUIRED_SOURCES) {
    if (!seen.has(req)) {
      console.log(`${pad(req, 24)}  ${pad("MISS", 6)}  -         -         no data/_meta/${req}.json`);
      violations.push({ source: req, kind: "missing_required" });
    }
  }

  console.log("");
  if (violations.length === 0) {
    console.log(`PASS — ${metaFiles.length} sources fresh.`);
    return;
  }

  console.log(`FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    if (v.kind === "stale") {
      console.log(
        `  - ${v.source}: STALE — age=${formatAge(v.ageMs)} budget=${formatAge(v.budgetMs)}`,
      );
    } else if (v.kind === "missing_required") {
      console.log(`  - ${v.source}: MISSING — required meta file not present`);
    } else if (v.kind === "missing_ts") {
      console.log(`  - ${v.source}: MISSING ts — meta file exists but has no ts/writtenAt field`);
    } else if (v.kind === "parse_error") {
      console.log(`  - ${v.source}: PARSE ERROR — ${v.detail}`);
    } else {
      console.log(`  - ${v.source}: ${v.kind}`);
    }
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`audit-freshness: unexpected failure — ${err?.stack ?? err}`);
  process.exitCode = 1;
});
