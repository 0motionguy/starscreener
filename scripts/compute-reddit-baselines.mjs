#!/usr/bin/env node
// Compute rolling 30-day baseline stats per subreddit, for trend detection.
//
// Why baselines: absolute upvote counts are misleading across subs. 65
// upvotes in r/MachineLearning is noise; 65 upvotes in r/mcp is viral. The
// scrape-reddit scraper uses these baselines to compute baseline_ratio =
// post.upvotes / baseline.median_upvotes, which normalizes across subs.
//
// Window: last 1000 posts OR last 30 days, whichever smaller. Reddit's
// public JSON caps `after`-pagination at ~1000 posts per sub. For
// high-volume subs (r/ChatGPT) that's effectively "last 1-2 days" — still
// a valid sample for a rolling median. For low-volume subs (r/mcp) we get
// every post in the 30-day window.
//
// Cadence: weekly. Baselines shouldn't move fast; recomputing hourly would
// be wasted requests. Run with `npm run compute:reddit-baselines`.
//
// Output: data/reddit-baselines.json matching the shape expected by
// src/lib/reddit-baselines.ts.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBREDDITS,
  sleep,
  fetchRedditJson,
} from "./_reddit-shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT = resolve(DATA_DIR, "reddit-baselines.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 30;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
// 5s pause = 12 req/min — well under Reddit's real-world anon limit
// (~15/min observed post-2024). Shared scraper stays at 2s because it's
// one request per sub, not 5. Baselines hammer the same IP harder.
const BASELINE_REQUEST_PAUSE_MS = 5000;
// 65s sleep on 429 — Reddit's rate window is 60s; 5s margin.
const RATE_LIMIT_BACKOFF_MS = 65000;
const MAX_PAGES_PER_SUB = 5; // 500 posts is plenty for a rolling median
const PAGE_LIMIT = 100;
// Re-fetch existing baselines only if older than this (resume mode).
const BASELINE_STALE_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

// Confidence tiers by sample size.
const CONFIDENCE_HIGH_MIN = 200;
const CONFIDENCE_MEDIUM_MIN = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function median(sortedNumbers) {
  const n = sortedNumbers.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sortedNumbers[(n - 1) / 2];
  return (sortedNumbers[n / 2 - 1] + sortedNumbers[n / 2]) / 2;
}

function percentile(sortedNumbers, p) {
  const n = sortedNumbers.length;
  if (n === 0) return 0;
  // Nearest-rank method — simple, good enough for distribution-anchoring.
  const idx = Math.min(n - 1, Math.floor((p / 100) * n));
  return sortedNumbers[idx];
}

function mean(numbers) {
  if (numbers.length === 0) return 0;
  let sum = 0;
  for (const x of numbers) sum += x;
  return sum / numbers.length;
}

function classifyConfidence(sampleSize) {
  if (sampleSize >= CONFIDENCE_HIGH_MIN) return "high";
  if (sampleSize >= CONFIDENCE_MEDIUM_MIN) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Per-sub fetch
// ---------------------------------------------------------------------------

async function fetchWithRetry(url) {
  // One 429 retry with a 65s sleep, enough to clear Reddit's 60s window.
  // Second 429 is treated as a hard error for this sub.
  try {
    return await fetchRedditJson(url);
  } catch (err) {
    if (err.status !== 429) throw err;
    process.stdout.write(
      `    rate-limited, sleeping ${RATE_LIMIT_BACKOFF_MS / 1000}s before one retry…\n`,
    );
    await sleep(RATE_LIMIT_BACKOFF_MS);
    return fetchRedditJson(url);
  }
}

async function fetchSubPosts(sub, cutoffUtc) {
  // Paginate /new.json backward through time. Break when we cross the
  // cutoff or hit the 5-page cap. Return the raw post.data objects.
  const collected = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES_PER_SUB; page += 1) {
    const afterParam = after ? `&after=${encodeURIComponent(after)}` : "";
    const url = `https://www.reddit.com/r/${sub}/new.json?limit=${PAGE_LIMIT}${afterParam}`;
    const body = await fetchWithRetry(url);
    const children = body?.data?.children;
    if (!Array.isArray(children) || children.length === 0) break;

    let pageOldestUtc = Infinity;
    let pageCount = 0;
    for (const c of children) {
      const p = c?.data;
      if (!p || typeof p !== "object") continue;
      if (typeof p.created_utc !== "number") continue;
      pageOldestUtc = Math.min(pageOldestUtc, p.created_utc);
      if (p.created_utc < cutoffUtc) continue;
      collected.push(p);
      pageCount += 1;
    }

    after = body?.data?.after ?? null;
    if (!after) break;
    // Pagination reached the 30-day boundary — don't waste another request
    // pulling older posts we'd just filter out.
    if (pageOldestUtc < cutoffUtc) break;
    // Rate-limit pause between pages within the same sub.
    if (page < MAX_PAGES_PER_SUB - 1) await sleep(BASELINE_REQUEST_PAUSE_MS);

    // If every post in this page is post-cutoff we keep paginating; if the
    // page itself contributed zero in-window posts we're done.
    if (pageCount === 0) break;
  }
  return collected;
}

async function loadExistingBaselines() {
  try {
    const raw = await readFile(OUT, "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastComputedAt: parsed.lastComputedAt ?? null,
      baselines: parsed.baselines ?? {},
      errors: parsed.errors ?? {},
    };
  } catch {
    return { lastComputedAt: null, baselines: {}, errors: {} };
  }
}

function shouldRefetch(sub, existing) {
  // Refetch if: never had a baseline, last run errored, or baseline older
  // than BASELINE_STALE_MS. This makes consecutive runs resume partial
  // collections instead of hammering the same IPs that just got 429'd.
  if (!existing.baselines[sub]) return true;
  if (existing.errors[sub]) return true;
  if (!existing.lastComputedAt) return true;
  const ageMs = Date.now() - new Date(existing.lastComputedAt).getTime();
  return ageMs > BASELINE_STALE_MS;
}

function computeSubBaseline(posts) {
  if (posts.length === 0) {
    return {
      median_upvotes: 0,
      mean_upvotes: 0,
      p75_upvotes: 0,
      p90_upvotes: 0,
      median_comments: 0,
      sample_size: 0,
      actual_window_days: 0,
      confidence: "low",
    };
  }

  const upvotes = posts
    .map((p) => (Number.isFinite(p.score) ? p.score : 0))
    .sort((a, b) => a - b);
  const comments = posts
    .map((p) => (Number.isFinite(p.num_comments) ? p.num_comments : 0))
    .sort((a, b) => a - b);

  const now = Math.floor(Date.now() / 1000);
  const oldest = Math.min(
    ...posts.map((p) =>
      typeof p.created_utc === "number" ? p.created_utc : now,
    ),
  );
  const actualWindowDays = Math.min(
    WINDOW_DAYS,
    Math.max(0, Math.floor((now - oldest) / (24 * 60 * 60))),
  );

  return {
    median_upvotes: Math.round(median(upvotes) * 10) / 10,
    mean_upvotes: Math.round(mean(upvotes) * 10) / 10,
    p75_upvotes: Math.round(percentile(upvotes, 75) * 10) / 10,
    p90_upvotes: Math.round(percentile(upvotes, 90) * 10) / 10,
    median_comments: Math.round(median(comments) * 10) / 10,
    sample_size: posts.length,
    actual_window_days: actualWindowDays,
    confidence: classifyConfidence(posts.length),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cutoffUtc = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
  const existing = await loadExistingBaselines();
  // Carry forward prior-run results; this pass only touches subs missing
  // or errored last time.
  const baselines = { ...existing.baselines };
  const errors = {};
  let fetched = 0;
  let skipped = 0;
  let writeNeeded = false;

  for (const sub of SUBREDDITS) {
    if (!shouldRefetch(sub, existing)) {
      skipped += 1;
      log(`skip r/${sub.padEnd(22)} (cached, confidence=${existing.baselines[sub].confidence})`);
      continue;
    }
    try {
      const posts = await fetchSubPosts(sub, cutoffUtc);
      const stats = computeSubBaseline(posts);
      baselines[sub] = stats;
      fetched += 1;
      writeNeeded = true;
      log(
        `ok  r/${sub.padEnd(22)} sample=${String(stats.sample_size).padStart(4)} ` +
          `median=${String(stats.median_upvotes).padStart(6)} ` +
          `p75=${String(stats.p75_upvotes).padStart(6)} ` +
          `p90=${String(stats.p90_upvotes).padStart(6)} ` +
          `conf=${stats.confidence}`,
      );
    } catch (err) {
      errors[sub] = err.message;
      writeNeeded = true;
      log(`err r/${sub} — ${err.message}`);
    }
    await sleep(BASELINE_REQUEST_PAUSE_MS);
  }

  const payload = {
    // Preserve prior lastComputedAt if we skipped everything (nothing to
    // commit); otherwise stamp current run time.
    lastComputedAt: writeNeeded
      ? new Date().toISOString()
      : (existing.lastComputedAt ?? new Date().toISOString()),
    windowDays: WINDOW_DAYS,
    subredditsRequested: SUBREDDITS.length,
    subredditsSucceeded: Object.keys(baselines).length,
    errors,
    baselines,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  log("");
  log(`wrote ${OUT}`);
  log(
    `  this run: fetched=${fetched} skipped(cached)=${skipped} errors=${Object.keys(errors).length}`,
  );
  log(
    `  total baselines: ${Object.keys(baselines).length}/${SUBREDDITS.length}`,
  );
  if (Object.keys(errors).length > 0) {
    log(
      `  re-run \`npm run compute:reddit-baselines\` after 10+ min to fill errored subs`,
    );
  }

  if (Object.keys(baselines).length === 0) {
    throw new Error("every subreddit baseline fetch failed");
  }
}

main().catch((err) => {
  console.error("compute-reddit-baselines failed:", err.message ?? err);
  process.exit(1);
});
