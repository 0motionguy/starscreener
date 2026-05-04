#!/usr/bin/env node
// Scrape Lobsters for repo mentions.
//
// Lobsters has no official authenticated API. They expose public JSON
// representations of hottest / active / newest feeds as a convenience;
// we use those same endpoints read-only and rate-friendly.
//
// Endpoints (unofficial but community-known):
//   https://lobste.rs/hottest.json
//   https://lobste.rs/active.json
//   https://lobste.rs/newest/page/{1..N}.json
//
// Strategy:
//   - Pull hottest (1 page) + active (1 page) + newest (3 pages) = ~100 stories
//   - Extract github.com/{owner}/{name} matches from story.url + .description
//   - Cross-reference against the tracked-repo set (so we don't badge every
//     random GitHub link — only repos we already know about)
//   - Dual-write: trending snapshot (all stories, velocity-scored) + a
//     mentions file keyed by repo fullName
//
// Cadence: hourly via .github/workflows/scrape-lobsters.yml. Lobsters is
// a small, volunteer-run site — be gentle. One scrape per hour = ~120 HTTP
// requests per day, well under their informal tolerance.
//
// If Lobsters changes / removes the JSON endpoints, the scraper fails loud;
// the app falls back to `lobstersCold = true` and the UI hides the badge.
// We never crash the homepage just because a best-effort feed went dark.
//
// Output:
//   - data/lobsters-trending.json       — stories last 72h, velocity-scored
//   - data/lobsters-mentions.json       — per-repo mention buckets last 7d

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { extractAllRepoMentions, extractUnknownRepoCandidates } from "./_github-repo-links.mjs";
import { loadTrackedReposFromFiles } from "./_tracked-repos.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";

function slugIdFromFullName(fullName) {
  return String(fullName)
    .toLowerCase()
    .replace(/\//g, "--")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const TRENDING_OUT = resolve(DATA_DIR, "lobsters-trending.json");
const MENTIONS_OUT = resolve(DATA_DIR, "lobsters-mentions.json");

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const TRENDING_WINDOW_HOURS = 72;
const MENTIONS_WINDOW_DAYS = 7;
const TRENDING_WINDOW_SECONDS = TRENDING_WINDOW_HOURS * 60 * 60;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;
const NEWEST_PAGES = 3;
const PER_REQUEST_DELAY_MS = 400;

function log(msg) {
  console.log(`[lobsters] ${msg}`);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchLobstersPage(url) {
  return fetchJsonWithRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
    attempts: 3,
    retryDelayMs: 750,
  });
}

// Lobsters's story JSON shape (stable in practice, undocumented in theory):
//   { short_id, created_at, title, url, score, comment_count, user,
//     description, tags, comments_url }
// We keep only the fields we actually use and normalize timestamps.
function normalizeStory(raw, tracked, nowSec) {
  if (!raw || typeof raw !== "object") return null;
  const shortId = String(raw.short_id ?? raw.id ?? "");
  if (!shortId) return null;

  const createdAt = raw.created_at ? Date.parse(raw.created_at) : NaN;
  if (!Number.isFinite(createdAt)) return null;
  const createdUtc = Math.floor(createdAt / 1000);

  const title = String(raw.title ?? "");
  const url = String(raw.url ?? "");
  const description = String(raw.description ?? "");
  const score = Number.isFinite(raw.score) ? raw.score : 0;
  const commentCount = Number.isFinite(raw.comment_count) ? raw.comment_count : 0;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  const user = raw.submitter_user?.username ?? raw.user ?? "";
  const commentsUrl = String(raw.comments_url ?? `https://lobste.rs/s/${shortId}`);

  const ageSec = Math.max(1, nowSec - createdUtc);
  const ageHours = ageSec / 3600;
  // Reddit-style trending score: score / (age_hours + 2)^1.5. Rewards new
  // posts without letting old front-pagers coast forever.
  const trendingScore = score / Math.pow(ageHours + 2, 1.5);

  const blob = `${title}\n${url}\n${description}`;
  const linkedRepos = extractRepoMentions(blob, tracked);

  return {
    shortId,
    title: title.slice(0, 300),
    url,
    commentsUrl,
    by: user,
    score,
    commentCount,
    createdUtc,
    ageHours,
    trendingScore,
    tags,
    description: description.slice(0, 500),
    linkedRepos,
  };
}

function extractRepoMentions(text, tracked) {
  const hits = extractAllRepoMentions(text, tracked);
  return Array.from(hits, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "url",
    confidence: 1.0,
  }));
}

