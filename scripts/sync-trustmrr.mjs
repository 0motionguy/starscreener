#!/usr/bin/env node
// Sync TrustMRR startup catalog + derive revenue overlays.
//
// Modes:
//   --mode=full         Paginate the TrustMRR catalog, write
//                       data/trustmrr-startups.json, then re-derive
//                       data/revenue-overlays.json. Default. Use in the
//                       daily / 6h cron.
//   --mode=incremental  Skip TrustMRR API. Re-derive overlays from the
//                       already-cached catalog against the latest
//                       repo-metadata.json. Cheap. Use in the hourly cron.
//
// Env:
//   TRUSTMRR_API_KEY    Required for --mode=full. Ignored otherwise.
//   TRUSTMRR_PAGE_SIZE  Override default 50.
//   TRUSTMRR_INTERVAL_MS Override pacing (default 3500).
//
// Exit codes:
//   0  success
//   1  fatal error (no API key, HTTP error after retries, IO failure)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAllStartups, buildOverlays } from "./_trustmrr.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const CATALOG_FILE = resolve(DATA_DIR, "trustmrr-startups.json");
const OVERLAYS_FILE = resolve(DATA_DIR, "revenue-overlays.json");
const REPO_METADATA_FILE = resolve(DATA_DIR, "repo-metadata.json");
const REPO_PROFILES_FILE = resolve(DATA_DIR, "repo-profiles.json");
const MANUAL_MATCHES_FILE = resolve(DATA_DIR, "revenue-manual-matches.json");

const MODE = parseMode(process.argv.slice(2));

function parseMode(argv) {
  for (const arg of argv) {
    if (arg === "--mode=full" || arg === "--full") return "full";
    if (arg === "--mode=incremental" || arg === "--incremental") return "incremental";
  }
  // Default: if TRUSTMRR_API_KEY is present, full; otherwise incremental.
  return process.env.TRUSTMRR_API_KEY ? "full" : "incremental";
}

