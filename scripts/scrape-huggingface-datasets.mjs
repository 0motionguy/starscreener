#!/usr/bin/env node
// Scrape HuggingFace for trending datasets.
//
// Mirrors scripts/scrape-huggingface.mjs but targets the datasets endpoint.
// HuggingFace exposes a public, unauthenticated dataset list; default sort
// is trending (the explicit `sort=trending` param was removed by HF and
// returns 400). Each row carries a `trendingScore` numeric field which
// we preserve for downstream ranking + scoring.
//
// Endpoint:
//   https://huggingface.co/api/datasets?limit=100
//
// Output:
//   - data/huggingface-datasets.json — top 100 trending datasets, snapshot
//   - Redis key `huggingface-datasets` (via writeDataStore)
//
// Cadence: 3h via .github/workflows/scrape-huggingface-datasets.yml. The
// HF API is generous (no documented rate limit) but courteous-fetch
// culture applies; 3h matches the trending half-life on the site without
// burning rate budget. Cron staggered :25 to avoid clobbering the models
// scrape (:13) and arxiv (:43) on the same minute.
//
// If the API changes shape, this scraper fails loud (Zod-style guard on
// the array). Defensive on per-row shape: rows missing `id` or with a
// malformed shape are SKIPPED (not included in output) — log and move on
// rather than throwing, since HF occasionally surfaces partial rows.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import {
  loadHuggingfaceTokens,
  pickToken,
  authHeader,
} from "./_huggingface-shared.mjs";

// Token pool — HF_TOKENS (CSV) + HF_TOKEN (single fallback). Same
// rotation strategy as scrape-huggingface.mjs: cursor advances per
// outer call so token use spreads evenly across the workflow.
const HF_TOKENS = loadHuggingfaceTokens();
let hfCursor = 0;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "huggingface-datasets.json");

const ENDPOINT = "https://huggingface.co/api/datasets?limit=1000&full=true";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[huggingface-datasets] ${msg}`);
}

// HF dataset row shape (partial coverage of stable fields):
//   { _id, id, author, downloads, likes, trendingScore, tags,
//     createdAt, lastModified, private, gated }
// `id` is the canonical "author/name" path on huggingface.co/datasets.
// Defensive: skip the row if id is missing or has no "/" (shape drift).
function normalizeDataset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "");
  if (!id || !id.includes("/")) return null;

  const author = raw.author ?? id.split("/")[0];
  const downloads = Number.isFinite(raw.downloads) ? raw.downloads : 0;
  const likes = Number.isFinite(raw.likes) ? raw.likes : 0;
  const trendingScore = Number.isFinite(raw.trendingScore)
    ? raw.trendingScore
    : 0;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 30) : [];
  const createdAt = raw.createdAt ? String(raw.createdAt) : null;
  const lastModified = raw.lastModified ? String(raw.lastModified) : null;

  return {
    id,
    author,
    url: `https://huggingface.co/datasets/${id}`,
    downloads,
    likes,
    trendingScore,
    tags,
    createdAt,
    lastModified,
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
      `unexpected HF datasets response — expected array, got ${typeof raw}`,
    );
  }

  const datasets = [];
  let skipped = 0;
  for (const row of raw) {
    const norm = normalizeDataset(row);
    if (norm) datasets.push(norm);
    else skipped += 1;
  }

  if (datasets.length === 0) {
    throw new Error(
      "no datasets in HF trending response — API shape changed?",
    );
  }

  // Trending order from HF is already meaningful; preserve it as `rank`.
  const ranked = datasets.map((d, i) => ({ rank: i + 1, ...d }));

  const payload = {
    fetchedAt,
    source: "huggingface.co/api/datasets (default sort = trending)",
    count: ranked.length,
    datasets: ranked,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("huggingface-datasets", payload);

  log(`wrote ${OUT_PATH} [redis: ${redis.source}]`);
  log(`  ${ranked.length} trending datasets (skipped ${skipped} malformed)`);
  log(`  top 3: ${ranked.slice(0, 3).map((d) => d.id).join(", ")}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // Always close the Redis client — ioredis otherwise keeps the event loop
  // alive and the workflow hangs until cancellation. B6 root cause.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface-datasets",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error(
          "[meta] huggingface-datasets.json write failed:",
          metaErr,
        );
      }
    })
    .catch(async (err) => {
      console.error(
        "scrape-huggingface-datasets failed:",
        err.message ?? err,
      );
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface-datasets",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error(
          "[meta] huggingface-datasets.json error-write failed:",
          metaErr,
        );
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeDataset };
