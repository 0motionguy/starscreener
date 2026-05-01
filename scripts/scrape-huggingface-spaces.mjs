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
import { extractGithubRepoFullNames } from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "huggingface-spaces.json");

const ENDPOINT = "https://huggingface.co/api/spaces?limit=1000&full=true";
const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";

// Per-space cardData fetch — top-N spaces get a follow-up GET to
// /api/spaces/{id} so we can extract github.com/<owner>/<repo> links from
// cardData.repository / source / code_repository / github / homepage / url
// and the tags array. Symmetric to the models scraper. HF Spaces often
// link to a github source repo in cardData but the listing endpoint omits
// it; without this fetch we extract zero github URLs from the spaces tier.
// Set HF_SPACES_CARD_FETCH_LIMIT=0 to disable.
const HF_SPACES_CARD_FETCH_LIMIT = (() => {
  const raw = Number.parseInt(process.env.HF_SPACES_CARD_FETCH_LIMIT ?? "100", 10);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(500, raw));
})();
const HF_SPACES_CARD_CONCURRENCY = 5;
const HF_SPACES_CARD_INTER_TASK_SLEEP_MS = 100;

function log(msg) {
  console.log(`[huggingface-spaces] ${msg}`);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Bounded-concurrency runner for the per-space card fetch. Mirror of the
// helper in scrape-huggingface.mjs; duplicated rather than extracted because
// it's small + the two scrapers are independently tunable.
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

// Fetch a single space's detail and extract every github.com/<owner>/<repo>
// URL we can find in cardData / homepage / tags. Returns sorted unique
// fullNames, or null on fetch failure (caller leaves the field unset).
async function fetchSpaceCardGithubRepos(spaceId) {
  const url = `https://huggingface.co/api/spaces/${encodeURIComponent(spaceId)}`;
  try {
    const detail = await fetchJsonWithRetry(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
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
    // mention. Downstream consumers can intersect with the tracked set.
    const hits = extractGithubRepoFullNames(text, null);
    return Array.from(hits).sort();
  } catch (err) {
    log(`warn: card fetch failed for ${spaceId}: ${err?.message ?? err}`);
    return null;
  }
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

  // Per-space cardData fetch — extract github cross-links for the top N.
  // Mutates spaces in-place (adds githubRepos: string[] when found, else
  // leaves it unset so the JSON stays compact).
  const cardsToFetch = spaces.slice(0, HF_SPACES_CARD_FETCH_LIMIT);
  let cardsFetched = 0;
  let withGithubRepos = 0;
  if (cardsToFetch.length > 0) {
    log(
      `fetching cardData for top ${cardsToFetch.length} spaces (concurrency ${HF_SPACES_CARD_CONCURRENCY})…`,
    );
    const cardResults = await runWithConcurrency(
      cardsToFetch,
      HF_SPACES_CARD_CONCURRENCY,
      HF_SPACES_CARD_INTER_TASK_SLEEP_MS,
      (space) => fetchSpaceCardGithubRepos(space.id),
    );
    const unknownsAccumulator = new Set();
    for (let i = 0; i < cardsToFetch.length; i += 1) {
      const repos = cardResults[i];
      if (repos === null) continue;
      cardsFetched += 1;
      if (repos.length > 0) {
        cardsToFetch[i].githubRepos = repos;
        withGithubRepos += 1;
        // F3 lake — every github URL in HF Spaces cardData is a discovery candidate.
        for (const fullName of repos) unknownsAccumulator.add(fullName);
      }
    }
    if (unknownsAccumulator.size > 0) {
      await appendUnknownMentions(
        Array.from(unknownsAccumulator, (fullName) => ({
          source: "huggingface-spaces",
          fullName,
        })),
      );
      log(`  lake: ${unknownsAccumulator.size} candidates → data/unknown-mentions.jsonl`);
    }
    log(
      `  cardData: ${cardsFetched}/${cardsToFetch.length} fetched, ${withGithubRepos} with github links`,
    );
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
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface-spaces",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error(
          "[meta] huggingface-spaces.json write failed:",
          metaErr,
        );
      }
    })
    .catch(async (err) => {
      console.error(
        "scrape-huggingface-spaces failed:",
        err.message ?? err,
      );
      try {
        await writeSourceMetaFromOutcome({
          source: "huggingface-spaces",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error(
          "[meta] huggingface-spaces.json error-write failed:",
          metaErr,
        );
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeSpace };
