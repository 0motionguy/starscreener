#!/usr/bin/env node
// Scrape Reddit for GitHub repo mentions across AI-adjacent subreddits.
//
// Strategy (inverted fetch): for each tracked subreddit, pull the most
// recent 100 posts once, then scan titles + urls + selftext client-side
// for github.com/<owner>/<name> matches. This is O(subs) requests per
// run instead of O(repos × subs) — the difference between 11 requests
// and thousands.
//
// Auth: prefers Reddit OAuth when REDDIT_CLIENT_ID is present, then falls
// back to the public JSON host if the OAuth path fails. That keeps the
// source alive when Reddit changes auth behavior or a secret breaks, while
// still preferring the more reliable authenticated path in production.
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
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import "./_load-env.mjs";
import {
  SUBREDDITS,
  REQUEST_PAUSE_MS,
  GENERIC_TERMS,
  sleep,
  fetchRedditJson,
  getRedditFetchRuntime,
  getRedditAuthMode,
} from "./_reddit-shared.mjs";
import { classifyPost, ensurePostClassification } from "./classify-post.mjs";
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
const REPO_METADATA_IN = resolve(DATA_DIR, "repo-metadata.json");
const NPM_PACKAGES_IN = resolve(DATA_DIR, "npm-packages.json");
const NPM_MANUAL_PACKAGES_IN = resolve(DATA_DIR, "npm-manual-packages.json");
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

const IDENTIFIER_SPLIT_RE = /([a-z0-9])([A-Z])/g;
const MATCH_TYPE_PRIORITY = {
  url: 5,
  repo_slug: 4,
  package_name: 4,
  homepage_domain: 4,
  repo_name: 3,
  project_name: 3,
  owner_context: 2,
};
const ALLOWED_SINGLE_DISTINCTIVE_PROJECT_NAMES = new Set([
  "claude code",
  "hermes agent",
  "kimi cli",
  "qwen code",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function splitIdentifier(value) {
  return String(value ?? "")
    .replace(IDENTIFIER_SPLIT_RE, "$1 $2")
    .replace(/[@_.:/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTerm(value) {
  return splitIdentifier(value).toLowerCase();
}

export function humanizeRepoName(repoName) {
  return splitIdentifier(repoName)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isDistinctivePhrase(value) {
  const normalized = normalizeTerm(value);
  if (normalized.length < 4) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const distinctiveTokens = tokens.filter(
    (token) => token.length >= 4 && !GENERIC_TERMS.has(token),
  );
  return distinctiveTokens.length > 0;
}

function distinctiveTokenCount(value) {
  return normalizeTerm(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !GENERIC_TERMS.has(token)).length;
}

function isSafeProjectPhrase(value) {
  const normalized = normalizeAliasKey(value);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  if (distinctiveTokenCount(value) >= 2) return true;
  return ALLOWED_SINGLE_DISTINCTIVE_PROJECT_NAMES.has(normalized);
}

function normalizeAliasKey(value) {
  return normalizeTerm(value).replace(/\s+/g, " ");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLooseBoundaryRegex(value) {
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegex(String(value).toLowerCase())}(?=$|[^a-z0-9])`,
    "i",
  );
}

function buildPhraseRegex(value) {
  const tokens = normalizeTerm(value).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  return new RegExp(
    `(^|[^a-z0-9])${tokens.map((token) => escapeRegex(token)).join("\\s+")}(?=$|[^a-z0-9])`,
    "i",
  );
}

function normalizeHostname(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "github.com" || host.endsWith(".github.com")) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

function buildDomainRegex(hostname) {
  const escaped = escapeRegex(String(hostname).toLowerCase());
  return new RegExp(
    `(^|[^a-z0-9])(?:https?:\\/\\/)?(?:www\\.)?${escaped}(?=$|[\\/:?&#\\s])`,
    "i",
  );
}

function buildOwnerContextRegex(ownerToken, repoToken, reverse = false) {
  const left = escapeRegex(String(reverse ? repoToken : ownerToken).toLowerCase());
  const right = escapeRegex(String(reverse ? ownerToken : repoToken).toLowerCase());
  return new RegExp(
    `(^|[^a-z0-9])${left}(?:\\s+[a-z0-9][a-z0-9+._-]{1,20}){0,2}\\s+${right}(?=$|[^a-z0-9])`,
    "i",
  );
}

function matchComparator(a, b) {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  const aPriority = MATCH_TYPE_PRIORITY[a.matchType] ?? 0;
  const bPriority = MATCH_TYPE_PRIORITY[b.matchType] ?? 0;
  if (bPriority !== aPriority) return bPriority - aPriority;
  return a.fullName.localeCompare(b.fullName);
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

async function loadRepoMetadataByFullName() {
  try {
    const raw = await readFile(REPO_METADATA_IN, "utf8");
    const parsed = JSON.parse(raw);
    const byFullName = new Map();
    for (const item of parsed.items ?? []) {
      const fullName = String(item?.fullName ?? "").trim();
      if (!fullName.includes("/")) continue;
      byFullName.set(fullName.toLowerCase(), item);
    }
    return byFullName;
  } catch {
    return new Map();
  }
}

async function loadNpmPackagesByRepo() {
  const byRepo = new Map();
  for (const inputPath of [NPM_PACKAGES_IN, NPM_MANUAL_PACKAGES_IN]) {
    try {
      const raw = await readFile(inputPath, "utf8");
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed?.packages) ? parsed.packages : [];
      for (const row of rows) {
        const linkedRepo = String(row?.linkedRepo ?? "").trim();
        if (!linkedRepo.includes("/")) continue;
        const key = linkedRepo.toLowerCase();
        const bucket = byRepo.get(key) ?? [];
        bucket.push(row);
        byRepo.set(key, bucket);
      }
    } catch {
      // npm package snapshots are optional in first-run local dev.
    }
  }
  return byRepo;
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

export function mergeAllPosts(existing, thisRun, cutoffSec) {
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
        repoFullName: p.repoFullName,
        linkedRepos: p.linkedRepos,
        selftext: p.selftext,
        title: p.title,
        url: p.url,
        permalink: p.permalink,
        numComments: Math.max(prev.numComments ?? 0, p.numComments ?? 0),
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

export function scrubStaleProjectNameLinks(posts, aliasMatchers) {
  const currentProjectNameRepos = new Set(
    aliasMatchers
      .filter((matcher) => matcher.matchType === "project_name")
      .map((matcher) => matcher.fullName.toLowerCase()),
  );

  return posts.map((post) => {
    if (!Array.isArray(post?.linkedRepos) || post.linkedRepos.length === 0) {
      return post;
    }

    const linkedRepos = post.linkedRepos.filter((match) => {
      if (match?.matchType !== "project_name") return true;
      return currentProjectNameRepos.has(
        String(match.fullName ?? "").toLowerCase(),
      );
    });

    if (linkedRepos.length === post.linkedRepos.length) return post;
    return {
      ...post,
      repoFullName: linkedRepos[0]?.fullName,
      linkedRepos,
    };
  });
}

export function normalizeFullName(owner, name) {
  return normalizeGithubFullName(owner, name);
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

function buildOwnerContextTokens(owner) {
  const normalized = normalizeTerm(owner);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const out = new Set();
  const collapsed = normalized.replace(/\s+/g, "");
  if (collapsed.length >= 4 && !GENERIC_TERMS.has(collapsed)) out.add(collapsed);
  const first = tokens[0];
  if (first && first.length >= 4 && !GENERIC_TERMS.has(first)) out.add(first);
  return Array.from(out);
}

function addAliasCandidate(out, fullName, matchType, alias, confidence, extra = {}) {
  const rawAlias = String(alias ?? "").trim();
  if (!rawAlias) return;
  out.push({
    fullName,
    matchType,
    alias: rawAlias,
    confidence,
    ...extra,
  });
}

function buildAliasCandidatesForRepo(fullName, metadata, npmRows) {
  const [owner, fallbackRepoName] = fullName.split("/", 2);
  const repoName = String(metadata?.name ?? fallbackRepoName ?? "").trim();
  const candidates = [];

  addAliasCandidate(candidates, fullName, "repo_slug", fullName, 0.98);

  const repoNameDistinctive = isDistinctivePhrase(repoName);
  const repoNameHasStrongShape = /[-_.]/.test(repoName) || /\d/.test(repoName);
  if (repoNameDistinctive && repoNameHasStrongShape) {
    addAliasCandidate(candidates, fullName, "repo_name", repoName, 0.95);
  }

  const humanizedRepo = humanizeRepoName(repoName);
  const humanizedTokens = normalizeTerm(humanizedRepo).split(" ").filter(Boolean);
  if (
    humanizedTokens.length >= 2 &&
    isDistinctivePhrase(humanizedRepo) &&
    isSafeProjectPhrase(humanizedRepo)
  ) {
    addAliasCandidate(candidates, fullName, "project_name", humanizedRepo, 0.93);
  } else if (repoNameDistinctive && humanizedTokens.length === 1) {
    const repoToken = humanizedTokens[0];
    const ownerTokens = buildOwnerContextTokens(owner).filter(
      (token) => token !== repoToken,
    );
    if (ownerTokens.length > 0) {
      addAliasCandidate(
        candidates,
        fullName,
        "owner_context",
        repoToken,
        0.9,
        { ownerTokens },
      );
    }
  }

  for (const row of npmRows ?? []) {
    const packageName = String(row?.name ?? "").trim();
    if (!packageName) continue;
    addAliasCandidate(candidates, fullName, "package_name", packageName, 0.97);
    const homepageHost = normalizeHostname(row?.homepage);
    if (homepageHost) {
      addAliasCandidate(
        candidates,
        fullName,
        "homepage_domain",
        homepageHost,
        0.94,
      );
    }
  }

  const homepageHost = normalizeHostname(metadata?.homepageUrl);
  if (homepageHost) {
    addAliasCandidate(candidates, fullName, "homepage_domain", homepageHost, 0.94);
  }

  return candidates;
}

function createAliasMatcher(candidate) {
  if (candidate.matchType === "homepage_domain") {
    return {
      ...candidate,
      regex: buildDomainRegex(candidate.alias),
    };
  }
  if (candidate.matchType === "project_name") {
    return {
      ...candidate,
      regex: buildPhraseRegex(candidate.alias),
    };
  }
  if (candidate.matchType === "owner_context") {
    return {
      ...candidate,
      contextRegexes: (candidate.ownerTokens ?? []).flatMap((token) => [
        buildOwnerContextRegex(token, candidate.alias, false),
        buildOwnerContextRegex(token, candidate.alias, true),
      ]),
    };
  }
  return {
    ...candidate,
    regex: buildLooseBoundaryRegex(candidate.alias),
  };
}

export function buildRepoAliasMatchers(
  tracked,
  metadataByFullName = new Map(),
  npmPackagesByRepo = new Map(),
) {
  const buckets = new Map();

  for (const [lowerFullName, canonicalFullName] of tracked.entries()) {
    const metadata = metadataByFullName.get(lowerFullName) ?? null;
    const npmRows = npmPackagesByRepo.get(lowerFullName) ?? [];
    const candidates = buildAliasCandidatesForRepo(
      canonicalFullName,
      metadata,
      npmRows,
    );
    for (const candidate of candidates) {
      const key =
        candidate.matchType === "owner_context"
          ? `${candidate.matchType}:${normalizeAliasKey(candidate.alias)}:${(candidate.ownerTokens ?? []).map((token) => normalizeAliasKey(token)).sort().join("|")}`
          : `${candidate.matchType}:${normalizeAliasKey(candidate.alias)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(candidate);
      buckets.set(key, bucket);
    }
  }

  const matchers = [];
  for (const bucket of buckets.values()) {
    const uniqueRepos = new Set(bucket.map((entry) => entry.fullName.toLowerCase()));
    if (uniqueRepos.size !== 1) continue;
    bucket.sort((a, b) => b.confidence - a.confidence);
    const matcher = createAliasMatcher(bucket[0]);
    if (
      (matcher.matchType === "owner_context" &&
        matcher.contextRegexes.length === 0) ||
      (matcher.matchType !== "owner_context" && !matcher.regex)
    ) {
      continue;
    }
    matchers.push(matcher);
  }

  matchers.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aPriority = MATCH_TYPE_PRIORITY[a.matchType] ?? 0;
    const bPriority = MATCH_TYPE_PRIORITY[b.matchType] ?? 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    return a.alias.localeCompare(b.alias);
  });
  return matchers;
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

export function extractRepoMentions(post, trackedLower, aliasMatchers = []) {
  // Scan title, url, and selftext. Dedupe per-post so a link pasted in both
  // title and body still counts as one mention for that post. Alias matchers
  // extend beyond raw GitHub URLs but are kept exact + repo-unique only.
  const hits = new Map();
  const remember = (fullName, matchType, confidence) => {
    const canonical =
      trackedLower instanceof Map
        ? trackedLower.get(fullName)
        : trackedLower.has(fullName)
          ? fullName
          : null;
    if (!canonical) return;
    const key = canonical.toLowerCase();
    const existing = hits.get(key);
    if (!existing || confidence > existing.confidence) {
      hits.set(key, { fullName: canonical, matchType, confidence });
    }
  };
  const text = `${post.title ?? ""}\n${post.url ?? ""}\n${post.selftext ?? ""}`;
  for (const u of extractUnknownRepoCandidates(text, trackedLower)) {
    unknownsAccumulator.add(u);
  }
  for (const full of extractAllRepoMentions(text, trackedLower)) {
    remember(full, "url", 1.0);
  }

  const lowered = text.toLowerCase();
  for (const matcher of aliasMatchers) {
    if (matcher.matchType === "owner_context") {
      if (!matcher.contextRegexes.some((regex) => regex.test(lowered))) continue;
      remember(matcher.fullName.toLowerCase(), matcher.matchType, matcher.confidence);
      continue;
    }
    if (!matcher.regex.test(lowered)) continue;
    remember(matcher.fullName.toLowerCase(), matcher.matchType, matcher.confidence);
  }
  return hits;
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
  const metadataByFullName = await loadRepoMetadataByFullName();
  const npmPackagesByRepo = await loadNpmPackagesByRepo();
  const aliasMatchers = buildRepoAliasMatchers(
    tracked,
    metadataByFullName,
    npmPackagesByRepo,
  );
  const { computedAt: baselinesComputedAt, baselines } = await loadBaselines();
  const baselineCount = Object.keys(baselines).length;
  log(`tracked repos: ${tracked.size}`);
  log(`repo alias matchers: ${aliasMatchers.length}`);
  log(`auth mode: ${getRedditAuthMode()}`);
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
        const hits = Array.from(
          extractRepoMentions(p, tracked, aliasMatchers).values(),
        ).sort(matchComparator);
        const canonicalHits = hits.map((hit) => hit.fullName);
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
          linkedRepos: hits.map((hit) => ({
            fullName: hit.fullName,
            matchType: hit.matchType,
            confidence: hit.confidence,
          })),
        };
        allPostsFlat.push(flatPost);

        if (hits.length === 0) continue;
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
    authMode: getRedditAuthMode(),
    effectiveFetchMode:
      getRedditFetchRuntime().activeMode ?? getRedditAuthMode(),
    fallbackUsed: getRedditFetchRuntime().fallbackUsed,
    oauthFailures: getRedditFetchRuntime().oauthFailures,
    successfulSubreddits: SUBREDDITS.length - errors,
    failedSubreddits: errors,
    oauthRequests: getRedditFetchRuntime().oauthRequests,
    publicRequests: getRedditFetchRuntime().publicRequests,
    scannedSubreddits: SUBREDDITS,
    scannedPostsTotal: scannedTotal,
    mentions: mentionsOut,
    mentionsByRepoId: Object.fromEntries(
      Object.entries(mentionsOut).map(([fullName, value]) => [
        slugIdFromFullName(fullName),
        value,
      ]),
    ),
    allPosts: allPostsOut,
    topPosts,
    leaderboard,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const mentionsRedis = await writeDataStore("reddit-mentions", payload);

  // ---- all-posts merge + write ----
  const existingAllPosts = scrubStaleProjectNameLinks(
    await loadExistingAllPosts(),
    aliasMatchers,
  );
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
  const allPostsRedis = await writeDataStore(
    "reddit-all-posts",
    allPostsPayload,
  );

  log("");
  log(`wrote ${OUT} [redis: ${mentionsRedis.source}]`);
  log(
    `  repos with mentions: ${mentions.size} / posts scanned: ${scannedTotal} / subreddits: ${SUBREDDITS.length} (errors: ${errors})`,
  );
  log(
    `  baseline tiers: breakout=${breakoutCount} above-average=${aboveAvgCount}`,
  );
  log(`wrote ${ALL_POSTS_OUT} [redis: ${allPostsRedis.source}]`);
  log(
    `  all posts: ${mergedAllPosts.length} total · pruned: ${prunedOld} old + ${prunedOverflow} overflow`,
  );

  if (errors === SUBREDDITS.length) {
    throw new Error("every subreddit fetch failed — check network or UA");
  }

  if (unknownsAccumulator.size > 0) {
    await appendUnknownMentions(
      Array.from(unknownsAccumulator, (fullName) => ({ source: "reddit", fullName })),
    );
    log(`unknown candidates: ${unknownsAccumulator.size} (lake: data/unknown-mentions.jsonl)`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && resolve(invokedPath) === resolve(modulePath)) {
  // T2.6: metadata sidecar — distinguishes outage from quiet day.
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "reddit",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] reddit.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-reddit failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "reddit",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error("[meta] reddit.json error-write failed:", metaErr);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}
