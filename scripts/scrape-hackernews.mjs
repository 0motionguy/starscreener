#!/usr/bin/env node
// Scrape HackerNews for velocity + repo mentions.
//
// Two data sources, one pass:
//   1. Firebase topstories.json → top 500 IDs → fetch each item (~100s).
//      This gives us the hot-right-now set with upvote/comment/time fields.
//   2. Algolia search API (query=github.com, tags=story, last 7d) → up to
//      ~2000 stories that LINK TO github.com in url or story_text. This
//      is the repo-cross-signal set.
//
// Deduped by item ID: any story that appears in BOTH sets (frontpage +
// linked-to-github) gets `everHitFrontPage: true`, the strongest HN signal
// for a repo.
//
// Output (dual-write, single pass):
//   - data/hackernews-trending.json       — velocity-scored stories last 72h
//   - data/hackernews-repo-mentions.json  — repo-linked stories last 7d
//
// Auth: none. Both endpoints are public JSON.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import {
  fetchTopStoryIds,
  fetchItemsBatched,
  searchAlgoliaStories,
} from "./_hn-shared.mjs";
import { classifyPost } from "./classify-post.mjs";
import {
  loadTrackedReposFromFiles,
  recentRepoRows,
} from "./_tracked-repos.mjs";
import {
  extractGithubRepoFullNames,
  extractUnknownRepoCandidates,
  normalizeGithubFullName,
} from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

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
const TRENDING_OUT = resolve(DATA_DIR, "hackernews-trending.json");
const MENTIONS_OUT = resolve(DATA_DIR, "hackernews-repo-mentions.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TRENDING_WINDOW_HOURS = 72;
const MENTIONS_WINDOW_DAYS = 7;
const TRENDING_WINDOW_SECONDS = TRENDING_WINDOW_HOURS * 60 * 60;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;
// Cap the top-story fetch at 500 per mission spec (list has up to 500 IDs).
const TOPSTORIES_FETCH_CAP = 500;
// HN's ACTUAL front page is 30 items. We still fetch 500 for velocity/score
// coverage, but only the top 30 by HN rank earn the `everHitFrontPage`
// flag — top 500 is "in the queue," not "seen by the front-page audience."
// See Sprint 1 audit finding #4.
const FRONT_PAGE_CUTOFF = 30;
const STORY_TEXT_MAX_CHARS = 500;

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

export function normalizeFullName(owner, name) {
  return normalizeGithubFullName(owner, name);
}

export function extractRepoMentions(text, trackedLower) {
  // Scan any text blob for github.com/<owner>/<repo> hits, returning
  // lowercase canonical fullNames restricted to the `trackedLower` set.
  // If `trackedLower` is null/undefined, returns ALL parsed hits.
  return extractAllRepoMentions(text, trackedLower);
}

export function computeVelocityFields(score, createdUtc, nowSec = Math.floor(Date.now() / 1000)) {
  // age_hours floor at 0.5 — prevents divide-by-zero AND caps velocity on
  // very-young stories whose short-term upvote rate is unreliable.
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  // log10(max(1, score)) dampens pure-velocity wins from low-score stories.
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: Math.round(ageHours * 100) / 100,
    velocity: Math.round(velocity * 100) / 100,
    logMagnitude,
  };
}

export function computeTrendingScore(score, createdUtc, descendants, nowSec) {
  // trending = velocity × log10(score) × (1 + descendants/10)
  // Mission spec — comments boost the signal.
  const { velocity, logMagnitude } = computeVelocityFields(score, createdUtc, nowSec);
  const commentBoost = 1 + (Number.isFinite(descendants) ? descendants : 0) / 10;
  return Math.round(velocity * logMagnitude * commentBoost * 100) / 100;
}

export function stripStoryText(raw) {
  // HN story_text arrives as HTML with <p>, <a>, and entity-escaped
  // content. Strip tags, collapse whitespace, decode the minimum
  // entities we need, then truncate.
  if (!raw || typeof raw !== "string") return "";
  const noTags = raw.replace(/<[^>]+>/g, " ");
  const decoded = noTags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
  return decoded.replace(/\s+/g, " ").trim().slice(0, STORY_TEXT_MAX_CHARS);
}

