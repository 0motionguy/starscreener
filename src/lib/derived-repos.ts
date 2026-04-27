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
import { attachCrossSignal } from "./pipeline/cross-signal";
import { getLaunchForRepo } from "./producthunt";
import { getRedditDataVersion } from "./reddit-data";
import {
  getTwitterSignalSync,
  getTwitterSignalsDataVersion,
} from "./twitter/signal-data";
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
  _cacheKeyComputed = `${getRedditDataVersion()}:${getManualReposDataVersion()}:${getTwitterSignalsDataVersion()}:${getPipelineReposDataVersion()}`;
  _cacheKeyComputedAtMs = now;
  return _cacheKeyComputed;
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
  // component reads movementStatus. Also attaches the per-repo
  // `bluesky` rollup so surfaces can render the BskyBadge without
  // re-querying the mentions JSON.
  repos = attachCrossSignal(repos);

  // 3.6 Attach the latest Twitter/X row rollup from .data/twitter-repo-signals.
  // This keeps the client terminal free of server-only storage imports while
  // letting rows render the same X mention counts as /twitter.
  repos = repos.map((r) => {
    const signal = getTwitterSignalSync(r.fullName);
    if (!signal) {
      return {
        ...r,
        twitter: null,
      };
    }
    return {
      ...r,
      twitter: {
        mentionCount24h: signal.metrics.mentionCount24h,
        uniqueAuthors24h: signal.metrics.uniqueAuthors24h,
        finalTwitterScore: signal.score.finalTwitterScore,
        badgeState: signal.badge.state,
        topPostUrl: signal.metrics.topPostUrl,
        lastScannedAt: signal.updatedAt,
      },
    };
  });

  // 3.7 Attach ProductHunt launch for tracked repos that have a recent (7d)
  // PH match. Sparse by design — only repos whose github.com URL appeared
  // in a PH launch's website/description get this field set. Most repos
  // keep producthunt = undefined. Used by PhBadge and the "Hot launch"
  // cross-signal highlight.
  repos = repos.map((r) => {
    const launch = getLaunchForRepo(r.fullName);
    if (!launch) return r;
    return {
      ...r,
      producthunt: {
        launchedOnPH: true,
        launch: {
          id: launch.id,
          name: launch.name,
          votesCount: launch.votesCount,
          daysSinceLaunch: launch.daysSinceLaunch,
          url: launch.url,
        },
      },
    };
  });

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
  _cacheKey = null;
  _byFullName = null;
  _byId = null;
  _cacheKeyComputed = "";
  _cacheKeyComputedAtMs = 0;
  __resetPipelineReposCacheForTests();
}
