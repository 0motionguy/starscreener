#!/usr/bin/env node
// Snapshot daily npm download counts + dependents for tracked packages.
//
// Why separate from scrape-npm.mjs: the main scraper rebuilds the whole
// ranked top-list JSON. This one is append-only: it rolls the 30-day daily
// download history forward so the adoption panel can render a sparkline
// without hitting the network per page view. It also captures a best-effort
// "dependents" count per package (npm has no clean public API for this;
// we read the registry packument and fall back to null if we can't verify).
//
// Inputs:
//   - data/npm-packages.json (auto)           — authoritative tracked list
//   - data/npm-manual-packages.json (auto)    — manually curated packages
//   - CLI args (optional): positional list of package names overrides the
//     auto-discovered list; useful for targeted smoke tests.
//
// Outputs:
//   - .data/npm-daily.jsonl  (append-only, deduped by (package, date))
//       {"package":"next","date":"2026-04-24","downloads":1234567,"fetchedAt":"..."}
//   - .data/npm-dependents.json
//       { "next": { count: 42, fetchedAt: "..." }, ... }   // count MAY be null
//
// Cadence: daily. npm download stats lag 24-48h so the latest day in the
// range may always be a few days behind real time.
//
// Conventions: Node ESM, native fetch, no new npm deps, matches
// scripts/scrape-npm.mjs style.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import { fetchJsonWithRetry, HttpStatusError, sleep } from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const INPUT_PACKAGES = resolve(PROJECT_ROOT, "data", "npm-packages.json");
const INPUT_MANUAL = resolve(PROJECT_ROOT, "data", "npm-manual-packages.json");
const OUT_DIR = resolve(PROJECT_ROOT, ".data");
const OUT_JSONL = resolve(OUT_DIR, "npm-daily.jsonl");
const OUT_DEPENDENTS = resolve(OUT_DIR, "npm-dependents.json");

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const CONCURRENCY = 5;
const STAGGER_MS = 200;
const RANGE = "last-month"; // 30 daily points, ending ~yesterday

function encodePackageName(name) {
  // npm range API wants scoped packages encoded with / preserved.
  // encodeURIComponent would encode the '/'; we manually handle the scope.
  const s = String(name);
  if (s.startsWith("@")) {
    const slash = s.indexOf("/");
    if (slash !== -1) {
      const scope = s.slice(0, slash);
      const rest = s.slice(slash + 1);
      return `${encodeURIComponent(scope)}/${encodeURIComponent(rest)}`;
    }
  }
  return encodeURIComponent(s);
}

async function readJsonIfExists(path) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

async function discoverPackageNames({ explicit, log }) {
  if (Array.isArray(explicit) && explicit.length > 0) {
    log(`using ${explicit.length} explicit package name(s) from argv`);
    return Array.from(new Set(explicit.map((n) => String(n).trim()).filter(Boolean)));
  }

  const names = new Set();
  const auto = await readJsonIfExists(INPUT_PACKAGES);
  const manual = await readJsonIfExists(INPUT_MANUAL);

  for (const pkg of auto?.packages ?? []) {
    if (typeof pkg?.name === "string" && pkg.name.length > 0) names.add(pkg.name);
  }
  for (const pkg of manual?.packages ?? []) {
    if (typeof pkg?.name === "string" && pkg.name.length > 0) names.add(pkg.name);
  }
  log(
    `discovered ${names.size} tracked package(s) from data/npm-packages.json ` +
      `+ data/npm-manual-packages.json`,
  );
  return Array.from(names);
}

async function fetchDailyDownloads(name, fetchImpl = fetch) {
  const url = `https://api.npmjs.org/downloads/range/${RANGE}/${encodePackageName(name)}`;
  try {
    const payload = await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 3,
      retryDelayMs: 4_000,
      timeoutMs: 25_000,
      headers: { "User-Agent": USER_AGENT },
    });
    const rows = Array.isArray(payload?.downloads) ? payload.downloads : [];
    return rows
      .map((row) => ({
        date: typeof row?.day === "string" ? row.day.slice(0, 10) : "",
        downloads: Math.max(0, Number(row?.downloads) || 0),
      }))
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return null;
    throw err;
  }
}

// Best-effort dependents count.
//
// npm does not expose a stable public API for dependents counts. Options:
//   1. registry.npmjs.org/-/v1/search?text=<name>&size=0 returns `total`
//      but that's a full-text match count, not a true dependents count.
//      It massively overcounts (any package mentioning the name matches).
//   2. registry.npmjs.org/-/_view/dependedUpon?key=<name>  -> frequently 404
//      in the public API; was removed from npm's replicate endpoint.
//   3. api.npms.io/v2/package/<name> used to return a dependents number but
//      the service is deprecated / unreliable.
//
// We attempt #2 (dependedUpon) and fall back to null on any failure.
// Callers must treat `null` as "unknown, don't render" — NOT as zero.
async function fetchDependentsCount(name, fetchImpl = fetch) {
  const url = `https://registry.npmjs.org/-/_view/dependedUpon?group_level=2&startkey=${encodeURIComponent(
    JSON.stringify([name]),
  )}&endkey=${encodeURIComponent(JSON.stringify([name, {}]))}`;
  try {
    const payload = await fetchJsonWithRetry(url, {
      fetchImpl,
      attempts: 2,
      retryDelayMs: 2_000,
      timeoutMs: 15_000,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length === 0) return null;
    const total = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row?.value) || 0),
      0,
    );
    return total > 0 ? total : null;
  } catch {
    // TODO: consider scraping https://www.npmjs.com/browse/depended/<name>
    // as a last resort, but that's fragile HTML parsing so we ship null.
    return null;
  }
}

// Parse existing JSONL so we can dedupe (package, date) tuples without
// loading every row into memory more than once. Returns a Map keyed by
// "<pkg>::<date>" -> row string (so we preserve line order on rewrite).
async function readExistingJsonl(path) {
  try {
    const text = await readFile(path, "utf8");
    const rows = new Map();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj?.package === "string" && typeof obj?.date === "string") {
          rows.set(`${obj.package}::${obj.date}`, obj);
        }
      } catch {
        // Skip malformed lines — don't explode the scraper over one bad row.
      }
    }
    return rows;
  } catch (err) {
    if (err && err.code === "ENOENT") return new Map();
    throw err;
  }
}

function serializeJsonl(rows) {
  const sorted = Array.from(rows.values()).sort((a, b) => {
    const byPkg = String(a.package).localeCompare(String(b.package));
    if (byPkg !== 0) return byPkg;
    return String(a.date).localeCompare(String(b.date));
  });
  return sorted.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

async function processBatch(names, { fetchImpl = fetch, log = () => {} } = {}) {
  const fetchedAt = new Date().toISOString();
  const existing = await readExistingJsonl(OUT_JSONL);
  const priorDependents = (await readJsonIfExists(OUT_DEPENDENTS)) ?? {};
  const dependents = { ...priorDependents };

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  // Naive concurrency pool: process CONCURRENCY at a time, staggering
  // the start of each task by STAGGER_MS to be polite to the registry.
  async function worker(name, index) {
    if (STAGGER_MS > 0 && index > 0) {
      await sleep(STAGGER_MS * (index % CONCURRENCY));
    }
    try {
      const [daily, deps] = await Promise.all([
        fetchDailyDownloads(name, fetchImpl),
        fetchDependentsCount(name, fetchImpl),
      ]);
      if (daily === null) {
        log(`  skip ${name} (404 from downloads API)`);
        skipped += 1;
        return;
      }
      let added = 0;
      for (const point of daily) {
        if (point.downloads === 0) {
          // keep zero days — they're meaningful for the sparkline
        }
        const key = `${name}::${point.date}`;
        const row = {
          package: name,
          date: point.date,
          downloads: point.downloads,
          fetchedAt,
        };
        // Always overwrite: re-running today replaces stale numbers.
        existing.set(key, row);
        added += 1;
      }
      dependents[name] = {
        count: typeof deps === "number" ? deps : null,
        fetchedAt,
      };
      ok += 1;
      log(
        `  ok ${name} — ${added} day(s), dependents=${
          dependents[name].count ?? "null"
        }`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed += 1;
      log(`  fail ${name}: ${msg}`);
    }
  }

  // Chunked concurrency.
  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const chunk = names.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((name, j) => worker(name, i + j)));
  }

  return { existing, dependents, ok, skipped, failed, fetchedAt };
}

export async function main({ argv = process.argv.slice(2), log = console.log, fetchImpl = fetch } = {}) {
  const explicit = argv.filter((a) => !a.startsWith("-"));
  const names = await discoverPackageNames({ explicit, log });
  if (names.length === 0) {
    log("no tracked packages found — nothing to do");
    return { ok: 0, skipped: 0, failed: 0 };
  }

  log(`snapshotting ${names.length} package(s), concurrency=${CONCURRENCY}, stagger=${STAGGER_MS}ms`);
  const { existing, dependents, ok, skipped, failed } = await processBatch(names, {
    fetchImpl,
    log,
  });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_JSONL, serializeJsonl(existing), "utf8");
  await writeFile(OUT_DEPENDENTS, `${JSON.stringify(dependents, null, 2)}\n`, "utf8");

  // SCR-04: dual-write to data-store so live readers see the dependents
  // map without waiting for the next deploy. JSONL stays on disk for the
  // append-only history; only the dependents snapshot is small enough to
  // fit in Redis comfortably.
  const dsResult = await writeDataStore("npm-dependents", {
    fetchedAt: new Date().toISOString(),
    dependents,
  });

  const sizeJsonl = (await stat(OUT_JSONL)).size;
  const sizeDeps = (await stat(OUT_DEPENDENTS)).size;
  log(`wrote ${OUT_JSONL} (${sizeJsonl} bytes, ${existing.size} rows)`);
  log(`wrote ${OUT_DEPENDENTS} (${sizeDeps} bytes, ${Object.keys(dependents).length} packages) [redis: ${dsResult.source}]`);
  log(`done: ok=${ok} skipped=${skipped} failed=${failed}`);
  return { ok, skipped, failed };
}

const argv1 = process.argv[1];
const isDirectRun =
  Boolean(argv1) &&
  (import.meta.url === `file://${argv1}` ||
    import.meta.url.endsWith(argv1.replace(/\\/g, "/")));

if (isDirectRun) {
  // T2.6: metadata sidecar — distinguishes outage from quiet day.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "npm-daily",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] npm-daily.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-npm-daily failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "npm-daily",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] npm-daily.json error-write failed:", metaErr);
      }
      process.exit(1);
    });
}