async function loadTrackedRepos() {
  // Union of every owner/name in trending.json + recent-repos.json.
  // Same shape / same loader pattern as scrape-reddit.mjs. Lowercase
  // keys; canonical casing preserved as the value.
  const tracked = new Map();
  try {
    const raw = await readFile(TRENDING_IN, "utf8");
    const trending = JSON.parse(raw);
    for (const langMap of Object.values(trending.buckets ?? {})) {
      for (const rows of Object.values(langMap)) {
        for (const row of rows ?? []) {
          const full = String(row.repo_name ?? "");
          if (!full.includes("/")) continue;
          const lower = full.toLowerCase();
          if (!tracked.has(lower)) tracked.set(lower, full);
        }
      }
    }
  } catch (err) {
    log(`warn: could not read trending.json — ${err.message}`);
  }
  try {
    const raw = await readFile(RECENT_IN, "utf8");
    const recent = JSON.parse(raw);
    const rows = recentRepoRows(recent);
    for (const row of rows) {
      const full = row.repo_name || row.fullName || row.full_name;
      if (!full || typeof full !== "string" || !full.includes("/")) continue;
      const lower = full.toLowerCase();
      if (!tracked.has(lower)) tracked.set(lower, full);
    }
  } catch {
    // recent-repos.json is optional for the HN scraper.
  }
  for (const [lower, full] of (
    await loadTrackedReposFromFiles({
      trendingPath: TRENDING_IN,
      recentPath: RECENT_IN,
      log,
    })
  ).entries()) {
    if (!tracked.has(lower)) tracked.set(lower, full);
  }
  return tracked;
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

export function normalizeFirebaseItem(item, tracked, nowSec, unknownsAccumulator) {
  // Normalize a Firebase /item/{id}.json object into the internal shape
  // we persist. Returns null for items we don't care about (jobs, polls,
  // dead/deleted stories).
  if (!item || item.type !== "story") return null;
  if (item.dead || item.deleted) return null;
  if (typeof item.time !== "number") return null;

  const id = Number(item.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(item.title ?? "");
  const url = String(item.url ?? "");
  // HN self-posts (Ask HN, etc.) put the body in `text`, not `url`.
  const storyText = String(item.text ?? "");
  const score = Number.isFinite(item.score) ? item.score : 0;
  const descendants = Number.isFinite(item.descendants) ? item.descendants : 0;

  const { ageHours, velocity } = computeVelocityFields(score, item.time, nowSec);
  const trendingScore = computeTrendingScore(score, item.time, descendants, nowSec);

  const textBlob = `${title}\n${url}\n${storyText}`;
  const linkedLower = extractRepoMentions(textBlob, tracked);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "url",
    confidence: 1.0,
  }));
  if (unknownsAccumulator) {
    for (const u of extractUnknownRepoCandidates(textBlob, tracked)) {
      unknownsAccumulator.add(u);
    }
  }

  const classification = classifyPost({
    title,
    selftext: storyText,
    url,
    platform: "hn",
  });

  return {
    id,
    title: title.slice(0, 300),
    url,
    by: String(item.by ?? ""),
    score,
    descendants,
    createdUtc: item.time,
    ageHours,
    velocity,
    trendingScore,
    everHitFrontPage: false, // set later when we merge with Algolia set
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    storyText: stripStoryText(storyText),
    linkedRepos,
  };
}

export function normalizeAlgoliaHit(hit, tracked, nowSec, unknownsAccumulator) {
  // Algolia's story object uses different field names than Firebase:
  // objectID (string) vs id (number), points vs score, num_comments vs
  // descendants, created_at_i vs time, story_text vs text.
  if (!hit || typeof hit !== "object") return null;
  const id = Number(hit.objectID);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (typeof hit.created_at_i !== "number") return null;

  const title = String(hit.title ?? "");
  const url = String(hit.url ?? "");
  const storyText = String(hit.story_text ?? "");
  const score = Number.isFinite(hit.points) ? hit.points : 0;
  const descendants = Number.isFinite(hit.num_comments) ? hit.num_comments : 0;

  const { ageHours, velocity } = computeVelocityFields(score, hit.created_at_i, nowSec);
  const trendingScore = computeTrendingScore(score, hit.created_at_i, descendants, nowSec);

  const textBlob = `${title}\n${url}\n${storyText}`;
  const linkedLower = extractRepoMentions(textBlob, tracked);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "url",
    confidence: 1.0,
  }));
  if (unknownsAccumulator) {
    for (const u of extractUnknownRepoCandidates(textBlob, tracked)) {
      unknownsAccumulator.add(u);
    }
  }

  const classification = classifyPost({
    title,
    selftext: storyText,
    url,
    platform: "hn",
  });

  return {
    id,
    title: title.slice(0, 300),
    url,
    by: String(hit.author ?? ""),
    score,
    descendants,
    createdUtc: hit.created_at_i,
    ageHours,
    velocity,
    trendingScore,
    everHitFrontPage: false,
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    storyText: stripStoryText(storyText),
    linkedRepos,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tracked = await loadTrackedRepos();
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

  // F3: accumulate untracked github.com/<owner>/<repo> candidates seen in
  // both passes so the unknown-mentions lake can promote new repos later.
  const unknownsAccumulator = new Set();

  // --------- Firebase: top 500 stories ---------
  log("fetching topstories.json from Firebase…");
  const topIds = await fetchTopStoryIds();
  const cappedIds = topIds.slice(0, TOPSTORIES_FETCH_CAP);
  log(`topstories: ${topIds.length} IDs (capped to ${cappedIds.length})`);

  // Real front-page set: the first FRONT_PAGE_CUTOFF IDs in the ordered
  // topstories response. Anything ranked below that is "in the pipeline,"
  // not "seen on the front page."
  const frontPageIdSet = new Set(cappedIds.slice(0, FRONT_PAGE_CUTOFF));
  log(`fetching ${cappedIds.length} items (batched 5/s, ~${Math.round(cappedIds.length / 5)}s)…`);
  const { items: rawItems, errors: fbErrors } = await fetchItemsBatched(cappedIds, {
    onProgress: ({ done, total }) => {
      if (done % 100 === 0 || done === total) log(`  firebase: ${done}/${total}`);
    },
  });
  log(`firebase: ${rawItems.length} items fetched (errors: ${fbErrors})`);

  // Normalize + filter to 72h window for trending output. Only stories in
  // the top FRONT_PAGE_CUTOFF slots earn the everHitFrontPage flag — the
  // rest of topstories (ranks 31-500) get the velocity/score treatment
  // without the cross-signal boost.
  const trendingStories = [];
  for (const item of rawItems) {
    const n = normalizeFirebaseItem(item, tracked, nowSec, unknownsAccumulator);
    if (!n) continue;
    if (n.createdUtc < trendingCutoff) continue;
    n.everHitFrontPage = frontPageIdSet.has(n.id);
    trendingStories.push(n);
  }

  // --------- Algolia: github.com mentions last 7d ---------
  log(`fetching Algolia search (github.com, last ${MENTIONS_WINDOW_DAYS}d)…`);
  const algoliaHits = await searchAlgoliaStories({
    query: "github.com",
    since: mentionsCutoff,
  });
  log(`algolia: ${algoliaHits.length} hits`);

  const algoliaStories = [];
  for (const hit of algoliaHits) {
    const n = normalizeAlgoliaHit(hit, tracked, nowSec, unknownsAccumulator);
    if (!n) continue;
    if (n.createdUtc < mentionsCutoff) continue;
    // Cross-reference: an Algolia hit currently sitting in the top
    // FRONT_PAGE_CUTOFF slots of topstories gets the flag. Ranks 31-500
    // don't count — see finding #4.
    if (frontPageIdSet.has(n.id)) n.everHitFrontPage = true;
    algoliaStories.push(n);
  }

  // --------- Merge for the trending output: Firebase set ∪ in-window Algolia hits ---------
  // Algolia hits that fall inside the 72h window AND are not already in
  // the Firebase set get added to trending too. Some HN stories that
  // never hit the top-500 frontpage can still have velocity worth
  // surfacing (e.g. late breaking Show HN with 200 points but ranked 600).
  const trendingById = new Map();
  for (const s of trendingStories) trendingById.set(s.id, s);
  for (const s of algoliaStories) {
    if (s.createdUtc < trendingCutoff) continue;
    if (!trendingById.has(s.id)) trendingById.set(s.id, s);
  }
  const trendingMerged = Array.from(trendingById.values()).sort(
    (a, b) => b.trendingScore - a.trendingScore,
  );

  // --------- Build mentions map (repo-linked stories last 7d) ---------
  // Pool both sources, dedupe by ID, restrict to stories with linkedRepos.
  const mentionsById = new Map();
  const addToMentions = (s) => {
    if (!s.linkedRepos || s.linkedRepos.length === 0) return;
    if (s.createdUtc < mentionsCutoff) return;
    const existing = mentionsById.get(s.id);
    if (!existing || s.score >= existing.score) {
      mentionsById.set(s.id, s);
    }
  };
  for (const s of trendingMerged) addToMentions(s); // trending includes in-window Firebase + Algolia
  for (const s of algoliaStories) addToMentions(s); // plus older-than-72h but within-7d Algolia

  const mentions = {}; // fullName → { count7d, scoreSum7d, topStory, everHitFrontPage, stories }
  const leaderboardMap = new Map();
  for (const story of mentionsById.values()) {
    for (const repo of story.linkedRepos) {
      const full = repo.fullName;
      let bucket = mentions[full];
      if (!bucket) {
        bucket = {
          count7d: 0,
          scoreSum7d: 0,
          topStory: null,
          everHitFrontPage: false,
          stories: [],
        };
        mentions[full] = bucket;
      }
      bucket.count7d += 1;
      bucket.scoreSum7d += story.score;
      bucket.stories.push(story);
      if (story.everHitFrontPage) bucket.everHitFrontPage = true;

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

  // Per-repo sort + topStory selection (highest score)
  for (const bucket of Object.values(mentions)) {
    bucket.stories.sort((a, b) => b.score - a.score);
    const top = bucket.stories[0];
    if (top) {
      bucket.topStory = {
        id: top.id,
        title: top.title,
        score: top.score,
        url: top.url,
        hoursSincePosted: top.ageHours,
      };
    }
  }

  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
    if (b.scoreSum7d !== a.scoreSum7d) return b.scoreSum7d - a.scoreSum7d;
    if (b.count7d !== a.count7d) return b.count7d - a.count7d;
    return a.fullName.localeCompare(b.fullName);
  });

  // --------- Write ---------
  const trendingPayload = {
    fetchedAt,
    windowHours: TRENDING_WINDOW_HOURS,
    scannedTotal: rawItems.length + algoliaHits.length,
    firebaseCount: rawItems.length,
    algoliaCount: algoliaHits.length,
    stories: trendingMerged,
  };
  const mentionsPayload = {
    fetchedAt,
    windowDays: MENTIONS_WINDOW_DAYS,
    scannedAlgoliaHits: algoliaHits.length,
    scannedFirebaseItems: rawItems.length,
    mentions,
    mentionsByRepoId: Object.fromEntries(
      Object.entries(mentions).map(([fullName, value]) => [slugIdFromFullName(fullName), value]),
    ),
    leaderboard,
  };

  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "hackernews", fullName })),
    );
    log(`unknown candidates: ${unknownsAccumulator.size}`);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TRENDING_OUT, JSON.stringify(trendingPayload, null, 2) + "\n", "utf8");
  await writeFile(MENTIONS_OUT, JSON.stringify(mentionsPayload, null, 2) + "\n", "utf8");
  const trendingRedis = await writeDataStore("hackernews-trending", trendingPayload);
  const mentionsRedis = await writeDataStore("hackernews-repo-mentions", mentionsPayload);

  log("");
  log(`wrote ${TRENDING_OUT} [redis: ${trendingRedis.source}]`);
  log(`  stories in ${TRENDING_WINDOW_HOURS}h window: ${trendingMerged.length} (firebase=${rawItems.length}, algolia=${algoliaHits.length})`);
  log(`wrote ${MENTIONS_OUT} [redis: ${mentionsRedis.source}]`);
  log(`  repos with mentions: ${Object.keys(mentions).length} (${leaderboard.length} leaderboard rows)`);

  if (rawItems.length === 0 && algoliaHits.length === 0) {
    throw new Error("both Firebase and Algolia returned zero items — check network or API status");
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // T2.6: write data/_meta/hackernews.json after every run so the SRE
  // freshness probe can distinguish "Algolia is down" from "quiet day".
  // The wrapper times the run + classifies the outcome (ok / empty /
  // network_error / partial) and never throws — its failure must not
  // mask the underlying scrape error.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "hackernews",
          count: 1, // success path; precise per-output counts are in the JSONs
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] hackernews.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-hackernews failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "hackernews",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] hackernews.json error-write failed:", metaErr);
      }
      process.exit(1);
    });
}
