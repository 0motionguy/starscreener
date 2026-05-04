#!/usr/bin/env node
// Scrape Bluesky (AT Protocol) for repo mentions + AI topic-family trending.
//
// Two passes, one authenticated session:
//   1. Repo-mentions pass — searchPosts(q="github.com", sort=latest) up to
//      3 pages × 100 posts. Every github.com/<owner>/<repo> hit gets
//      matched against tracked repos (union of trending.json +
//      recent-repos.json) and bucketed by fullName.
//   2. Topic-trending pass — run a curated set of AI-dev query families
//      (agents, LLMs, coding agents, MCP, RAG, workflow, prompts/memory,
//      skills, open source AI) through searchPosts(sort=top, limit=50).
//      Deduped by at:// URI across queries and scored by likes + 2×reposts
//      + 0.5×replies.
//
// Output (dual-write, single pass):
//   - data/bluesky-mentions.json  — per-repo mention buckets, last 7d
//   - data/bluesky-trending.json  — top-engagement posts across AI query
//                                   families + per-family metadata
//
// Auth: BLUESKY_HANDLE + BLUESKY_APP_PASSWORD from env. Session is fresh
// each run — access JWT lives ~2h so refresh complexity is unnecessary
// for an hourly cron.
//
// Exits non-zero on any transport error; GHA should mark the run failed
// so the previously committed JSON remains the live view.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./_load-env.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import {
  createSession,
  searchPostsAllPages,
  deriveBskyUrl,
  collectPostUrls,
  BlueskyRateLimitError,
} from "./_bluesky-shared.mjs";
import { classifyPost } from "./classify-post.mjs";
import {
  BLUESKY_QUERY_FAMILIES,
  BLUESKY_TRENDING_QUERIES,
  SOURCE_DISCOVERY_VERSION,
} from "./_source-watchers.mjs";
import {
  loadTrackedReposFromFiles,
  recentRepoRows,
} from "./_tracked-repos.mjs";
import {
  extractAllRepoMentions,
  extractUnknownRepoCandidates,
  normalizeGithubFullName,
} from "./_github-repo-links.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const MENTIONS_OUT = resolve(DATA_DIR, "bluesky-mentions.json");
const TRENDING_OUT = resolve(DATA_DIR, "bluesky-trending.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MENTIONS_WINDOW_DAYS = 7;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;

const REPO_QUERY = "github.com";
const REPO_MAX_PAGES = 3;
const REPO_PAGE_LIMIT = 100;

// Curated query slices. Bluesky behaves more like search/feed/list territory
// than subreddit-style channels, so coverage lives in query families rather
// than one monolithic keyword list.
//
// QUERY_LIMIT lowered from 50 → 30 (T3.5): bluesky-trending.json was ~1.2 MB
// at 50 posts/family, hurting first-paint on 3G. 30 keeps the top of each
// family well-covered while bringing the output under ~720 KB. If a family's
// long tail starts to matter, raise in increments of 5 and re-measure the
// JSON size before merging.
const QUERY_LIMIT = 30;

const POST_TEXT_MAX_CHARS = 500;

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
  for (const u of extractUnknownRepoCandidates(text, trackedLower)) {
    unknownsAccumulator.add(u);
  }
  return extractAllRepoMentions(text, trackedLower);
}

/**
 * trending_score = likes + 2·reposts + 0.5·replies.
 * Weights reward shareability (repost) over passive signals (like) and
 * give replies partial credit since they often signal discussion vs noise.
 */
export function computeTrendingScore(likeCount, repostCount, replyCount) {
  const l = Number.isFinite(likeCount) ? likeCount : 0;
  const r = Number.isFinite(repostCount) ? repostCount : 0;
  const c = Number.isFinite(replyCount) ? replyCount : 0;
  return Math.round((l + 2 * r + 0.5 * c) * 100) / 100;
}

export function stripPostText(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, POST_TEXT_MAX_CHARS);
}

