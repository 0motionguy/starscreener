#!/usr/bin/env node
// Scrape dev.to for tutorial/writeup mentions of tracked repos + AI/dev
// trending articles.
//
// Two passes, single run:
//   1. Discovery — curated popularity/state/tag slices (global top, rising,
//      fresh, plus AI/dev tags), dedupe by id.
//   2. Body scan — fetch /articles/{id} for each unique id to grab
//      body_markdown. Tutorial posts hide github.com URLs in setup steps,
//      so list-payload `description` (140-char excerpt) misses ~60-70%.
//      Throttled at 5 req/sec. ~80s wall-clock for ~400 articles.
//
// On the second consecutive 429/5xx batch the body pass aborts and we
// fall back to title+description+tag matching for the remainder. The
// payload's `bodyFetchMode` field reports degraded runs.
//
// Output (dual-write):
//   - data/devto-mentions.json  — per-repo article buckets, last 7d
//   - data/devto-trending.json  — top AI/dev articles regardless of repo link
//
// Auth: optional DEVTO_API_KEY env var bumps rate limit. Reads work
// without it.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchArticleList,
  fetchDetailsBatched,
  sleep,
  DEVTO_PAUSE_MS,
} from "./_devto-shared.mjs";
import {
  DEVTO_DISCOVERY_SLICES,
  DEVTO_PRIORITY_TAGS,
  SOURCE_DISCOVERY_VERSION,
} from "./_source-watchers.mjs";
import { recentRepoRows } from "./_tracked-repos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const MENTIONS_OUT = resolve(DATA_DIR, "devto-mentions.json");
const TRENDING_OUT = resolve(DATA_DIR, "devto-trending.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 7;
const PER_PAGE = 100;
const TRENDING_KEEP = 100; // top N for trending file (separate loader)
const DESCRIPTION_TRUNCATE = 280;

const REPO_URL_RE =
  /github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

// Same reserved-owner list as Reddit / HN / Bluesky scrapers.
const RESERVED_GITHUB_OWNERS = new Set([
  "orgs",
  "settings",
  "about",
  "features",
  "pricing",
  "marketplace",
  "collections",
  "trending",
  "topics",
  "search",
  "login",
  "join",
  "sponsors",
  "enterprise",
  "customer-stories",
  "readme",
  "apps",
  "notifications",
]);

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

export function normalizeFullName(owner, name) {
  // Strip ".git" suffix and trailing punctuation in a fixed-point loop
  // so inputs like "bar.git." (a `.git` URL followed by sentence punctuation)
  // collapse all the way down to "bar". Single-pass strip-then-strip leaves
  // the wrong order — see Sprint review finding #2.
  let clean = `${owner}/${name}`.toLowerCase();
  let prev;
  do {
    prev = clean;
    clean = clean.replace(/\.git$/i, "");
    clean = clean.replace(/[.,;:!?)\]}]+$/, "");
  } while (clean !== prev);
  return clean;
}

export function extractRepoMentions(text, trackedLower) {
  const hits = new Set();
  REPO_URL_RE.lastIndex = 0;
  let match;
  while ((match = REPO_URL_RE.exec(text)) !== null) {
    const full = normalizeFullName(match[1], match[2]);
    const [owner] = full.split("/");
    if (!owner || RESERVED_GITHUB_OWNERS.has(owner)) continue;
    if (trackedLower && !trackedLower.has(full)) continue;
    hits.add(full);
  }
  return hits;
}

export function computeTrendingScore(reactions, comments, publishedAtIso, nowMs = Date.now()) {
  // velocity × log10(reactions) × (1 + comments/10), mirroring HN formula.
  const publishedMs = Date.parse(publishedAtIso);
  if (!Number.isFinite(publishedMs)) return 0;
  const ageHours = Math.max(0.5, (nowMs - publishedMs) / (1000 * 60 * 60));
  const velocity = reactions / ageHours;
  const logMag = Math.log10(Math.max(1, reactions));
  const commentBoost = 1 + (Number.isFinite(comments) ? comments : 0) / 10;
  return Math.round(velocity * logMag * commentBoost * 100) / 100;
}

/**
 * Decide which surface a repo URL was found on. Earlier-listed locations
 * win: title > description > tag > body. Used to enrich the badge tooltip
 * ("featured in title vs. linked from body").
 */