async function readJsonSafe(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function writeJson(path, value) {
  await ensureDir(path);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Collect {fullName, homepage} pairs from repo-metadata.json first (broad
 * coverage via GitHub API homepageUrl) with repo-profiles.json websiteUrl as
 * a supplementary source for repos metadata missed.
 */
async function collectRepoHomepages() {
  const metadata = await readJsonSafe(REPO_METADATA_FILE, { items: [] });
  const profiles = await readJsonSafe(REPO_PROFILES_FILE, { profiles: [] });
  const map = new Map();
  for (const item of metadata.items ?? []) {
    if (!item || typeof item.fullName !== "string") continue;
    const homepage = typeof item.homepageUrl === "string" ? item.homepageUrl : null;
    if (!homepage) continue;
    map.set(item.fullName, homepage);
  }
  for (const profile of profiles.profiles ?? []) {
    if (!profile || typeof profile.fullName !== "string") continue;
    if (map.has(profile.fullName)) continue;
    const homepage =
      typeof profile.websiteUrl === "string" ? profile.websiteUrl : null;
    if (!homepage) continue;
    map.set(profile.fullName, homepage);
  }
  return Array.from(map.entries()).map(([fullName, homepage]) => ({
    fullName,
    homepage,
  }));
}

async function runFull() {
  const apiKey = process.env.TRUSTMRR_API_KEY;
  if (!apiKey) {
    console.error(
      "[sync-trustmrr] --mode=full requires TRUSTMRR_API_KEY. Aborting.",
    );
    process.exit(1);
  }
  const pageSize = Number.parseInt(process.env.TRUSTMRR_PAGE_SIZE ?? "", 10);
  const intervalMs = Number.parseInt(process.env.TRUSTMRR_INTERVAL_MS ?? "", 10);
  const fetchedAt = new Date().toISOString();
  console.log(`[sync-trustmrr] full sweep at ${fetchedAt}`);
  let cumulative = 0;
  const { startups, total, pages } = await fetchAllStartups({
    apiKey,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : undefined,
    onPage: ({ page, received, total: pageTotal }) => {
      cumulative += received;
      console.log(
        `[sync-trustmrr]   page ${page}: +${received} (cumulative ${cumulative} of ${pageTotal ?? "?"})`,
      );
    },
  });
  console.log(
    `[sync-trustmrr] fetched ${startups.length} startups across ${pages} page(s) (reported total: ${total})`,
  );
  const catalogPayload = {
    generatedAt: fetchedAt,
    version: 1,
    total,
    startups,
  };
  await writeJson(CATALOG_FILE, catalogPayload);
  console.log(`[sync-trustmrr] wrote ${CATALOG_FILE}`);

  // Dual-write catalog to data-store. Also push a small metadata sidecar so
  // callers that only need the count don't have to fetch the ~7 MB blob.
  const serialized = JSON.stringify(catalogPayload);
  const catalogRedis = await writeDataStore("trustmrr-startups", catalogPayload);
  const metaRedis = await writeDataStore("trustmrr-startups:meta", {
    generatedAt: fetchedAt,
    startupCount: startups.length,
    totalReported: total,
    totalSize: serialized.length,
    fetchedAt,
  });
  console.log(
    `[sync-trustmrr] data-store: catalog=${catalogRedis.source} meta=${metaRedis.source} (size=${serialized.length} bytes)`,
  );

  await deriveOverlays({ catalogGeneratedAt: fetchedAt });
}

async function runIncremental() {
  const catalog = await readJsonSafe(CATALOG_FILE, null);
  if (!catalog || !Array.isArray(catalog.startups) || catalog.startups.length === 0) {
    console.warn(
      "[sync-trustmrr] incremental mode but no catalog cache found; nothing to derive.",
    );
    return;
  }
  const fetchedAt =
    typeof catalog.generatedAt === "string"
      ? catalog.generatedAt
      : new Date().toISOString();
  const serialized = JSON.stringify(catalog);
  const catalogRedis = await writeDataStore("trustmrr-startups", catalog);
  const metaRedis = await writeDataStore("trustmrr-startups:meta", {
    generatedAt: fetchedAt,
    startupCount: catalog.startups.length,
    totalReported: Number.isFinite(catalog.total)
      ? catalog.total
      : catalog.startups.length,
    totalSize: serialized.length,
    fetchedAt,
  });
  console.log(
    `[sync-trustmrr] data-store: catalog=${catalogRedis.source} meta=${metaRedis.source} (size=${serialized.length} bytes)`,
  );
  await deriveOverlays({ catalogGeneratedAt: catalog.generatedAt ?? null });
}

async function deriveOverlays({ catalogGeneratedAt }) {
  const catalog = await readJsonSafe(CATALOG_FILE, { startups: [] });
  const manualMatches = await readJsonSafe(MANUAL_MATCHES_FILE, {});
  const repos = await collectRepoHomepages();
  const generatedAt = new Date().toISOString();
  const overlays = buildOverlays({
    startups: catalog.startups ?? [],
    repos,
    manualMatches:
      manualMatches && typeof manualMatches === "object" ? manualMatches : {},
    generatedAt: catalogGeneratedAt ?? generatedAt,
  });
  const matchedCount = Object.keys(overlays).length;
  const overlaysPayload = {
    generatedAt,
    version: 1,
    source: "trustmrr",
    catalogGeneratedAt: catalogGeneratedAt ?? null,
    overlays,
  };
  await writeJson(OVERLAYS_FILE, overlaysPayload);
  const overlaysRedis = await writeDataStore("revenue-overlays", overlaysPayload);
  console.log(
    `[sync-trustmrr] wrote ${OVERLAYS_FILE} — matched ${matchedCount} repo(s) against ${(catalog.startups ?? []).length} startup(s) [redis: ${overlaysRedis.source}]`,
  );
}

async function main() {
  if (MODE === "full") {
    await runFull();
  } else {
    await runIncremental();
  }
}

main().catch((err) => {
  console.error("[sync-trustmrr] fatal:", err);
  process.exit(1);
});