async function loadTrackedRepos() {
  // Union of every owner/name in trending.json + recent-repos.json. Same
  // contract as scrape-hackernews.mjs / scrape-reddit.mjs. Lowercase keys;
  // canonical casing preserved as value.
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
    // recent-repos.json is optional.
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

/**
 * Normalize one `app.bsky.feed.defs#postView` into the internal shape we
 * persist. Returns null for posts we can't consume (missing uri/cid, bad
 * createdAt, etc.).
 *
 * The incoming shape is AT Protocol's post view:
 *   { uri, cid, author: { did, handle, displayName }, record: { text,
 *     createdAt, facets? }, embed?, likeCount?, repostCount?, replyCount?,
 *     indexedAt }
 */
export function normalizePost(post, tracked, nowSec) {
  if (!post || typeof post !== "object") return null;
  if (typeof post.uri !== "string" || !post.uri) return null;
  if (typeof post.cid !== "string" || !post.cid) return null;

  const record = (post.record && typeof post.record === "object") ? post.record : {};
  const createdIso =
    typeof record.createdAt === "string"
      ? record.createdAt
      : typeof post.indexedAt === "string"
        ? post.indexedAt
        : null;
  if (!createdIso) return null;
  const createdMs = Date.parse(createdIso);
  if (!Number.isFinite(createdMs)) return null;
  const createdUtc = Math.floor(createdMs / 1000);

  const text = typeof record.text === "string" ? record.text : "";
  const embedUrls = collectPostUrls(post);
  const textBlob = `${text}\n${embedUrls.join("\n")}`;

  const linkedLower = extractRepoMentions(textBlob, tracked);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: "url",
    confidence: 1.0,
  }));

  const classification = classifyPost({
    title: text.slice(0, 140),
    selftext: text,
    url: embedUrls[0] ?? "",
    // classify-post.mjs only differentiates "hn" vs "reddit"; passing
    // "bsky" falls back to the generic reddit ruleset which is what we want
    // (no Show HN / Ask HN prefix detection for Bluesky).
    platform: "bsky",
  });

  const likeCount = Number.isFinite(post.likeCount) ? post.likeCount : 0;
  const repostCount = Number.isFinite(post.repostCount) ? post.repostCount : 0;
  const replyCount = Number.isFinite(post.replyCount) ? post.replyCount : 0;

  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const trendingScore = computeTrendingScore(likeCount, repostCount, replyCount);

  const authorHandle = String(post.author?.handle ?? "");
  const authorDisplay = String(post.author?.displayName ?? "");

  return {
    uri: post.uri,
    cid: post.cid,
    bskyUrl: deriveBskyUrl(post.uri, authorHandle || post.author?.did),
    text: stripPostText(text),
    author: {
      handle: authorHandle,
      displayName: authorDisplay || undefined,
    },
    likeCount,
    repostCount,
    replyCount,
    createdAt: createdIso,
    createdUtc,
    ageHours: Math.round(ageHours * 100) / 100,
    trendingScore,
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    linkedRepos,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    throw new Error(
      "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set (GHA secrets + Vercel env)",
    );
  }

  const tracked = await loadTrackedRepos();
  if (tracked.size === 0) {
    throw new Error(
      "no tracked repos found (data/trending.json missing or empty) — run `npm run scrape` first",
    );
  }
  log(`tracked repos: ${tracked.size}`);

  log(`authenticating as ${handle}…`);
  const session = await createSession(handle, password);
  const didSnippet = String(session.did ?? "").slice(0, 28);
  log(`  authenticated — did=${didSnippet}… handle=${session.handle}`);

  const fetchedAt = new Date().toISOString();
  const nowSec = Math.floor(Date.now() / 1000);
  const mentionsCutoff = nowSec - MENTIONS_WINDOW_SECONDS;

  // --------- Repo-mentions pass ---------
  log(`searching "${REPO_QUERY}" (up to ${REPO_MAX_PAGES} × ${REPO_PAGE_LIMIT} posts, sort=latest)…`);
  let rawMentionPosts = [];
  let mentionsPagesFetched = 0;
  let mentionsRateLimit = null;
  try {
    const res = await searchPostsAllPages({
      accessJwt: session.accessJwt,
      q: REPO_QUERY,
      sort: "latest",
      limit: REPO_PAGE_LIMIT,
      maxPages: REPO_MAX_PAGES,
    });
    rawMentionPosts = res.posts;
    mentionsPagesFetched = res.pagesFetched;
    mentionsRateLimit = res.lastRateLimit;
  } catch (err) {
    if (err instanceof BlueskyRateLimitError) {
      log(`  rate-limited during mentions pass: ${err.message}`);
      throw err;
    }
    throw err;
  }
  log(
    `  fetched ${rawMentionPosts.length} posts in ${mentionsPagesFetched} pages ` +
      `(rl remaining=${mentionsRateLimit?.remaining ?? "?"}, ` +
      `limit=${mentionsRateLimit?.limit ?? "?"})`,
  );

  // --------- Topic-trending pass ---------
  const trendingByUri = new Map();
  const keywordCounts = Object.fromEntries(
    BLUESKY_QUERY_FAMILIES.map((family) => [family.label, 0]),
  );
  const queryCounts = {};
  for (const queryDef of BLUESKY_TRENDING_QUERIES) {
    const { familyId, familyLabel, query } = queryDef;
    try {
      log(`searching [${familyLabel}] ${query} (sort=top, limit=${QUERY_LIMIT})…`);
      const res = await searchPostsAllPages({
        accessJwt: session.accessJwt,
        q: query,
        sort: "top",
        limit: QUERY_LIMIT,
        maxPages: 1,
      });
      log(
        `  ${res.posts.length} posts ` +
          `(rl remaining=${res.lastRateLimit?.remaining ?? "?"})`,
      );
      queryCounts[query] = res.posts.length;
      keywordCounts[familyLabel] =
        (keywordCounts[familyLabel] ?? 0) + res.posts.length;
      for (const raw of res.posts) {
        const n = normalizePost(raw, tracked, nowSec);
        if (!n) continue;
        if (trendingByUri.has(n.uri)) continue;
        n.matchedKeyword = familyLabel;
        n.matchedQuery = query;
        n.matchedTopicId = familyId;
        n.matchedTopicLabel = familyLabel;
        trendingByUri.set(n.uri, n);
      }
    } catch (err) {
      if (err instanceof BlueskyRateLimitError) {
        log(`  rate-limited on "${query}" — stopping query loop early`);
        break;
      }
      throw err;
    }
  }

  // --------- Bucket mentions by repo ---------
  const normalizedMentionPosts = [];
  for (const raw of rawMentionPosts) {
    const n = normalizePost(raw, tracked, nowSec);
    if (!n) continue;
    if (n.createdUtc < mentionsCutoff) continue;
    if (!n.linkedRepos || n.linkedRepos.length === 0) continue;
    normalizedMentionPosts.push(n);
  }

  const dedupedByUri = new Map();
  for (const p of normalizedMentionPosts) {
    if (!dedupedByUri.has(p.uri)) dedupedByUri.set(p.uri, p);
  }

  const mentions = {};
  const leaderboardMap = new Map();
  for (const post of dedupedByUri.values()) {
    for (const repo of post.linkedRepos) {
      const full = repo.fullName;
      let bucket = mentions[full];
      if (!bucket) {
        bucket = {
          count7d: 0,
          likesSum7d: 0,
          repostsSum7d: 0,
          repliesSum7d: 0,
          topPost: null,
          posts: [],
        };
        mentions[full] = bucket;
      }
      bucket.count7d += 1;
      bucket.likesSum7d += post.likeCount;
      bucket.repostsSum7d += post.repostCount;
      bucket.repliesSum7d += post.replyCount;
      bucket.posts.push(post);

      const lbRow = leaderboardMap.get(full) ?? {
        fullName: full,
        count7d: 0,
        likesSum7d: 0,
      };
      lbRow.count7d += 1;
      lbRow.likesSum7d += post.likeCount;
      leaderboardMap.set(full, lbRow);
    }
  }

  for (const bucket of Object.values(mentions)) {
    // Rank posts by likes (primary) then reposts (tie-break).
    bucket.posts.sort((a, b) => {
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      return b.repostCount - a.repostCount;
    });
    const top = bucket.posts[0];
    if (top) {
      bucket.topPost = {
        uri: top.uri,
        cid: top.cid,
        bskyUrl: top.bskyUrl,
        text: top.text,
        author: top.author,
        likeCount: top.likeCount,
        repostCount: top.repostCount,
        replyCount: top.replyCount,
        createdAt: top.createdAt,
        hoursSincePosted: top.ageHours,
      };
    }
  }

  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
    if (b.likesSum7d !== a.likesSum7d) return b.likesSum7d - a.likesSum7d;
    if (b.count7d !== a.count7d) return b.count7d - a.count7d;
    return a.fullName.localeCompare(b.fullName);
  });

  // --------- Trending output ---------
  const trendingMerged = Array.from(trendingByUri.values()).sort(
    (a, b) => b.trendingScore - a.trendingScore,
  );

  // --------- Write ---------
  const mentionsPayload = {
    fetchedAt,
    windowDays: MENTIONS_WINDOW_DAYS,
    scannedPosts: rawMentionPosts.length,
    searchQuery: REPO_QUERY,
    pagesFetched: mentionsPagesFetched,
    mentions,
    mentionsByRepoId: Object.fromEntries(
      Object.entries(mentions).map(([fullName, value]) => [slugIdFromFullName(fullName), value]),
    ),
    leaderboard,
  };
  const trendingPayload = {
    fetchedAt,
    discoveryVersion: SOURCE_DISCOVERY_VERSION,
    keywords: BLUESKY_QUERY_FAMILIES.map((family) => family.label),
    keywordCounts,
    queries: BLUESKY_TRENDING_QUERIES.map((item) => item.query),
    queryCounts,
    queryFamilies: BLUESKY_QUERY_FAMILIES,
    scannedPosts: Array.from(trendingByUri.values()).length,
    posts: trendingMerged,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    MENTIONS_OUT,
    JSON.stringify(mentionsPayload, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    TRENDING_OUT,
    JSON.stringify(trendingPayload, null, 2) + "\n",
    "utf8",
  );
  const mentionsRedis = await writeDataStore("bluesky-mentions", mentionsPayload);
  const trendingRedis = await writeDataStore("bluesky-trending", trendingPayload);

  log("");
  log(`wrote ${MENTIONS_OUT} [redis: ${mentionsRedis.source}]`);
  log(`  repos with mentions: ${Object.keys(mentions).length} (${leaderboard.length} leaderboard rows)`);
  log(`wrote ${TRENDING_OUT} [redis: ${trendingRedis.source}]`);
  log(
    `  trending posts: ${trendingMerged.length} across ` +
      `${BLUESKY_TRENDING_QUERIES.length} queries / ${BLUESKY_QUERY_FAMILIES.length} topic families`,
  );

  if (rawMentionPosts.length === 0 && trendingByUri.size === 0) {
    throw new Error(
      "both mentions + trending returned zero posts — check auth or API status",
    );
  }

  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "bluesky", fullName })),
    );
    log(`unknown candidates: ${unknownsAccumulator.size} (lake: data/unknown-mentions.jsonl)`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  // T2.6: same metadata-sidecar pattern as scrape-hackernews — lets the
  // SRE freshness probe distinguish Bluesky outage from a quiet day.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "bluesky",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] bluesky.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-bluesky failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "bluesky",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] bluesky.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}