export function classifyMentionLocation({ title, description, tags, body, fullNameLower }) {
  const re = new RegExp(
    `github\\.com\\/${fullNameLower.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?![A-Za-z0-9._-])`,
    "i",
  );
  if (title && re.test(title)) return "title";
  if (description && re.test(description)) return "description";
  if (Array.isArray(tags)) {
    const repoName = fullNameLower.split("/")[1] ?? "";
    for (const tag of tags) {
      if (typeof tag === "string" && tag.toLowerCase() === repoName) {
        return "tag";
      }
    }
  }
  if (body && re.test(body)) return "body";
  return "body"; // fallback when match was via raw URL only
}

async function loadTrackedRepos() {
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
  return tracked;
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export function normalizeArticle(raw, { tracked, body, nowMs = Date.now() } = {}) {
  // Normalize a dev.to article (list payload + optional body) into our
  // persistence shape. `body` is body_markdown if available; if null we
  // fall back to description-only repo matching.
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(raw.title ?? "");
  const description = String(raw.description ?? "");
  const url = String(raw.url ?? "");
  const tags = Array.isArray(raw.tag_list)
    ? raw.tag_list.map((t) => String(t).toLowerCase())
    : [];
  const reactions = Number.isFinite(raw.public_reactions_count)
    ? raw.public_reactions_count
    : 0;
  const comments = Number.isFinite(raw.comments_count) ? raw.comments_count : 0;
  const readingTime = Number.isFinite(raw.reading_time_minutes)
    ? raw.reading_time_minutes
    : 0;
  const publishedAt = String(raw.published_at ?? raw.created_at ?? "");
  const author = {
    username: String(raw.user?.username ?? ""),
    name: String(raw.user?.name ?? ""),
    profileImage: String(raw.user?.profile_image_90 ?? raw.user?.profile_image ?? ""),
  };

  const blob = `${title}\n${description}\n${(tags ?? []).join(" ")}\n${body ?? ""}`;
  const linkedLower = extractRepoMentions(blob, tracked ? new Set(tracked.keys()) : null);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked?.get(lower) ?? lower,
    location: classifyMentionLocation({
      title,
      description,
      tags,
      body,
      fullNameLower: lower,
    }),
  }));

  return {
    id,
    title: title.slice(0, 300),
    description: description.slice(0, DESCRIPTION_TRUNCATE),
    url,
    author,
    reactionsCount: reactions,
    commentsCount: comments,
    readingTime,
    publishedAt,
    tags,
    trendingScore: computeTrendingScore(reactions, comments, publishedAt, nowMs),
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
  const nowMs = Date.now();

  // --------- Pass 1: discovery (registry-driven slices, dedupe by id) ---------
  const byId = new Map();
  const sliceCounts = {};
  for (const slice of DEVTO_DISCOVERY_SLICES) {
    const label = slice.label;
    try {
      const list = await fetchArticleList({
        tag: slice.tag,
        top: slice.top,
        state: slice.state,
        perPage: PER_PAGE,
      });
      for (const a of list) {
        if (!a || typeof a.id !== "number") continue;
        if (!byId.has(a.id)) byId.set(a.id, a);
      }
      sliceCounts[slice.id] = list.length;
      log(`  list(${label}): ${list.length} (cumulative unique: ${byId.size})`);
    } catch (err) {
      log(`  list(${label}) FAILED: ${err.message}`);
    }
    await sleep(DEVTO_PAUSE_MS);
  }
  log(`discovery: ${byId.size} unique articles`);

  if (byId.size === 0) {
    throw new Error("dev.to discovery returned zero articles — check network or API status");
  }

  // --------- Pass 2: body fetch ---------
  const ids = Array.from(byId.keys());
  log(`fetching ${ids.length} article bodies (5/s, ~${Math.round(ids.length / 5)}s)…`);
  const { details, errors: bodyErrors, aborted } = await fetchDetailsBatched(ids, {
    onProgress: ({ done, total }) => {
      if (done % 50 === 0 || done === total) log(`  bodies: ${done}/${total}`);
    },
  });
  // "full" = ran to completion. Stray 404s (unpublished mid-run) don't
  // count as degradation. "partial" = aborted via 429/5xx after some
  // success; "description-only" = aborted before any body fetched.
  const bodyFetchMode = !aborted
    ? "full"
    : details.length > 0
      ? "partial"
      : "description-only";
  log(`bodies: ${details.length}/${ids.length} fetched (errors: ${bodyErrors}, mode: ${bodyFetchMode})`);

  const bodyById = new Map();
  for (const d of details) {
    if (d && typeof d.id === "number") {
      bodyById.set(d.id, String(d.body_markdown ?? ""));
    }
  }

  // --------- Normalize ---------
  const normalized = [];
  for (const [id, raw] of byId) {
    const body = bodyById.get(id) ?? null;
    const n = normalizeArticle(raw, { tracked, body, nowMs });
    if (n) normalized.push(n);
  }

  // --------- Build mentions map ---------
  const mentions = {};
  const leaderboardMap = new Map();
  for (const article of normalized) {
    if (!article.linkedRepos.length) continue;
    for (const repo of article.linkedRepos) {
      const full = repo.fullName;
      let bucket = mentions[full];
      if (!bucket) {
        bucket = {
          count7d: 0,
          reactionsSum7d: 0,
          commentsSum7d: 0,
          topArticle: null,
          articles: [],
        };
        mentions[full] = bucket;
      }
      bucket.count7d += 1;
      bucket.reactionsSum7d += article.reactionsCount;
      bucket.commentsSum7d += article.commentsCount;
      bucket.articles.push(article);

      const lb = leaderboardMap.get(full) ?? {
        fullName: full,
        count7d: 0,
        reactionsSum7d: 0,
      };
      lb.count7d += 1;
      lb.reactionsSum7d += article.reactionsCount;
      leaderboardMap.set(full, lb);
    }
  }

  for (const bucket of Object.values(mentions)) {
    bucket.articles.sort((a, b) => b.reactionsCount - a.reactionsCount);
    const top = bucket.articles[0];
    if (top) {
      const ageMs = nowMs - Date.parse(top.publishedAt);
      const hoursSincePosted = Number.isFinite(ageMs)
        ? Math.round((ageMs / 3600000) * 10) / 10
        : null;
      bucket.topArticle = {
        id: top.id,
        title: top.title,
        url: top.url,
        author: top.author.username,
        reactions: top.reactionsCount,
        comments: top.commentsCount,
        hoursSincePosted,
        readingTime: top.readingTime,
      };
    }
  }

  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
    if (b.reactionsSum7d !== a.reactionsSum7d) return b.reactionsSum7d - a.reactionsSum7d;
    if (b.count7d !== a.count7d) return b.count7d - a.count7d;
    return a.fullName.localeCompare(b.fullName);
  });

  // --------- Trending file: top N by trendingScore (regardless of repo link) ---------
  const trendingArticles = normalized
    .slice()
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, TRENDING_KEEP);

  // --------- Write ---------
  const mentionsPayload = {
    fetchedAt,
    discoveryVersion: SOURCE_DISCOVERY_VERSION,
    windowDays: WINDOW_DAYS,
    scannedArticles: normalized.length,
    bodyFetchMode,
    priorityTags: DEVTO_PRIORITY_TAGS,
    discoverySlices: DEVTO_DISCOVERY_SLICES,
    sliceCounts,
    mentions,
    leaderboard,
  };
  const trendingPayload = {
    fetchedAt,
    discoveryVersion: SOURCE_DISCOVERY_VERSION,
    windowDays: WINDOW_DAYS,
    scannedArticles: normalized.length,
    bodyFetchMode,
    priorityTags: DEVTO_PRIORITY_TAGS,
    discoverySlices: DEVTO_DISCOVERY_SLICES,
    sliceCounts,
    articles: trendingArticles,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(MENTIONS_OUT, JSON.stringify(mentionsPayload, null, 2) + "\n", "utf8");
  await writeFile(TRENDING_OUT, JSON.stringify(trendingPayload, null, 2) + "\n", "utf8");

  log("");
  log(`wrote ${MENTIONS_OUT}`);
  log(`  repos with mentions: ${Object.keys(mentions).length} (${leaderboard.length} leaderboard rows)`);
  log(`wrote ${TRENDING_OUT}`);
  log(
    `  trending articles: ${trendingArticles.length} ` +
      `(mode: ${bodyFetchMode}, slices: ${DEVTO_DISCOVERY_SLICES.length}, tags: ${DEVTO_PRIORITY_TAGS.length})`,
  );
}

// Direct-run guard: must require argv[1] to be a non-empty path. The naive
// `endsWith(argv[1] ?? "")` returns true on `endsWith("")` so importing
// the module via `node --input-type=module` (no argv[1]) auto-runs main().
// Sprint review finding #1.
const argv1 = process.argv[1];
const isDirectRun =
  Boolean(argv1) &&
  (import.meta.url === `file://${argv1}` ||
    import.meta.url.endsWith(argv1.replace(/\\/g, "/")));

if (isDirectRun) {
  main().catch((err) => {
    console.error("scrape-devto failed:", err.message ?? err);
    process.exit(1);
  });
}
