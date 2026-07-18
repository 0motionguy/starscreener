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

import { cache } from "react";

import type { Repo } from "./types";
import { filterSpamRepos } from "./ranking/repo-quality";
import {
  getRepoMetadata,
  getRepoMetadataByGithubId,
  getRepoMetadataFetchedAt,
} from "./repo-metadata";
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
} from "./trending";
import {
  getStarActivityDeltas,
  getStarActivityDeltasDataVersion,
} from "./star-activity-deltas";
import { resolveDelta } from "./derived-repos/delta-engine";
import { scoreBatch } from "./pipeline/scoring/engine";
import {
  classifyBatch,
  deriveTags,
} from "./pipeline/classification/classifier";
import { decorateWithCrossSignal } from "./derived-repos/decorators/cross-signal";
import { decorateWithMentionsRollup } from "./derived-repos/decorators/mentions-rollup";
import { decorateWithProductHunt } from "./derived-repos/decorators/producthunt";
import { decorateWithTwitter } from "./derived-repos/decorators/twitter";
import { getTwitterSignalsDataVersion } from "./twitter";
import { getCrossSourceMentionsDataVersion } from "./cross-source-mentions";
import { getMentionsLedgerDataVersion } from "./mentions-ledger";
import {
  __resetPipelineReposCacheForTests,
  getPipelineRepos,
  getPipelineReposDataVersion,
} from "./derived-repos/loaders/pipeline-jsonl";
import {
  __resetRepoRegistryForTests,
  buildBaseRepoFromRegistry,
  getRegistryRepos,
  getRepoRegistryDataVersion,
} from "./derived-repos/loaders/registry";
import {
  baseRepoFromTrending,
  buildTrendingAggregates,
} from "./derived-repos/loaders/trending-aggregates";
import {
  synthesizeRecentRepoSparkline,
  synthesizeSparkline,
} from "./derived-repos/sparkline";

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

function computeCacheKey(): string {
  const now = Date.now();
  if (_cacheKeyComputed && now - _cacheKeyComputedAtMs < CACHE_KEY_FLOOR_MS) {
    return _cacheKeyComputed;
  }
  _cacheKeyComputed = [
    getManualReposDataVersion(),
    getTwitterSignalsDataVersion(),
    getPipelineReposDataVersion(),
    getCrossSourceMentionsDataVersion(),
    getRepoRegistryDataVersion(),
    getMentionsLedgerDataVersion(),
    getStarActivityDeltasDataVersion(),
    getRepoMetadataFetchedAt() ?? "",
  ].join(":");
  _cacheKeyComputedAtMs = now;
  return _cacheKeyComputed;
}

/**
 * Fully-assembled Repo[] built from committed JSON. Runs classify → score →
 * rank in one pass so consumers get the same shape that the in-memory
 * pipeline would have produced after recomputeAll(). Cached after the first
 * call.
 *
 * Wrapped in `React.cache()` so multiple sibling RSC components calling
 * `getDerivedRepos()` during the same request share a single computation
 * frame (saves the `computeCacheKey()` floor walk + Map lookups on hits).
 */