async function main() {
  const tracked = await loadTrackedReposFromFiles({
    trendingPath: TRENDING_IN,
    recentPath: RECENT_IN,
    log,
  });
  if (tracked.size === 0) {
    throw new Error(
      "no tracked repos found (data/trending.json missing or empty) — run `npm run scrape` first",
    );
  }
  log(`tracked repos: ${tracked.size}`);

  const fetchedAt = new Date().toISOString();
  const nowSec = Math.floor(Date.now() / 1000);
  const trendingCutoff = nowSec - TRENDING_WINDOW_SECONDS;
  const mentionsCutoff = nowSec - MENTIONS_WINDOW_SECONDS;

  // ---- Fetch feeds (hottest, active, newest×3) -----------------------------
  const feedUrls = [
    "https://lobste.rs/hottest.json",
    "https://lobste.rs/active.json",
  ];
  for (let i = 1; i <= NEWEST_PAGES; i += 1) {
    feedUrls.push(`https://lobste.rs/newest/page/${i}.json`);
  }

  const seen = new Set();
  const stories = [];
  const unknownsAccumulator = new Set();
  for (const url of feedUrls) {
    try {
      const page = await fetchLobstersPage(url);
      if (!Array.isArray(page)) {
        log(`warn: ${url} returned non-array, skipping`);
        continue;
      }
      for (const raw of page) {
        const norm = normalizeStory(raw, tracked, nowSec);
        if (!norm) continue;
        if (seen.has(norm.shortId)) continue;
        seen.add(norm.shortId);
        stories.push(norm);
        const textBlob = `${String(raw.title ?? "")}\n${String(raw.url ?? "")}\n${String(raw.description ?? "")}`;
        for (const u of extractUnknownRepoCandidates(textBlob, tracked)) {
          unknownsAccumulator.add(u);
        }
      }
      log(`${url} → ${page.length} raw, ${stories.length} total unique`);
    } catch (err) {
      log(`err ${url} — ${err.message ?? err}`);
      // Continue on per-URL failure so one 503 doesn't kill the whole scrape.
    }
    await sleep(PER_REQUEST_DELAY_MS);
  }

  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "lobsters", fullName })),
    );
    log(`unknown candidates: ${unknownsAccumulator.size} (lake: data/unknown-mentions.jsonl)`);
  }

  if (stories.length === 0) {
    throw new Error("no Lobsters stories fetched — all endpoints failed");
  }

  // ---- Trending snapshot (72h window) --------------------------------------
  const trendingStories = stories
    .filter((s) => s.createdUtc >= trendingCutoff)
    .sort((a, b) => b.trendingScore - a.trendingScore);

  // ---- Mentions map (7d window, repo-linked only) --------------------------
  const mentions = {};
  const leaderboardMap = new Map();
  const mentionEligible = stories.filter(
    (s) => s.createdUtc >= mentionsCutoff && s.linkedRepos.length > 0,
  );

  for (const story of mentionEligible) {
    for (const repo of story.linkedRepos) {
      const full = repo.fullName;
      let bucket = mentions[full];
      if (!bucket) {
        bucket = {
          count7d: 0,
          scoreSum7d: 0,
          topStory: null,
          stories: [],
        };
        mentions[full] = bucket;
      }
      bucket.count7d += 1;
      bucket.scoreSum7d += story.score;
      bucket.stories.push(story);

      const lbRow = leaderboardMap.get(full) ?? {
        fullName: full,
        count7d: 0,
        scoreSum7d: 0,
      };
      lbRow.count7d += 1;
      lbRow.scoreSum7d += story.score;
      leaderboardMap.set(full, lbRow);
    }
  }

  for (const bucket of Object.values(mentions)) {
    bucket.stories.sort((a, b) => b.score - a.score);
    const top = bucket.stories[0];
    if (top) {
      bucket.topStory = {
        shortId: top.shortId,
        title: top.title,
        score: top.score,
        url: top.url,
        commentsUrl: top.commentsUrl,
        hoursSincePosted: top.ageHours,
      };
    }
  }

  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
    if (b.scoreSum7d !== a.scoreSum7d) return b.scoreSum7d - a.scoreSum7d;
    if (b.count7d !== a.count7d) return b.count7d - a.count7d;
    return a.fullName.localeCompare(b.fullName);
  });

  // ---- Write ----------------------------------------------------------------
  const trendingPayload = {
    fetchedAt,
    windowHours: TRENDING_WINDOW_HOURS,
    scannedTotal: stories.length,
    stories: trendingStories,
  };
  const mentionsPayload = {
    fetchedAt,
    windowDays: MENTIONS_WINDOW_DAYS,
    scannedStories: stories.length,
    mentions,
    mentionsByRepoId: Object.fromEntries(
      Object.entries(mentions).map(([fullName, value]) => [slugIdFromFullName(fullName), value]),
    ),
    leaderboard,
  };

  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "lobsters", fullName })),
    );
    log(`unknown candidates: ${unknownsAccumulator.size}`);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TRENDING_OUT, JSON.stringify(trendingPayload, null, 2) + "\n", "utf8");
  await writeFile(MENTIONS_OUT, JSON.stringify(mentionsPayload, null, 2) + "\n", "utf8");
  const trendingRedis = await writeDataStore("lobsters-trending", trendingPayload);
  const mentionsRedis = await writeDataStore("lobsters-mentions", mentionsPayload);

  log("");
  log(`wrote ${TRENDING_OUT} [redis: ${trendingRedis.source}]`);
  log(`  stories in ${TRENDING_WINDOW_HOURS}h window: ${trendingStories.length} (scanned ${stories.length})`);
  log(`wrote ${MENTIONS_OUT} [redis: ${mentionsRedis.source}]`);
  log(`  repos with mentions: ${Object.keys(mentions).length} (${leaderboard.length} leaderboard rows)`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // T2.6: metadata sidecar — distinguishes outage from quiet day.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "lobsters",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] lobsters.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-lobsters failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "lobsters",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] lobsters.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { normalizeStory, extractRepoMentions };
