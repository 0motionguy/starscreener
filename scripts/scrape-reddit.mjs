#!/usr/bin/env node
// Scrape Reddit for GitHub repo mentions across AI-adjacent subreddits.
//
// Strategy (inverted fetch): for each tracked subreddit, pull the most
// recent 100 posts once, then scan titles + urls + selftext client-side
// for github.com/<owner>/<name> matches. This is O(subs) requests per
// run instead of O(repos × subs) — the difference between 11 requests
// and thousands.
//
// Auth: uses Reddit's public JSON endpoints. No OAuth, no app registration,
// no client_id required. Reddit gates public JSON only via the User-Agent
// header ("must be descriptive and not a browser default") and soft rate
// limits (~60 req/min anonymous). We stay far under that budget.
//
// If the public endpoint ever starts 429'ing or 403'ing, upgrade to OAuth
// via REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (installed-client grant,
// device_id only, no user password). Hook is TODO at the fetch site.
//
// Output (dual-write, single pass):
//   - data/reddit-mentions.json — repo-linked posts only (/reddit page)
//   - data/reddit-all-posts.json — every scored post (/reddit/trending)
//
// The all-posts file uses merge-mode: each run unions this run's posts
// with the existing file (dedupe by id, keep max score), filters to the
// 7d window, then caps at top 100/sub by trendingScore. Steady-state
// file size ~2-3 MB.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBREDDITS,
  REQUEST_PAUSE_MS,
  sleep,
  fetchRedditJson,
} from "./_reddit-shared.mjs";
import { classifyPost, ensurePostClassification } from "./classify-post.mjs";
import { recentRepoRows } from "./_tracked-repos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const BASELINES_IN = resolve(DATA_DIR, "reddit-baselines.json");
const OUT = resolve(DATA_DIR, "reddit-mentions.json");
const ALL_POSTS_OUT = resolve(DATA_DIR, "reddit-all-posts.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POSTS_PER_SUB = 100;
const WINDOW_DAYS = 7;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const RATE_LIMIT_BACKOFF_MS = 65000;

// All-posts merge mode config.
const ALL_POSTS_TOP_K_PER_SUB = 100;
const SELFTEXT_MAX_CHARS = 500;

const REPO_URL_RE = /github\.com\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function classifyTier(ratio) {
  if (ratio == null) return "no-baseline";
  if (ratio > 10) return "breakout";
  if (ratio > 3) return "above-average";
  if (ratio >= 1) return "normal";
  return "below-average";
}

function computeVelocityFields(score, createdUtc) {
  // age_hours floor at 0.5 — prevents divide-by-zero AND caps velocity on
  // very-young posts whose short-term upvote rate is unreliable.
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  // log10(max(1, score)) dampens pure-velocity wins from tiny posts. A
  // 1-upvote post has log=0, suppressed entirely.
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: Math.round(ageHours * 100) / 100,
    velocity: Math.round(velocity * 100) / 100,
    logMagnitude,
  };
}

function computeBaselineRatio(sub, upvotes, baselines) {
  const b = baselines[sub];
  if (!b || b.sample_size === 0) {
    return { ratio: null, tier: "no-baseline", confidence: null };
  }
  const anchor = b.median_upvotes > 0 ? b.median_upvotes : b.p75_upvotes;
  if (anchor <= 0) {
    return { ratio: null, tier: "no-baseline", confidence: b.confidence };
  }
  const raw = upvotes / anchor;
  const ratio = Math.round(raw * 100) / 100;
  return { ratio, tier: classifyTier(ratio), confidence: b.confidence };
}

async function loadBaselines() {
  try {
    const raw = await readFile(BASELINES_IN, "utf8");
    const parsed = JSON.parse(raw);
    return {
      computedAt: parsed.lastComputedAt,
      baselines: parsed.baselines ?? {},
    };
  } catch {
    return { computedAt: null, baselines: {} };
  }
}

async function loadExistingAllPosts() {
  // Returns an array of previously-scored posts from prior runs, or an
  // empty array on first run / corrupt file. Corrupt files are logged and
  // treated as empty so merge is never a destructive operation.
  try {
    const raw = await readFile(ALL_POSTS_OUT, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.posts)) {
      return parsed.posts.map((post) => ensurePostClassification(post));
    }
    return [];
  } catch (err) {
    if (err.code !== "ENOENT") {
      log(`warn: existing reddit-all-posts.json unreadable — ${err.message}`);
    }
    return [];
  }
}

function stripSelftext(raw) {
  // Drop fenced code blocks and markdown link/image syntax before
  // slicing. Phase 3 keyword TF-IDF shouldn't weight code or URLs.
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SELFTEXT_MAX_CHARS);
}

function mergeAllPosts(existing, thisRun, cutoffSec) {
  // Union by post ID. On collision, keep the entry with higher score
  // (upvote trajectory matters for detecting late-breaking viral posts)
  // but always use this-run's velocity/trendingScore/ageHours since
  // those are time-sensitive.
  const byId = new Map();

  for (const p of existing) {
    if (!p || typeof p.id !== "string") continue;
    if (typeof p.createdUtc !== "number" || p.createdUtc < cutoffSec) continue;
    byId.set(p.id, p);
  }

  for (const p of thisRun) {
    const prev = byId.get(p.id);
    if (!prev || p.score >= prev.score) {
      byId.set(p.id, p);
    } else {
      // Prior run had higher score; keep prior score but refresh timing
      // fields so the post's velocity decays naturally as it ages.
      byId.set(p.id, {
        ...prev,
        ageHours: p.ageHours,
        velocity: p.velocity,
        trendingScore: p.trendingScore,
        baselineRatio: p.baselineRatio,
        baselineTier: p.baselineTier,
        baselineConfidence: p.baselineConfidence,
        content_tags: p.content_tags,
        value_score: p.value_score,
      });
    }
  }

  // Per-sub top-K cap by trendingScore. Keeps the file size bounded at
  // steady state regardless of how many runs have accumulated.
  const bySub = new Map();
  for (const p of byId.values()) {
    const bucket = bySub.get(p.subreddit) ?? [];
    bucket.push(p);
    bySub.set(p.subreddit, bucket);
  }
  const kept = [];
  let prunedOverflow = 0;
  for (const [, bucket] of bySub) {
    bucket.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
    if (bucket.length > ALL_POSTS_TOP_K_PER_SUB) {
      prunedOverflow += bucket.length - ALL_POSTS_TOP_K_PER_SUB;
    }
    kept.push(...bucket.slice(0, ALL_POSTS_TOP_K_PER_SUB));
  }
  // Final sort: global trendingScore desc for stable file ordering.
  kept.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  return {
    posts: kept,
    prunedOverflow,
    prunedOld: Math.max(
      0,
      existing.length -
        Array.from(byId.values()).filter((p) =>
          existing.find((e) => e.id === p.id),
        ).length,
    ),
  };
}

function normalizeFullName(owner, name) {
  // Strip trailing punctuation that shows up when users paste links in
  // markdown ("https://github.com/foo/bar."). Also drop .git suffix.
  let clean = `${owner}/${name}`.toLowerCase();
  clean = clean.replace(/\.git$/i, "");
  clean = clean.replace(/[.,;:!?)\]}]+$/, "");
  return clean;
}

async function loadTrackedRepos() {
  // Union of every owner/name seen in trending.json buckets plus the
  // recent-repos discovery feed. Lowercase-keyed for case-insensitive
  // matching against Reddit links (users write "OpenAI/Gym" and
  // "openai/gym" interchangeably).
  const tracked = new Map(); // lowercase → canonical casing
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
    // recent-repos.json is optional for the Reddit scraper.
  }
  return tracked;
}

async function fetchSubredditNew(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${POSTS_PER_SUB}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const body = await fetchRedditJson(url);
      const children = body?.data?.children;
      if (!Array.isArray(children)) {
        throw new Error(`r/${sub}: malformed response (no data.children)`);
      }
      return children.map((c) => c.data).filter((p) => p && typeof p === "object");
    } catch (err) {
      if (err?.status !== 429 || attempt === 1) throw err;
      log(
        `warn r/${sub} — HTTP 429, sleeping ${RATE_LIMIT_BACKOFF_MS / 1000}s before retry`,
      );
      await sleep(RATE_LIMIT_BACKOFF_MS);
    }
  }
  return [];
}

function extractRepoMentions(post, trackedLower) {
  // Scan title, url, and selftext. Dedupe per-post so a link pasted in both
  // title and body still counts as one mention for that post.
  const hits = new Set();
  const text = `${post.title ?? ""}\n${post.url ?? ""}\n${post.selftext ?? ""}`;
  let match;
  REPO_URL_RE.lastIndex = 0;
  while ((match = REPO_URL_RE.exec(text)) !== null) {
    const full = normalizeFullName(match[1], match[2]);
    // Ignore obvious non-repo paths like github.com/orgs/foo or /settings.
    const [owner] = full.split("/");
    if (!owner || RESERVED_GITHUB_OWNERS.has(owner)) continue;
    if (trackedLower.has(full)) hits.add(full);
  }
  return hits;
}

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tracked = await loadTrackedRepos();
  if (tracked.size === 0) {
    throw new Error(
      "no tracked repos found (data/trending.json missing or empty) — run `npm run scrape` first",
    );
  }
  const { computedAt: baselinesComputedAt, baselines } = await loadBaselines();
  const baselineCount = Object.keys(baselines).length;
  log(`tracked repos: ${tracked.size}`);
  log(
    baselineCount === 0
      ? `baselines: cold (run \`npm run compute:reddit-baselines\` for per-sub normalization)`
      : `baselines: ${baselineCount} subs, computed ${baselinesComputedAt}`,
  );

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - WINDOW_SECONDS;
  const fetchedAt = new Date().toISOString();

  const mentions = new Map(); // lowercase fullName → { posts: Map<id, post> }
  const allPosts = []; // flat list for repo-linked topPosts display
  const allPostsFlat = []; // every scored post (for reddit-all-posts.json)
  let scannedTotal = 0;
  let errors = 0;
  let breakoutCount = 0;
  let aboveAvgCount = 0;

  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchSubredditNew(sub);
      scannedTotal += posts.length;
      let hitsInSub = 0;
      for (const p of posts) {
        if (typeof p.created_utc !== "number") continue;
        if (p.created_utc < cutoff) continue;
        const rawTitle = String(p.title ?? "");
        const rawSelftext = String(p.selftext ?? "");
        const rawUrl = String(p.url ?? "");
        // Compute every scored-post field up-front; the mentions path
        // reuses the same normalized shape but only on posts with hits.
        const hits = extractRepoMentions(p, tracked);
        const canonicalHits = Array.from(hits, (h) => tracked.get(h) ?? h);
        // Primary repo = first matched. When multiple repos are mentioned,
        // the feed card links to the first; per-repo mentions keep full
        // cross-references via the mentions map.
        const primaryRepo = canonicalHits[0] ?? null;
        const subName = String(p.subreddit ?? sub);
        const score = Number.isFinite(p.score) ? p.score : 0;
        const { ratio, tier, confidence } = computeBaselineRatio(
          subName,
          score,
          baselines,
        );
        if (tier === "breakout") breakoutCount += 1;
        else if (tier === "above-average") aboveAvgCount += 1;
        const { ageHours, velocity, logMagnitude } = computeVelocityFields(
          score,
          p.created_utc,
        );
        // Null ratio falls back to 1.0 so no-baseline posts still rank (UI
        // marks them "niche sub"). log10 already handles the score=0 case
        // cleanly — trendingScore collapses to 0 for silent posts.
        const effectiveRatio = ratio ?? 1.0;
        const trendingScore =
          Math.round(velocity * effectiveRatio * logMagnitude * 100) / 100;

        // Content classification runs on the RAW selftext (first 1000 chars)
        // — not the stripped snippet we persist — so rules that look for
        // markdown headers / code fences / shell prompts see the original
        // structure. Attaches to BOTH normalized (so mentions.json chips
        // work on /reddit) and the flatPost (so /reddit/trending filters).
        const classification = classifyPost({
          title: rawTitle,
          selftext: rawSelftext,
          url: rawUrl,
          linkFlairText: p.link_flair_text ?? null,
        });

        const normalized = {
          id: String(p.id),
          subreddit: subName,
          title: rawTitle.slice(0, 300),
          url: rawUrl,
          permalink: p.permalink ? `https://www.reddit.com${p.permalink}` : "",
          score,
          numComments: Number.isFinite(p.num_comments) ? p.num_comments : 0,
          createdUtc: p.created_utc,
          author: String(p.author ?? ""),
          repoFullName: primaryRepo,
          baselineRatio: ratio,
          baselineTier: tier,
          baselineConfidence: confidence,
          ageHours,
          velocity,
          trendingScore,
          content_tags: classification.content_tags,
          value_score: classification.value_score,
        };

        // All-posts shape: same as normalized + selftext snippet + linkedRepos.
        // linkedRepos is an array so Phase 3 (keyword + topic matches) can
        // stack multiple match entries per post without schema change.
        const flatPost = {
          ...normalized,
          selftext: stripSelftext(rawSelftext),
          linkedRepos: canonicalHits.map((fullName) => ({
            fullName,
            matchType: "url",
            confidence: 1.0,
          })),
        };
        allPostsFlat.push(flatPost);

        if (hits.size === 0) continue;
        for (const canonical of canonicalHits) {
          let bucket = mentions.get(canonical);
          if (!bucket) {
            bucket = { posts: new Map() };
            mentions.set(canonical, bucket);
          }
          // Dedupe across subs by post ID; keep max score observed.
          const existing = bucket.posts.get(normalized.id);
          if (!existing || normalized.score > existing.score) {
            bucket.posts.set(normalized.id, {
              ...normalized,
              repoFullName: canonical,
            });
          }
          hitsInSub += 1;
        }
        allPosts.push(normalized);
      }
      log(`ok  r/${sub} — ${posts.length} posts, ${hitsInSub} repo hits`);
    } catch (err) {
      errors += 1;
      log(`err r/${sub} — ${err.message}`);
    }
    await sleep(REQUEST_PAUSE_MS);
  }

  // Build the final shape.
  const mentionsOut = {};
  for (const [fullName, bucket] of mentions) {
    const posts = Array.from(bucket.posts.values()).sort(
      (a, b) => b.score - a.score,
    );
    const upvotes7d = posts.reduce((sum, p) => sum + p.score, 0);
    mentionsOut[fullName] = {
      count7d: posts.length,
      upvotes7d,
      posts,
    };
  }

  // Repo leaderboard: primary-repo attribution only. Per-repo mention buckets
  // above still preserve cross-references for detail views, but the /reddit
  // leaderboard should not give full credit to every co-mentioned repo.
  const leaderboard = Array.from(
    allPosts.reduce((map, post) => {
      if (!post.repoFullName) return map;
      const row = map.get(post.repoFullName) ?? {
        fullName: post.repoFullName,
        count7d: 0,
        upvotes7d: 0,
      };
      row.count7d += 1;
      row.upvotes7d += post.score;
      map.set(post.repoFullName, row);
      return map;
    }, new Map()),
  )
    .map(([, row]) => row)
    .sort((a, b) => {
      if (b.upvotes7d !== a.upvotes7d) return b.upvotes7d - a.upvotes7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

  // Full post set across everything, for tab filters + fallback loaders.
  // Keep the full global feed so "Hot 7d" / "All Mentions" aren't forced to
  // operate on a top-100 trending subset.
  const allPostsOut = allPosts
    .slice()
    .sort((a, b) => {
      if (b.createdUtc !== a.createdUtc) return b.createdUtc - a.createdUtc;
      return b.score - a.score;
    });

  // Top posts across everything, for fast initial page render. Sort by
  // trendingScore desc (velocity × baseline_ratio × log magnitude), cap
  // at 100 so the snapshot stays bounded.
  const topPosts = allPosts
    .slice()
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, 100);

  const payload = {
    fetchedAt,
    cold: mentions.size === 0,
    scannedSubreddits: SUBREDDITS,
    scannedPostsTotal: scannedTotal,
    mentions: mentionsOut,
    allPosts: allPostsOut,
    topPosts,
    leaderboard,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // ---- all-posts merge + write ----
  const existingAllPosts = await loadExistingAllPosts();
  const { posts: mergedAllPosts, prunedOverflow } = mergeAllPosts(
    existingAllPosts,
    allPostsFlat,
    cutoff,
  );
  // Old-posts pruned = prior-run entries that fell out of the 7d window
  // on THIS run. Computed as the set diff of prior IDs vs retained IDs.
  const retainedIds = new Set(mergedAllPosts.map((p) => p.id));
  let prunedOld = 0;
  for (const e of existingAllPosts) {
    if (e && e.id && !retainedIds.has(e.id)) prunedOld += 1;
  }
  const allPostsPayload = {
    lastFetchedAt: fetchedAt,
    scannedSubreddits: SUBREDDITS,
    windowDays: WINDOW_DAYS,
    totalPosts: mergedAllPosts.length,
    prunedOldPosts: prunedOld,
    prunedOverflowPosts: prunedOverflow,
    posts: mergedAllPosts,
  };
  await writeFile(
    ALL_POSTS_OUT,
    JSON.stringify(allPostsPayload, null, 2) + "\n",
    "utf8",
  );

  log("");
  log(`wrote ${OUT}`);
  log(
    `  repos with mentions: ${mentions.size} / posts scanned: ${scannedTotal} / subreddits: ${SUBREDDITS.length} (errors: ${errors})`,
  );
  log(
    `  baseline tiers: breakout=${breakoutCount} above-average=${aboveAvgCount}`,
  );
  log(`wrote ${ALL_POSTS_OUT}`);
  log(
    `  all posts: ${mergedAllPosts.length} total · pruned: ${prunedOld} old + ${prunedOverflow} overflow`,
  );

  if (errors === SUBREDDITS.length) {
    throw new Error("every subreddit fetch failed — check network or UA");
  }
}

main().catch((err) => {
  console.error("scrape-reddit failed:", err.message ?? err);
  process.exit(1);
});