export const getDerivedRepos = cache(function getDerivedReposImpl(): Repo[] {
  const cacheKey = computeCacheKey();
  if (_cache && _cacheKey === cacheKey) return _cache;
  _byFullName = null;
  _byId = null;

  const aggregates = buildTrendingAggregates();
  const deltas = getDeltas();
  // GitHub-direct 24h/7d/30d deltas (worker `star-activity-deltas` slug),
  // keyed by lowercased fullName. The OSS-Insight-independent backbone the
  // resolver prefers for 7d/30d. Empty object when the slug isn't populated.
  const saDeltas = getStarActivityDeltas().repos;
  const fetchedAt = lastFetchedAt;

  // repoId -> OSSInsights period-star fallback. Lifetime totals come from
  // data/repo-metadata.json when available.
  const starsNowByRepoId = new Map<string, number>();
  for (const [repoId, entry] of Object.entries(deltas.repos)) {
    starsNowByRepoId.set(repoId, entry.stars_now);
  }

  // Delta resolution (24h/7d/30d source precedence) lives in the pure,
  // unit-tested ./derived-repos/delta-engine module — `resolveDelta` is
  // imported at the top and used by both the trending-aggregate loop and the
  // registry loop below.

  let repos: Repo[] = [];

  for (const aggregate of aggregates.values()) {
    const id = slugToId(aggregate.row.repo_name);
    const metadata =
      getRepoMetadata(aggregate.row.repo_name) ??
      getRepoMetadataByGithubId(aggregate.row.repo_id);
    const base = baseRepoFromTrending(aggregate, fetchedAt, metadata);

    const repoIdLookup = aggregate.row.repo_id;
    const starsNow =
      (repoIdLookup && starsNowByRepoId.get(repoIdLookup)) || 0;
    const deltaEntry = repoIdLookup ? deltas.repos[repoIdLookup] : undefined;
    const saEntry = saDeltas[aggregate.row.repo_name?.toLowerCase() ?? ""];

    const d24 = resolveDelta(
      "24h",
      { has: aggregate.has24h, value: aggregate.stars24h },
      saEntry?.delta_24h,
      deltaEntry?.delta_24h,
    );
    const d7 = resolveDelta(
      "7d",
      { has: aggregate.has7d, value: aggregate.stars7d },
      saEntry?.delta_7d,
      deltaEntry?.delta_7d,
    );
    const d30 = resolveDelta(
      "30d",
      { has: aggregate.has30d, value: aggregate.stars30d },
      saEntry?.delta_30d,
      deltaEntry?.delta_30d,
    );
    // GitHub-direct current star count from the velocity engine
    // (star-activity-deltas, refreshed every 40 min by velocity-refresh).
    // Preferred over the stale snapshot/activity fallbacks so a repo without
    // repo-metadata enrichment shows its REAL total instead of a tiny stale
    // number (e.g. "2 stars" next to a +939 30d delta) — which also lets
    // velocityPct compute a real % off a credible base.
    const saStarsNow =
      saEntry && typeof saEntry.stars_now === "number" ? saEntry.stars_now : 0;
    const starsTotal =
      metadata && metadata.stars > 0
        ? metadata.stars
        : saStarsNow > 0
          ? saStarsNow
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
    const realSparkline = Array.isArray(withHistory.sparklineData)
      ? withHistory.sparklineData
      : [];
    const sparkline =
      realSparkline.length >= 7
        ? realSparkline
        : synthesizeSparkline(starsTotal, d24.rank, d7.rank, d30.rank);

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
      archived: metadata?.archived ?? withHistory.archived,
      starsDelta24h: d24.value,
      starsDelta7d: d7.value,
      starsDelta30d: d30.value,
      // Keep OSS Insight's momentum score when present (healthy path); fall
      // back to the resolved delta rank (star-activity-derived) when it's
      // absent — i.e. during an OSS Insight outage — so Gainer (trendScore24h)
      // and Trend (trendScore30d) still order the registry-served repos.
      trendScore24h: aggregate.trendScore24h || d24.rank,
      trendScore7d: aggregate.trendScore7d || d7.rank,
      trendScore30d: aggregate.trendScore30d || d30.rank,
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

  // Supplemental: the persistent repo-registry (redis-backed) — every repo
  // ever seen, including ones that have DROPPED out of the live trending feed.
  // This is what makes the collection accumulate past 1000 and retains dropped
  // repos instead of letting them vanish on the next oss-trending overwrite.
  // Each entry carries last-known stats; we overlay committed metadata when
  // present so stars/topics stay fresh, then feed the row through the same
  // classify+score pass as the rest.
  for (const entry of getRegistryRepos()) {
    const normalized = entry.fullName.toLowerCase();
    if (seenFullNames.has(normalized)) continue;
    const metadata = getRepoMetadata(entry.fullName);
    // GitHub-direct current star count (velocity engine). Used as the stars
    // fallback so a registry repo without repo-metadata shows its REAL total
    // instead of a stale tiny number, and velocityPct gets a credible base.
    const saEntry = saDeltas[normalized];
    const saStarsNow =
      saEntry && typeof saEntry.stars_now === "number" ? saEntry.stars_now : 0;
    const base = buildBaseRepoFromRegistry(entry);
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
      stars: metadata?.stars ?? (saStarsNow > 0 ? saStarsNow : base.stars),
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
    // Delta Engine join — the registry is the SOLE source whenever the
    // `trending` slug is empty (OSS Insight outage), so it must carry full
    // 24h/7d/30d deltas. There's no OSS Insight bucket on this path (has:false);
    // the resolver prefers star-activity (GitHub-direct, deep) for 7d/30d so
    // they stay populated through the outage, then falls back to the snapshot/
    // TOOLBOX `deltas` slug (keyed by repoId) — which is real only for 24h.
    const regDelta = entry.repoId ? deltas.repos[entry.repoId] : undefined;
    const r24 = resolveDelta(
      "24h",
      { has: false, value: 0 },
      saEntry?.delta_24h,
      regDelta?.delta_24h,
    );
    const r7 = resolveDelta(
      "7d",
      { has: false, value: 0 },
      saEntry?.delta_7d,
      regDelta?.delta_7d,
    );
    const r30 = resolveDelta(
      "30d",
      { has: false, value: 0 },
      saEntry?.delta_30d,
      regDelta?.delta_30d,
    );
    const rHasMovement = !r24.missing || !r7.missing || !r30.missing;
    repos.push({
      ...enrichedBase,
      starsDelta24h: r24.value,
      starsDelta7d: r7.value,
      starsDelta30d: r30.value,
      starsDelta24hMissing: r24.missing,
      starsDelta7dMissing: r7.missing,
      starsDelta30dMissing: r30.missing,
      hasMovementData: rHasMovement,
      // trendScore from the resolved rank (cold-start tolerated) so Gainer
      // (trendScore24h) and Trend (trendScore30d) order registry-served repos.
      trendScore24h: r24.rank,
      trendScore7d: r7.rank,
      trendScore30d: r30.rank,
      sparklineData: rHasMovement
        ? synthesizeSparkline(enrichedBase.stars, r24.rank, r7.rank, r30.rank)
        : synthesizeRecentRepoSparkline(
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

  // 1.9 Avatar floor — a GitHub owner avatar is deterministically derivable
  // from the login (github.com/{owner}.png → 302 → avatars.githubusercontent),
  // so a repo must NEVER fall back to a monogram just because the
  // `repo-metadata` enrichment slug is cold/empty/stale. Root-cause fix for the
  // mass-monogram regression: logos were sourced ONLY from repo-metadata, and
  // when that slug went empty (worker stale) ~half the rows lost their logo.
  // The <img> in FeaturedRepos/TrendingTable already monogram-falls-back on
  // 404, so deriving is strictly safer than leaving it blank.
  repos = repos.map((r) =>
    r.ownerAvatarUrl || !r.owner
      ? r
      : { ...r, ownerAvatarUrl: `https://github.com/${r.owner}.png` },
  );

  // 1.95 Quality gate — exclude piracy/crack/warez/darknet spam before
  // classification and scoring so junk rows cannot distort category cohorts.
  repos = filterSpamRepos(repos);

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

  // 3.5 Active-channel cross-signal fusion (GitHub + HN + Bluesky + dev.to + X).
  // Must run after scoreBatch — the github
  // component reads movementStatus.
  repos = decorateWithCrossSignal(repos);

  // 3.6 Twitter/X row rollup (.data/twitter-repo-signals).
  repos = decorateWithTwitter(repos);

  // 3.65 Unified all-source mentions rollup. Reads per-source sync getters
  // (twitter / hn / bluesky / devto / lobsters) plus walks the
  // bundled npm / huggingface / arxiv data files to attribute by linked
  // repo. Sets `repo.mentions` (typed rollup) and overrides
  // `repo.mentionCount24h` with the all-source 24h sum so existing
  // scoring + UI consumers see the unified total instead of just twitter.
  repos = decorateWithMentionsRollup(repos);

  // 3.7 ProductHunt launch (sparse — most repos keep producthunt undefined).
  repos = decorateWithProductHunt(repos);

  // 4. Rank by momentum desc, tracking per-category position.
  const sorted = [...repos].sort((a, b) => b.momentumScore - a.momentumScore);
  const perCatCounter = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const catIdx = (perCatCounter.get(r.categoryId) ?? 0) + 1;
    perCatCounter.set(r.categoryId, catIdx);
    sorted[i] = {
      ...r,
      rank: i + 1,
      categoryRank: catIdx,
    };
  }

  _cache = sorted;
  _cacheKey = cacheKey;
  return sorted;
});

/** Case-insensitive lookup by `owner/name`. */
export const getDerivedRepoByFullName = cache(function getDerivedRepoByFullNameImpl(fullName: string): Repo | null {
  if (!_byFullName) {
    const repos = getDerivedRepos();
    const byFullName = new Map<string, Repo>();
    for (const r of repos) {
      byFullName.set(r.fullName.toLowerCase(), r);
    }
    for (const aggregate of buildTrendingAggregates().values()) {
      const metadata =
        getRepoMetadata(aggregate.row.repo_name) ??
        getRepoMetadataByGithubId(aggregate.row.repo_id);
      if (!metadata) continue;
      const canonical = byFullName.get(metadata.fullName.toLowerCase());
      if (canonical) {
        byFullName.set(aggregate.row.repo_name.toLowerCase(), canonical);
      }
    }
    _byFullName = byFullName;
  }
  return _byFullName.get(fullName.toLowerCase()) ?? null;
});

/** Lookup by slug id (e.g. `vercel--next-js`). */
export const getDerivedRepoById = cache(function getDerivedRepoByIdImpl(id: string): Repo | null {
  if (!_byId) {
    const repos = getDerivedRepos();
    const byId = new Map<string, Repo>();
    for (const r of repos) {
      byId.set(r.id, r);
    }
    _byId = byId;
  }
  return _byId.get(id) ?? null;
});

/** Track count for pagination/debug across OSS + supplemental recent repos. */
export const getDerivedRepoCount = cache(function getDerivedRepoCountImpl(): number {
  return getDerivedRepos().length;
});

// Test-only cache reset. Also clears the pipeline-jsonl loader's mtime
// cache via its dedicated reset hook so a test can reset everything in
// one call.
export function __resetDerivedReposCache(): void {
  _cache = null;
  _cacheKey = null;
  _byFullName = null;
  _byId = null;
  _cacheKeyComputed = "";
  _cacheKeyComputedAtMs = 0;
  __resetPipelineReposCacheForTests();
  __resetRepoRegistryForTests();
}
