#!/usr/bin/env node
// Scrape HuggingFace for trending models.
//
// HuggingFace exposes a public, unauthenticated API. We pull the trending
// models endpoint, normalize, and dual-write a snapshot. No GitHub-repo
// cross-link extraction here yet — HF model cards often link back to a
// source repo, but the `cardData` field requires a separate per-model
// fetch which we'll add when /research grows past the read-only listing.
//
// Endpoint:
//   https://huggingface.co/api/models?limit=100
// (Default sort returns trending order. The explicit `sort=trending` param
// was removed by HF and now returns 400. Each row carries a `trendingScore`
// numeric field which we preserve for downstream ranking.)
//
// Output:
//   - data/huggingface-trending.json — top 100 trending models, snapshot
//
// Cadence: 3h via .github/workflows/scrape-huggingface.yml. HF's API is
// generous (no documented rate limit) but courteous-fetch culture applies;
// 3h matches our other "trending" sources without piling up redundant reads.
//
// If the API changes shape, this scraper fails loud (Zod-style guard on
// the array). Downstream readers see `huggingfaceCold = true` and the
// /research page hides the section.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "huggingface-trending.json");

const ENDPOINT = "https://huggingface.co/api/models?limit=1000&full=true";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

function log(msg) {
  console.log(`[huggingface] ${msg}`);
}

// HF model row shape (stable across the API's lifetime, partial coverage):
//   { _id, id, modelId, likes, downloads, tags, pipeline_tag, library_name,
//     createdAt, lastModified, private, gated, author }
// `id` is the canonical "author/name" path on huggingface.co.
function normalizeModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? raw.modelId ?? "");
  if (!id || !id.includes("/")) return null;

  const author = raw.author ?? id.split("/")[0];
  const downloads = Number.isFinite(raw.downloads) ? raw.downloads : 0;
  const likes = Number.isFinite(raw.likes) ? raw.likes : 0;
  const trendingScore = Number.isFinite(raw.trendingScore)
    ? raw.trendingScore
    : 0;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 30) : [];
  const pipelineTag = raw.pipeline_tag ? String(raw.pipeline_tag) : null;
  const libraryName = raw.library_name ? String(raw.library_name) : null;
  const createdAt = raw.createdAt ? String(raw.createdAt) : null;
  const lastModified = raw.lastModified ? String(raw.lastModified) : null;

  return {
    id,
    author,
    url: `https://huggingface.co/${id}`,
    downloads,
    likes,
    trendingScore,
    pipelineTag,
    libraryName,
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
      `unexpected HF response — expected array, got ${typeof raw}`,
    );
  }

  const models = [];
  for (const row of raw) {
    const norm = normalizeModel(row);
    if (norm) models.push(norm);
  }

  if (models.length === 0) {
    throw new Error("no models in HF trending response — API shape changed?");
  }

  // Trending order from HF is already meaningful; preserve it as `rank`.
  const ranked = models.map((m, i) => ({ rank: i + 1, ...m }));

  const payload = {
    fetchedAt,
    source: "huggingface.co/api/models (default sort = trending)",
    count: ranked.length,
    models: ranked,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redis = await writeDataStore("huggingface-trending", payload);

  log(`wrote ${OUT_PATH} [redis: ${redis.source}]`);
  log(`  ${ranked.length} trending models`);
  log(`  top 3: ${ranked.slice(0, 3).map((m) => m.id).join(", ")}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // Wrap so we always close the Redis client. Without this, ioredis keeps
  // the event loop alive and the workflow hangs for hours, getting cancelled
  // by the next cron tick — the bug that emptied huggingface-{datasets,
  // spaces}.json (B6 root cause).
  main()
    .catch((err) => {
      console.error("scrape-huggingface failed:", err.message ?? err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeModel };
