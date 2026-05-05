// Build a fully-assembled Repo[] entirely from committed JSON
// (OSSInsights growth + GitHub metadata). Used by surfaces that run on cold
// Vercel Lambdas where the in-memory repoStore is empty.
//
// Cached once per process because both source files are static at runtime —
// they ship with the build, so second-and-later calls are a no-op.
//
// Scope: discovery + search surfaces (homepage, /api/search, /api/repos,
// compare + category OG cards). MCP tools + admin pipeline routes continue
// to read the in-memory stores.

import type { Repo } from "./types";
import { getRepoMetadata } from "./repo-metadata";
import { slugToId } from "./utils";
import {
  buildBaseRepoFromRecent,
  getRecentRepos,
} from "./recent-repos";
import {
  getManualReposDataVersion,
  listManualRepoRowsSync,
} from "./manual-repos";
import {
  assembleRepoFromTrending,
  getDeltas,
  lastFetchedAt,
  type DeltaValue,
} from "./trending";
import { scoreBatch } from "./pipeline/scoring/engine";
import {
  classifyBatch,
  deriveTags,
} from "./pipeline/classification/classifier";
import { decorateWithCrossSignal } from "./derived-repos/decorators/cross-signal";
import { decorateWithMentionsRollup } from "./derived-repos/decorators/mentions-rollup";
import { decorateWithProductHunt } from "./derived-repos/decorators/producthunt";
import { decorateWithTwitter } from "./derived-repos/decorators/twitter";
import { getRedditDataVersion } from "./reddit-data";
import { getTwitterSignalsDataVersion } from "./twitter";
import {
  __resetPipelineReposCacheForTests,
  getPipelineRepos,
  getPipelineReposDataVersion,
} from "./derived-repos/loaders/pipeline-jsonl";
import {
  baseRepoFromTrending,
  buildTrendingAggregates,
} from "./derived-repos/loaders/trending-aggregates";
import {
  synthesizeRecentRepoSparkline,
  synthesizeSparkline,
} from "./derived-repos/sparkline";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Process-global derived-repos cache (LIB-17).
//
// Cache key composition lives in computeCacheKey(): a colon-joined string
// of getXxxDataVersion() outputs (one per upstream JSON file). The cache
// returns the prior result whenever every upstream's data version is
// unchanged — this is what makes warm Lambda calls O(1).
//
// Test-time invalidation: tests that mutate underlying data versions MUST
// call __resetDerivedReposCache() between cases. The function is exported
// purely for that purpose. Forgetting to reset = cross-test pollution
// where case B sees stale data from case A.
//
// Production invalidation: the cache key tracks file mtimes via
// getXxxDataVersion(); a fresh collector write bumps the version on the
// next cache-key floor expiration, no manual reset needed.
let _cache: Repo[] | null = null;
let _rawCache: Repo[] | null = null;
let _cacheKey: string | null = null;
let _byFullName: Map<string, Repo> | null = null;
let _byId: Map<string, Repo> | null = null;

// Cache-key-of-cache-key: each getXxxDataVersion() does its own statSync.
// Without this, every getDerivedRepos() call on a warm Lambda re-stats
// four files even when nothing has changed in the last few milliseconds.
// 5-second floor matches the audit recommendation (LIB-01) — short enough
// that a fresh collector write surfaces within one render tick, long
// enough that homepage rendering doesn't fan out to four `stat` syscalls
// on every request.
const CACHE_KEY_FLOOR_MS = 5_000;
let _cacheKeyComputedAtMs = 0;
let _cacheKeyComputed = "";
const DIVERSITY_TOP_WINDOW = 20;
const DIVERSITY_SCAN_WINDOW = 40;
const MEGA_REPO_STARS_THRESHOLD = 50_000;
const MAX_MEGA_REPOS_IN_TOP_WINDOW = 10;
const LONG_STAY_MIN_DAYS = 8;
const LONG_STAY_LOOKBACK_DAYS = 14;
const LONG_STAY_DECAY_FACTOR = 0.88;

function computeCacheKey(): string {
  const now = Date.now();
  if (_cacheKeyComputed && now - _cacheKeyComputedAtMs < CACHE_KEY_FLOOR_MS) {
    return _cacheKeyComputed;
  }
  _cacheKeyComputed = `${getRedditDataVersion()}:${getManualReposDataVersion()}:${getTwitterSignalsDataVersion()}:${getPipelineReposDataVersion()}`;
  _cacheKeyComputedAtMs = now;
  return _cacheKeyComputed;
}

function isMegaRepo(repo: Repo): boolean {
  return repo.stars >= MEGA_REPO_STARS_THRESHOLD;
}

function loadLongStayRepoIdsFromSnapshots(): Set<string> {
  const result = new Set<string>();
  try {
    const path = join(process.cwd(), ".data", "snapshots.jsonl");
    if (!existsSync(path)) return result;
    const body = readFileSync(path, "utf8");
    if (!body.trim()) return result;
    const lines = body.split(/\r?\n/);
    const cutoff = Date.now() - LONG_STAY_LOOKBACK_DAYS * 86_400_000;
    const byRepoDays = new Map<string, Set<string>>();
    for (const line of lines) {
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const row = parsed as Record<string, unknown>;
      if (row.source !== "github") continue;
      const repoId = typeof row.repoId === "string" ? row.repoId : null;
      const capturedAt = typeof row.capturedAt === "string" ? row.capturedAt : null;
      if (!repoId || !capturedAt) continue;
      const capturedMs = Date.parse(capturedAt);
      if (!Number.isFinite(capturedMs) || capturedMs < cutoff) continue;
      const day = new Date(capturedMs).toISOString().slice(0, 10);
      const bucket = byRepoDays.get(repoId) ?? new Set<string>();
      bucket.add(day);
      byRepoDays.set(repoId, bucket);
    }
    for (const [repoId, days] of byRepoDays.entries()) {
      if (days.size >= LONG_STAY_MIN_DAYS) result.add(repoId);
    }
  } catch {
    return result;
  }
  return result;
}

function applyDiversityRerank(
  sortedByMomentum: Repo[],
  longStayRepoIds: Set<string>,
): Repo[] {
  if (sortedByMomentum.length <= DIVERSITY_TOP_WINDOW) return sortedByMomentum;
  const window = sortedByMomentum.slice(
    0,
    Math.min(DIVERSITY_SCAN_WINDOW, sortedByMomentum.length),
  );
  const tail = sortedByMomentum.slice(window.length);

  const byDiverseScore = [...window].sort((a, b) => {
    const aScore =
      a.momentumScore *
      (longStayRepoIds.has(a.id) ? LONG_STAY_DECAY_FACTOR : 1);
    const bScore =
      b.momentumScore *
      (longStayRepoIds.has(b.id) ? LONG_STAY_DECAY_FACTOR : 1);
    if (bScore !== aScore) return bScore - aScore;
    return b.momentumScore - a.momentumScore;
  });

  const selected: Repo[] = [];
  const deferredMega: Repo[] = [];
  let megaCount = 0;
  for (const repo of byDiverseScore) {
    if (selected.length >= DIVERSITY_TOP_WINDOW) break;
    if (isMegaRepo(repo) && megaCount >= MAX_MEGA_REPOS_IN_TOP_WINDOW) {
      deferredMega.push(repo);
      continue;
    }
    selected.push(repo);
    if (isMegaRepo(repo)) megaCount += 1;
  }
  if (selected.length < DIVERSITY_TOP_WINDOW) {
    for (const repo of deferredMega) {
      if (selected.length >= DIVERSITY_TOP_WINDOW) break;
      selected.push(repo);
    }
  }
  const selectedKeys = new Set(selected.map((repo) => repo.fullName.toLowerCase()));
  const restOfWindow = byDiverseScore.filter(
    (repo) => !selectedKeys.has(repo.fullName.toLowerCase()),
  );
  return [...selected, ...restOfWindow, ...tail];
}

function assignRanks(repos: Repo[]): Repo[] {
  const perCatCounter = new Map<string, number>();
  const ranked = [...repos];
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const catIdx = (perCatCounter.get(r.categoryId) ?? 0) + 1;
    perCatCounter.set(r.categoryId, catIdx);
    ranked[i] = {
      ...r,
      rank: i + 1,
      categoryRank: catIdx,
    };
  }
  return ranked;
}

/**
 * Fully-assembled Repo[] built from committed JSON. Runs classify → score →
 * rank in one pass so consumers get the same shape that the in-memory
 * pipeline would have produced after recomputeAll(). Cached after the first
 * call.
 */
export function getDerivedRepos(): Repo[] {
  const cacheKey = computeCacheKey();
  if (_cache && _cacheKey === cacheKey) return _cache;
  _byFullName = null;
  _byId = null;

  const aggregates = buildTrendingAggregates();
  const deltas = getDeltas();
  const fetchedAt = lastFetchedAt;

  // repoId -> OSSInsights period-star fallback. Lifetime totals come from
  // data/repo-metadata.json when available.
  const starsNowByRepoId = new Map<string, number>();
  for (const [repoId, entry] of Object.entries(deltas.repos)) {
    starsNowByRepoId.set(repoId, entry.stars_now);
  }

  const isRealDelta = (d: DeltaValue | undefined): boolean =>
    !!d && d.value !== null && d.basis !== "cold-start";

  let repos: Repo[] = [];

  for (const aggregate of aggregates.values()) {
    const id = slugToId(aggregate.row.repo_name);
    const metadata = getRepoMetadata(aggregate.row.repo_name);
    const base = baseRepoFromTrending(aggregate, fetchedAt, metadata);

    const repoIdLookup = aggregate.row.repo_id;
    const starsNow =
      (repoIdLookup && starsNowByRepoId.get(repoIdLookup)) || 0;
    const deltaEntry = repoIdLookup ? deltas.repos[repoIdLookup] : undefined;

    const mergeDelta = (
      primary: number,
      hasPrimary: boolean,
      fallback: DeltaValue | undefined,
    ): { value: number; missing: boolean } => {
      if (hasPrimary) return { value: primary, missing: false };
      if (isRealDelta(fallback)) {
        return { value: fallback!.value as number, missing: false };
      }
      return { value: 0, missing: true };
    };

    const d24 = mergeDelta(
      aggregate.stars24h,
      aggregate.has24h,
      deltaEntry?.delta_24h,
    );
    const d7 = mergeDelta(
      aggregate.stars7d,
      aggregate.has7d,
      deltaEntry?.delta_7d,
    );
    const d30 = mergeDelta(
      aggregate.stars30d,
      aggregate.has30d,
      deltaEntry?.delta_30d,
    );
    const starsTotal =
      metadata && metadata.stars > 0
        ? metadata.stars
        : starsNow > 0
          ? starsNow
          : aggregate.activityStars;
    const forksTotal = metadata?.forks ?? aggregate.forks;

    const enrichedBase: Repo = {
      ...base,
      id,
      stars: starsTotal,
      forks: forksTotal,
      sparklineData: [],
      collectionNames: Array.from(aggregate.collectionNames).sort(),
    };
    const withHistory = assembleRepoFromTrending(enrichedBase, deltas);

    // Prefer real snapshot-derived sparkline when the pipeline provided one;
    // otherwise synthesize a credible 14-point curve from the anchor deltas.
    // For synthesis we accept cold-start raw values (numbers only — nulls and
    // repo-not-tracked fall back to 0), because even diagnostic partial-window
    // numbers produce a more useful visual curve than a flat dotted line.
    const rawDelta = (d: DeltaValue | undefined): number => {
      if (!d || d.value === null) return 0;
      return d.value;
    };
    const realSparkline = Array.isArray(withHistory.sparklineData)
      ? withHistory.sparklineData
      : [];
    const sparkline =
      realSparkline.length >= 7
        ? realSparkline
        : synthesizeSparkline(
            starsTotal,
            aggregate.has24h ? aggregate.stars24h : rawDelta(deltaEntry?.delta_24h),
            aggregate.has7d ? aggregate.stars7d : rawDelta(deltaEntry?.delta_7d),
            aggregate.has30d ? aggregate.stars30d : rawDelta(deltaEntry?.delta_30d),
          );

    repos.push({
      ...withHistory,
      id,
      stars: starsTotal,
      forks: forksTotal,
      contributors: aggregate.contributors,
      openIssues: metadata?.openIssues ?? withHistory.openIssues,
      lastCommitAt:
        metadata?.pushedAt ||
        metadata?.updatedAt ||
        metadata?.createdAt ||
        withHistory.lastCommitAt,
      createdAt: metadata?.createdAt ?? withHistory.createdAt,
      topics: metadata?.topics ?? withHistory.topics,
      repoCategory: metadata?.repoCategory ?? "library",
      repoCategoryConfidence:
        typeof metadata?.repoCategoryConfidence === "number"
          ? metadata.repoCategoryConfidence
          : 0.7,
      archived: metadata?.archived ?? withHistory.archived,
      starsDelta24h: d24.value,
      starsDelta7d: d7.value,
      starsDelta30d: d30.value,
      trendScore24h: aggregate.trendScore24h,
      trendScore7d: aggregate.trendScore7d,
      trendScore30d: aggregate.trendScore30d,
      sparklineData: sparkline,
      hasMovementData: !(d24.missing && d7.missing && d30.missing),
      starsDelta24hMissing: d24.missing,
      starsDelta7dMissing: d7.missing,
      starsDelta30dMissing: d30.missing,
    });
  }

  // Supplemental: freshly discovered repos from data/recent-repos.json that
  // aren't yet in the trending feed. These have no enrichment beyond what the
  // recent-repos list carries; we give them zero deltas and empty sparkline.
  const seenFullNames = new Set(
    repos.map((repo) => repo.fullName.toLowerCase()),
  );
  const supplementalRows = [
    ...getRecentRepos(),
    ...listManualRepoRowsSync(),
  ];
  for (const row of supplementalRows) {
    const normalized = row.fullName.toLowerCase();
    if (seenFullNames.has(normalized)) continue;
    const metadata = getRepoMetadata(row.fullName);
    const base = buildBaseRepoFromRecent(row);
    const enrichedBase: Repo = {
      ...base,
      fullName: metadata?.fullName ?? base.fullName,
      name: metadata?.name ?? base.name,
      owner: metadata?.owner ?? base.owner,
      ownerAvatarUrl: metadata?.ownerAvatarUrl || base.ownerAvatarUrl,
      description: metadata?.description || base.description,
      url: metadata?.url ?? base.url,
      language: metadata?.language ?? base.language,
      topics: metadata?.topics ?? base.topics,
      repoCategory: metadata?.repoCategory ?? "library",
      repoCategoryConfidence:
        typeof metadata?.repoCategoryConfidence === "number"
          ? metadata.repoCategoryConfidence
          : 0.7,
      stars: metadata?.stars ?? base.stars,
      forks: metadata?.forks ?? base.forks,
      openIssues: metadata?.openIssues ?? base.openIssues,
      lastCommitAt:
        metadata?.pushedAt ||
        metadata?.updatedAt ||
        metadata?.createdAt ||
        base.lastCommitAt,
      createdAt: metadata?.createdAt ?? base.createdAt,
      archived: metadata?.archived ?? base.archived,
    };
    repos.push({
      ...enrichedBase,
      sparklineData: synthesizeRecentRepoSparkline(
        enrichedBase.stars,
        enrichedBase.createdAt,
      ),
    });
    seenFullNames.add(normalized);
  }

  // Supplemental fallback: pipeline-persisted `.data/repos.jsonl` rows that
  // aren't covered by trending/recent/manual. This catches mature repos
  // (ollama/ollama, vercel/next.js, huggingface/transformers, …) that have
  // aged out of OSSInsights's trending feeds but still live in the persisted
  // pipeline store. Without this the repo detail page 404s on core tracked
  // repos whenever the Lambda cold-starts (the in-memory repoStore is empty
  // there). Each JSONL row already carries a full Repo shape; we fold in
  // committed metadata when present so stars/topics stay in sync, then feed
  // the row through the same classify+score pass as the trending-derived
  // set so category/momentum values come out consistent across sources.
  for (const row of getPipelineRepos()) {
    const normalized = row.fullName.toLowerCase();
    if (seenFullNames.has(normalized)) continue;
    const metadata = getRepoMetadata(row.fullName);
    const merged: Repo = {
      ...row,
      id: slugToId(row.fullName),
      fullName: metadata?.fullName ?? row.fullName,
      name: metadata?.name ?? row.name,
      owner: metadata?.owner ?? row.owner,
      ownerAvatarUrl: metadata?.ownerAvatarUrl || row.ownerAvatarUrl,
      description: metadata?.description || row.description || "",
      url: metadata?.url ?? row.url,
      language: metadata?.language ?? row.language,
      topics: metadata?.topics ?? row.topics ?? [],
      repoCategory: metadata?.repoCategory ?? row.repoCategory ?? "library",
      repoCategoryConfidence:
        typeof metadata?.repoCategoryConfidence === "number"
          ? metadata.repoCategoryConfidence
          : typeof row.repoCategoryConfidence === "number"
            ? row.repoCategoryConfidence
            : 0.7,
      stars: metadata?.stars ?? row.stars,
      forks: metadata?.forks ?? row.forks,
      openIssues: metadata?.openIssues ?? row.openIssues,
      lastCommitAt:
        metadata?.pushedAt ||
        metadata?.updatedAt ||
        metadata?.createdAt ||
        row.lastCommitAt,
      createdAt: metadata?.createdAt ?? row.createdAt,
      archived: metadata?.archived ?? row.archived,
    };
    repos.push(merged);
    seenFullNames.add(normalized);
  }

  // 2. Classify first so scoreBatch's per-category averages use the real
  //    topic-derived categoryIds instead of the "other" placeholder.
  const classifications = classifyBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    categoryId: classifications[i].primary.categoryId,
    tags: deriveTags(r),
  }));

  // 3. Score in one pass so per-category averages are consistent.
  const scores = scoreBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    momentumScore: scores[i].overall,
    movementStatus: scores[i].movementStatus,
  }));

  // 3.5 Four-channel cross-signal fusion (GitHub + Reddit + HN + Bluesky).
  // Two-pass internally so the reddit component is min-max normalized
  // across the full corpus. Must run after scoreBatch — the github
  // component reads movementStatus.
  repos = decorateWithCrossSignal(repos);

  // 3.6 Twitter/X row rollup (.data/twitter-repo-signals).
  repos = decorateWithTwitter(repos);

  // 3.65 Unified all-source mentions rollup. Reads per-source sync getters
  // (twitter / reddit / hn / bluesky / devto / lobsters) plus walks the
  // bundled npm / huggingface / arxiv data files to attribute by linked
  // repo. Sets `repo.mentions` (typed rollup) and overrides
  // `repo.mentionCount24h` with the all-source 24h sum so existing
  // scoring + UI consumers see the unified total instead of just twitter.
  repos = decorateWithMentionsRollup(repos);

  // 3.7 ProductHunt launch (sparse — most repos keep producthunt undefined).
  repos = decorateWithProductHunt(repos);

  // 4. Raw ranking by momentum.
  const sortedByMomentum = [...repos].sort((a, b) => b.momentumScore - a.momentumScore);
  const rawRanked = assignRanks(sortedByMomentum);

  // 5. Diversity post-rerank.
  const longStayRepoIds = loadLongStayRepoIdsFromSnapshots();
  const reranked = applyDiversityRerank(sortedByMomentum, longStayRepoIds);
  const diversityRanked = assignRanks(reranked);

  _rawCache = rawRanked;
  _cache = diversityRanked;
  _cacheKey = cacheKey;
  return diversityRanked;
}

export function getDerivedReposRaw(): Repo[] {
  const cacheKey = computeCacheKey();
  if (_rawCache && _cacheKey === cacheKey) return _rawCache;
  void getDerivedRepos();
  return _rawCache ?? [];
}

/** Case-insensitive lookup by `owner/name`. */
export function getDerivedRepoByFullName(fullName: string): Repo | null {
  if (!_byFullName) {
    const repos = getDerivedRepos();
    const byFullName = new Map<string, Repo>();
    for (const r of repos) {
      byFullName.set(r.fullName.toLowerCase(), r);
    }
    _byFullName = byFullName;
  }
  return _byFullName.get(fullName.toLowerCase()) ?? null;
}

/** Lookup by slug id (e.g. `vercel--next-js`). */
export function getDerivedRepoById(id: string): Repo | null {
  if (!_byId) {
    const repos = getDerivedRepos();
    const byId = new Map<string, Repo>();
    for (const r of repos) {
      byId.set(r.id, r);
    }
    _byId = byId;
  }
  return _byId.get(id) ?? null;
}

/** Track count for pagination/debug across OSS + supplemental recent repos. */
export function getDerivedRepoCount(): number {
  return getDerivedRepos().length;
}

// Test-only cache reset. Also clears the pipeline-jsonl loader's mtime
// cache via its dedicated reset hook so a test can reset everything in
// one call.
export function __resetDerivedReposCache(): void {
  _cache = null;
  _rawCache = null;
  _cacheKey = null;
  _byFullName = null;
  _byId = null;
  _cacheKeyComputed = "";
  _cacheKeyComputedAtMs = 0;
  __resetPipelineReposCacheForTests();
}

export function __applyDiversityRerankForTests(
  repos: Repo[],
  longStayRepoIds: Iterable<string> = [],
): Repo[] {
  const sorted = [...repos].sort((a, b) => b.momentumScore - a.momentumScore);
  return applyDiversityRerank(sorted, new Set(longStayRepoIds));
}
