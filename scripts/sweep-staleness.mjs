#!/usr/bin/env node
// Staleness sweeper.
//
// Reads the per-source data files in `data/` and reports which records are
// past `cadence × 2` based on their `lastRefreshedAt` field (stamped by
// scripts/_data-store-write.mjs). The output lives at
// data/staleness-report.json and is rendered by /admin/staleness.
//
// Why a separate sweeper rather than computing staleness on demand at
// /admin/staleness:
//   - The admin route should stay fast and serverless-friendly.
//   - A daily run gives ops a single artifact to diff over time.
//   - The report is git-committed, so we can trace staleness regressions
//     back to a specific day in `git log`.
//
// Cadence: 02:00 UTC daily via .github/workflows/sweep-staleness.yml.
//
// CONSTANT MIRROR — keep these in sync with src/lib/source-health.ts:10-13.
// We can't import .ts from a .mjs script (node-without-tsx), and adding a
// transpile step here is heavier than maintaining one block of constants.
// If you change a threshold there, change it here too.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(REPO_ROOT, "data");
const OUT_PATH = resolve(DATA_DIR, "staleness-report.json");

// MIRROR of src/lib/source-health.ts:10-13. Multiply by 2 to get the
// `cadence × 2` threshold the sweeper reports against.
const FAST_DATA_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const PRODUCTHUNT_STALE_THRESHOLD_MS = 16 * 60 * 60 * 1000;
const DEVTO_STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;
const NPM_STALE_THRESHOLD_MS = 50 * 60 * 60 * 1000;

// Slug → { stale-after threshold, file path, pluck function }. The pluck
// returns the array of records to scan from a parsed JSON payload. Sources
// without a clean tracked-repo array (e.g. trending which uses nested
// language buckets) flatten themselves.
const SOURCES = [
  {
    slug: "trending",
    threshold: FAST_DATA_STALE_THRESHOLD_MS, // OSS Insight cron at ~3h, but classified as fast-stale
    file: "trending.json",
    pluck: (payload) => {
      const out = [];
      const buckets = payload?.buckets ?? {};
      for (const langMap of Object.values(buckets)) {
        if (!langMap || typeof langMap !== "object") continue;
        for (const rows of Object.values(langMap)) {
          if (Array.isArray(rows)) {
            for (const row of rows) out.push(row);
          }
        }
      }
      return out;
    },
    idOf: (r) => r.repo_name ?? r.repo_id ?? "<unknown>",
  },
  {
    slug: "repo-profiles",
    threshold: FAST_DATA_STALE_THRESHOLD_MS,
    file: "repo-profiles.json",
    pluck: (payload) => (Array.isArray(payload?.profiles) ? payload.profiles : []),
    idOf: (r) => r.fullName ?? "<unknown>",
  },
  {
    slug: "huggingface-trending",
    threshold: FAST_DATA_STALE_THRESHOLD_MS,
    file: "huggingface-trending.json",
    pluck: (payload) => (Array.isArray(payload?.models) ? payload.models : []),
    idOf: (r) => r.id ?? "<unknown>",
  },
  {
    slug: "huggingface-datasets",
    threshold: FAST_DATA_STALE_THRESHOLD_MS,
    file: "huggingface-datasets.json",
    pluck: (payload) => (Array.isArray(payload?.datasets) ? payload.datasets : []),
    idOf: (r) => r.id ?? "<unknown>",
  },
  {
    slug: "huggingface-spaces",
    threshold: FAST_DATA_STALE_THRESHOLD_MS,
    file: "huggingface-spaces.json",
    pluck: (payload) => (Array.isArray(payload?.spaces) ? payload.spaces : []),
    idOf: (r) => r.id ?? "<unknown>",
  },
  {
    slug: "npm-packages",
    threshold: NPM_STALE_THRESHOLD_MS,
    file: "npm-packages.json",
    pluck: (payload) => (Array.isArray(payload?.packages) ? payload.packages : []),
    idOf: (r) => r.name ?? r.fullName ?? "<unknown>",
  },
  {
    slug: "producthunt-launches",
    threshold: PRODUCTHUNT_STALE_THRESHOLD_MS,
    file: "producthunt-launches.json",
    pluck: (payload) => (Array.isArray(payload?.launches) ? payload.launches : []),
    idOf: (r) => r.id ?? r.name ?? "<unknown>",
  },
  {
    slug: "devto-trending",
    threshold: DEVTO_STALE_THRESHOLD_MS,
    file: "devto-trending.json",
    pluck: (payload) => (Array.isArray(payload?.articles) ? payload.articles : []),
    idOf: (r) => r.id ?? r.path ?? "<unknown>",
  },
];

function log(msg) {
  console.log(`[sweep-staleness] ${msg}`);
}

async function readJsonOrNull(path) {
  try {
    const txt = await readFile(path, "utf8");
    return JSON.parse(txt);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    log(`warn: failed to parse ${path}: ${err.message ?? err}`);
    return null;
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const nowMs = Date.now();
  const sources = [];

  for (const source of SOURCES) {
    const path = resolve(DATA_DIR, source.file);
    const payload = await readJsonOrNull(path);
    if (!payload) {
      sources.push({
        slug: source.slug,
        total: 0,
        stale: 0,
        thresholdHours: Math.round((source.threshold * 2) / (60 * 60 * 1000)),
        examples: [],
        notes: ["file missing or unparseable"],
      });
      continue;
    }

    const records = source.pluck(payload) ?? [];
    const total = records.length;
    const offenders = [];
    let untrackedCount = 0;
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const stamp = record.lastRefreshedAt;
      if (typeof stamp !== "string") {
        untrackedCount += 1;
        continue;
      }
      const ts = Date.parse(stamp);
      if (!Number.isFinite(ts)) continue;
      const ageMs = nowMs - ts;
      if (ageMs > source.threshold * 2) {
        offenders.push({
          id: source.idOf(record),
          lastRefreshedAt: stamp,
          ageHours: Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10,
        });
      }
    }
    // Stable order — most stale first, top 20 examples to keep the
    // report file small and the admin table snappy.
    offenders.sort((a, b) => b.ageHours - a.ageHours);
    const examples = offenders.slice(0, 20);

    const notes = [];
    if (untrackedCount > 0) {
      notes.push(
        `${untrackedCount}/${total} records have no lastRefreshedAt — pre-B2 data, recount on next cron`,
      );
    }

    sources.push({
      slug: source.slug,
      total,
      stale: offenders.length,
      thresholdHours: Math.round((source.threshold * 2) / (60 * 60 * 1000)),
      examples,
      notes,
    });
  }

  const report = { generatedAt, sources };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  const totalStale = sources.reduce((acc, s) => acc + s.stale, 0);
  const totalRecords = sources.reduce((acc, s) => acc + s.total, 0);
  log(`wrote ${OUT_PATH}`);
  log(`  ${totalStale} stale / ${totalRecords} records across ${sources.length} sources`);
  for (const s of sources) {
    log(`  - ${s.slug}: ${s.stale}/${s.total} stale (>${s.thresholdHours}h)`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("sweep-staleness failed:", err.message ?? err);
    process.exit(1);
  });
}
