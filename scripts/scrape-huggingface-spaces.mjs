#!/usr/bin/env node
// Scrape HuggingFace for trending Spaces.
//
// Mirrors scripts/scrape-huggingface.mjs but targets the spaces endpoint.
// Spaces are HF-hosted ML demos (Gradio/Streamlit/static); the public
// list endpoint returns trending order by default. Each row carries a
// `trendingScore` numeric field which we preserve for downstream ranking
// + scoring. The `models` array on each row is the spaces↔models join key
// (which models a space is built on); preserve it verbatim — Chunk D's
// cross-domain join resolver needs it to populate `avgModelMomentum`.
//
// Endpoint:
//   https://huggingface.co/api/spaces?limit=100
//
// Output:
//   - data/huggingface-spaces.json — top 100 trending spaces, snapshot
//   - Redis key `huggingface-spaces` (via writeDataStore)
//
// Cadence: 3h via .github/workflows/scrape-huggingface-spaces.yml. Cron
// staggered :35 to avoid clobbering models (:13), datasets (:25), and
// arxiv (:43) on the same minute.
//
// Defensive on per-row shape: rows missing `id` or with a malformed shape
// are SKIPPED (not included in output) — HF occasionally surfaces partial
// rows during reindex windows. The `models` field is not always present;
// default to [] when missing.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "huggingface-spaces.json");

const ENDPOINT = "https://huggingface.co/api/spaces?limit=1000&full=true";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[huggingface-spaces] ${msg}`);
}

// HF space row shape (partial coverage of stable fields):
//   { _id, id, author, likes, trendingScore, sdk, tags, createdAt,
//     lastModified, private, models: string[] }
// `id` is the canonical "author/name" path on huggingface.co/spaces.
// `models` is HF's "which models does this space use" array — the
// spaces↔models join key for Chunk D's cross-domain resolver. Default
// to [] if HF omits it for a row.
function normalizeSpace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "");
  if (!id || !id.includes("/")) return null;

  const author = raw.author ?? id.split("/")[0];
  const likes = Number.isFinite(raw.likes) ? raw.likes : 0;
  const trendingScore = Number.isFinite(raw.trendingScore)
    ? raw.trendingScore
    : 0;
  const sdk = raw.sdk ? String(raw.sdk) : null;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 30) : [];
  const createdAt = raw.createdAt ? String(raw.createdAt) : null;
  const lastModified = raw.lastModified ? String(raw.lastModified) : null;
  const models = Array.isArray(raw.models)
    ? raw.models.map(String).slice(0, 50)
    : [];

  return {
    id,
    author,
    url: `https://huggingface.co/spaces/${id}`,
    likes,
    trendingScore,
    sdk,
    tags,
    createdAt,
    lastModified,
    models,
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();

  const raw = await fetchJsonWithRetry(ENDPOINT, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    timeoutMs: 20_000,
    attempts: 3,
    retryDelayMs: 750,
  });

  if (!Array.isArray(raw)) {
    throw new Error(
      `unexpected HF spaces response — expected array, got ${typeof raw}`,
    );
  }

  const spaces = [];
  let skipped = 0;
  for (const row of raw) {
    const norm = normalizeSpace(row);
    if (norm) spaces.push(norm);
    else skipped += 1;
  }

  if (spaces.length === 0) {
    throw new Error("no spaces in HF trending response — API shape changed?");
  }

  // Trending order from HF is already meaningful; preserve it as `rank`.
  const ranked = spaces.map((s, i) => ({ rank: i + 1, ...s }));

  const payload = {
    fetchedAt,
    source: "huggingface.co/api/spaces (default sort = trending)",
    count: ranked.length,
    spaces: ranked,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("huggingface-spaces", payload);

  log(`wrote ${OUT_PATH} [redis: ${redis.source}]`);
  log(`  ${ranked.length} trending spaces (skipped ${skipped} malformed)`);
  log(`  top 3: ${ranked.slice(0, 3).map((s) => s.id).join(", ")}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // Always close the Redis client — ioredis otherwise keeps the event loop
  // alive and the workflow hangs until cancellation. B6 root cause.
  main()
    .catch((err) => {
      console.error(
        "scrape-huggingface-spaces failed:",
        err.message ?? err,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeSpace };
