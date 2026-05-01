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
import { extractGithubRepoFullNames } from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import {
  loadHuggingfaceTokens,
  pickToken,
  authHeader,
} from "./_huggingface-shared.mjs";

// Token pool — HF_TOKENS (CSV) + HF_TOKEN (single fallback). Empty pool
// = unauth requests, matching legacy behaviour. Cursor advances per
// OUTER iteration (main listing + each card fetch) so the load spreads
// evenly without thrashing tokens within a single page-of-results call.
const HF_TOKENS = loadHuggingfaceTokens();
let hfCursor = 0;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "huggingface-trending.json");

const ENDPOINT = "https://huggingface.co/api/models?limit=1000&full=true";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

// Per-model cardData fetch — top-N models get a follow-up GET to
// /api/models/{id} so we can extract github.com/<owner>/<repo> links
// from cardData.repository / source / code_repository / github / homepage
// / url and the (uncapped) tags array. Default 100 keeps wall-time under
// ~10s extra; HF API has no documented rate limit but courteous-fetch
// culture applies. Set HF_CARD_FETCH_LIMIT=0 to disable.
const HF_CARD_FETCH_LIMIT = (() => {
  const raw = Number.parseInt(process.env.HF_CARD_FETCH_LIMIT ?? "100", 10);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(500, raw));
})();
const HF_CARD_CONCURRENCY = 5;
const HF_CARD_INTER_TASK_SLEEP_MS = 100;

function log(msg) {
  console.log(`[huggingface] ${msg}`);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Bounded-concurrency runner for the per-model card fetch. Workers pull
// the next index from a shared counter; a small inter-task sleep on
// workers past the initial batch keeps the API gentle. Per-task errors
// surface to the caller (each `task` call wraps its own try/catch).
async function runWithConcurrency(items, concurrency, sleepMs, task) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let next = 0;
  const width = Math.min(concurrency, items.length);
  const workers = Array.from({ length: width }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      if (idx >= concurrency && sleepMs > 0) await sleep(sleepMs);
      results[idx] = await task(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// Fetch a single model's detail and extract every github.com/<owner>/<repo>
// URL we can find in cardData / homepage / tags. Returns sorted unique
// fullNames, or null on fetch failure (caller leaves the field unset).
async function fetchModelCardGithubRepos(modelId) {
  const url = `https://huggingface.co/api/models/${encodeURIComponent(modelId)}`;
  const token = pickToken(HF_TOKENS, hfCursor++);
  try {
    const detail = await fetchJsonWithRetry(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...authHeader(token),
      },
      timeoutMs: 15_000,
      attempts: 2,
      retryDelayMs: 500,
    });
    const card = detail && typeof detail.cardData === "object" && detail.cardData
      ? detail.cardData
      : {};
    const tags = Array.isArray(detail?.tags) ? detail.tags : [];
    const text = [
      String(card.repository ?? ""),
      String(card.source ?? ""),
      String(card.code_repository ?? ""),
      String(card.github ?? ""),
      String(card.homepage ?? ""),
      String(card.url ?? ""),
      tags.map(String).join(" "),
    ].join(" ");
    // Discovery-mode: pass null trackedLower so we surface every github
    // mention. Downstream consumers can intersect with the tracked set
    // when attributing to entity profiles.
    const hits = extractGithubRepoFullNames(text, null);
    return Array.from(hits).sort();
  } catch (err) {
    log(`warn: card fetch failed for ${modelId}: ${err?.message ?? err}`);
    return null;
  }
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

  const listToken = pickToken(HF_TOKENS, hfCursor++);
  const raw = await fetchJsonWithRetry(ENDPOINT, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...authHeader(listToken),
    },
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

  // Per-model cardData fetch — extract github cross-links for the top N.
  // Mutates models in-place (adds githubRepos: string[] when found, else
  // leaves it unset so the JSON stays compact).
  const cardsToFetch = models.slice(0, HF_CARD_FETCH_LIMIT);
  let cardsFetched = 0;
  let withGithubRepos = 0;
  if (cardsToFetch.length > 0) {
    log(
      `fetching cardData for top ${cardsToFetch.length} models (concurrency ${HF_CARD_CONCURRENCY})…`,
    );
    const cardResults = await runWithConcurrency(
      cardsToFetch,
      HF_CARD_CONCURRENCY,
      HF_CARD_INTER_TASK_SLEEP_MS,
      (model) => fetchModelCardGithubRepos(model.id),
    );
    const unknownsAccumulator = new Set();
    for (let i = 0; i < cardsToFetch.length; i += 1) {
      const repos = cardResults[i];
      if (repos === null) continue;
      cardsFetched += 1;
      if (repos.length > 0) {
        cardsToFetch[i].githubRepos = repos;
        withGithubRepos += 1;
        // F3 lake — every github URL in HF cardData is a discovery candidate.
        for (const fullName of repos) unknownsAccumulator.add(fullName);
      }
    }
    if (unknownsAccumulator.size > 0) {
      await appendUnknownMentions(
        Array.from(unknownsAccumulator, (fullName) => ({ source: "huggingface", fullName })),
      );
      log(`  lake: ${unknownsAccumulator.size} candidates → data/unknown-mentions.jsonl`);
    }
    log(
      `  cardData: ${cardsFetched}/${cardsToFetch.length} fetched, ${withGithubRepos} with github links`,
    );
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
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] huggingface.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-huggingface failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] huggingface.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeModel };
