import Link from "next/link";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { refreshRecentDropsFromStore, getNewFullNameSet } from "@/lib/recent-drops";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshStarActivityDeltasFromStore } from "@/lib/star-activity-deltas";
import { getDerivedRepos, getDerivedRepoCount } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import {
  getAgentsAsRepos,
  getLlmsAsRepos,
  refreshCategoryFromStore,
} from "@/lib/category-adapters";
import { refreshAaLlmsFromStore, getAaLlmsRanked, getAaLlmsFile } from "@/lib/aa-llms";
import {
  refreshOpenrouterFromStore,
  getOpenrouterFile,
  getOpenrouterRanked,
  getOpenrouterStats,
} from "@/lib/openrouter";
import {
  refreshOpenrouterUsageFromStore,
  getOpenrouterUsageFile,
  buildUsageChartData,
  buildLeaderboardView,
} from "@/lib/openrouter-usage";
import {
  refreshStarsByCategoryFromStore,
  getStarsByCategoryFile,
  toChartData as toStarsByCategoryChartData,
  HERO_CATEGORIES as STARS_HERO_CATEGORIES,
} from "@/lib/stars-by-category";
import { StarsByCategoryHero } from "@/components/charts/StarsByCategoryHero";
import {
  LlmsLeaderboardTable,
  FeaturedLlms,
} from "@/components/llms/LlmsLeaderboardTable";
import { ModelsSection } from "@/components/models/ModelsSection";
import { buildItemListJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import {
  refreshTrendshiftFromStore,
  getTrendshiftRankMap,
} from "@/lib/trendshift";
import type { Repo } from "@/lib/types";

import { FeaturedRepos } from "@/components/trending/FeaturedRepos";
import { TrendingHubHero, type CategoryId, type WindowId, CATEGORIES, WINDOWS } from "@/components/trending/TrendingHubHero";
import { TrendingControlBar } from "@/components/trending/TrendingControlBar";
import { TrendingTable } from "@/components/trending/TrendingTable";

export const revalidate = 1800;

export const metadata = {
  title: "TrendingRepo - the radar for everything AI",
  description:
    "Real-time trend discovery across GitHub, HN, Reddit, X, Bluesky, ProductHunt, Dev.to and 23 more. Updated every 30 min.",
  openGraph: {
    images: [
      { url: "/api/og/default", width: 1200, height: 630, alt: "TrendingRepo — the trend map for open source" },
    ],
  },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type SortId = "momentum" | "mentions" | "stars" | "consensus";
type RankerId = "top" | "gainer" | "trend";

export default async function TrendingHubPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawCat = typeof params.cat === "string" ? params.cat : "repos";
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const rawLang = typeof params.lang === "string" ? params.lang.toLowerCase() : "all";
  const rawSort = typeof params.sort === "string" ? params.sort : "momentum";
  const rawRank = typeof params.rank === "string" ? params.rank : "top";
  const category = (CATEGORIES.find((c) => c.id === rawCat)?.id ?? "repos") as CategoryId;
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ?? "24h") as WindowId;
  const sort = normalizeSort(rawSort);
  const ranker = normalizeRanker(rawRank);

  // Hydrate all per-source caches from Redis IN PARALLEL. These reads are
  // independent and each is internally 30s-rate-limited + in-flight-deduped, so
  // on a warm render they're near-free; on a cold/stale render parallelizing
  // collapses ~7 serial Redis round-trips into one wall-clock wait. Each keeps
  // its own .catch so a single cold source never rejects the batch (the page
  // still degrades gracefully). Covers: trending feed, the accumulating
  // repo-registry (dropped repos), GitHub-direct star deltas (Top/Gainer/Trend),
  // AA LLMs + OpenRouter pill counts, all-source mention pips, and NEW /drops.
  await Promise.all([
    refreshTrendingFromStore().catch(onRefreshError("trending")),
    refreshRepoRegistryFromStore().catch(onRefreshError("repo-registry")),
    refreshStarActivityDeltasFromStore().catch(
      onRefreshError("star-activity-deltas"),
    ),
    refreshAaLlmsFromStore().catch(onRefreshError("aa-llms")),
    refreshOpenrouterFromStore().catch(onRefreshError("openrouter")),
    refreshOpenrouterUsageFromStore().catch(onRefreshError("openrouter-usage")),
    refreshStarsByCategoryFromStore().catch(onRefreshError("stars-by-category")),
    refreshAllMentionStores().catch(onRefreshError("mentions")),
    refreshRecentDropsFromStore().catch(onRefreshError("recent-drops")),
  ]);
  if (category !== "repos" && category !== "llms") {
    await refreshCategoryFromStore(category).catch(onRefreshError(`category:${category}`));
  } else if (category === "repos" && ranker === "trend") {
    await refreshTrendshiftFromStore().catch(onRefreshError("trendshift"));
  }

  const rawRepos = (() => {
    if (category === "repos") return safe(() => getDerivedRepos(), []);
    if (category === "agents") return safe(() => getAgentsAsRepos(), []);
    if (category === "llms") return safe(() => getLlmsAsRepos(), []);
    return [];
  })();

  // Hard rule (2026-05-24 operator fix): on the velocity-sorted Top view,
  // items must have non-zero delta in the active time window. Otherwise rows
  // with 7d/30d activity but no 24h movement sneak to the top of the 24h
  // view — operator-rejected ("TOP RANKING IS SHIT").
  //
  // Agents excluded from this filter — the agents bucket is already curated
  // by a tight whitelist (AGENT_REPO_SET), so curated builds like Hermes /
  // Superpowers / Claude Code from past_week / past_month buckets must stay
  // visible even when their 24h delta is zero.
  // Extended 2026-05-29: the same hard rule now also covers the Gainer (24h)
  // and Trend (30d) velocity tabs. They were exempt, so a stale-OSS trendScore
  // (preserved by the oss-trending zero-write guard) floated zero/"—"-delta
  // repos to the top of a velocity board — gainer's #1 literally read "— — —".
  // Each velocity tab filters on ITS window: top→active selector, gainer→24h,
  // trend→30d. The graceful floor below still prevents an empty radar when the
  // filter wipes everything. Agents stays exempt (curated AGENT_REPO_SET).
  const requireWindowDelta =
    sort === "momentum" &&
    category === "repos" &&
    (ranker === "top" || ranker === "gainer" || ranker === "trend");
  const filterWindow: WindowId =
    ranker === "gainer" ? "24h" : ranker === "trend" ? "30d" : timeWindow;
  const windowFiltered = requireWindowDelta
    ? rawRepos.filter((r) => {
        if (filterWindow === "24h") return (r.starsDelta24h ?? 0) > 0;
        if (filterWindow === "7d") return (r.starsDelta7d ?? 0) > 0;
        if (filterWindow === "30d") return (r.starsDelta30d ?? 0) > 0;
        return true;
      })
    : rawRepos;
  // Graceful floor — never render an empty radar when we actually have repos.
  // The active-window delta filter above wipes the whole list when per-window
  // deltas are stale/zero across the board (e.g. the `trending` slug is
  // momentarily empty in prod and getDerivedRepos() falls back to the
  // registry, whose accumulated repos carry no 24h delta). In that case show
  // the unfiltered set rather than "0 repos" — slightly-stale beats empty,
  // same contract as the keep-last-50 collector rule.
  const repos = windowFiltered.length > 0 ? windowFiltered : rawRepos;

  // Language filter removed (operator: "all its only about AI · no filter per coding language").
  // `lang` URL param is accepted for back-compat but no longer filters the list.
  const language = rawLang;
  const sorted = sortRepos(repos, timeWindow, sort, ranker, category);

  const counts = await getSidebarSourceCounts().catch((err) => {
    console.error(
      "[home] data refresh failed: sidebar-counts",
      err instanceof Error ? err.message : err,
    );
    return null;
  });
  const switcherCounts: Partial<Record<CategoryId, number>> = {
    repos: safe(() => getDerivedRepoCount(), repos.length),
    agents: counts?.agentRepos ?? 0,
    llms: safe(() => getAaLlmsFile().models.length, 0),
    models: safe(() => getOpenrouterFile().models.length, 0),
  };

  const fetchedAt = safe(() => getLastFetchedAt() || null, null);
  // NEW set drives the featured pin + trending float/badge for repos that
  // dropped in the last 24h. Empty set when nothing recent / store cold.
  const newSet = safe(() => getNewFullNameSet(), new Set<string>());

  const aaRows =
    category === "llms" ? safe(() => getAaLlmsRanked(200), []) : [];

  // OpenRouter Models tab data — only materialised when the tab is active.
  const orRows =
    category === "models" ? safe(() => getOpenrouterRanked(500), []) : [];
  const orStats = category === "models" ? safe(() => getOpenrouterStats(), null) : null;
  const orUsage =
    category === "models"
      ? safe(() => buildUsageChartData(getOpenrouterUsageFile()), {
          points: [],
          models: [],
          meta: {},
        })
      : { points: [], models: [], meta: {} };
  const orLeaderboard =
    category === "models"
      ? safe(() => buildLeaderboardView(getOpenrouterUsageFile(), 20), [])
      : [];
  const orFetchedAt =
    category === "models" ? safe(() => getOpenrouterFile().fetchedAt, "") : "";
  const orUsageFetchedAt =
    category === "models" ? safe(() => getOpenrouterUsageFile().fetchedAt, "") : "";

  // Home-hero "stars stacked by category" chart — only materialised on the
  // default /?cat=repos tab. Reads the worker-aggregated daily slug, projects
  // to chart shape, paints zero-impact empty state when the worker hasn't
  // populated yet.
  const starsByCatData =
    category === "repos"
      ? safe(() => toStarsByCategoryChartData(getStarsByCategoryFile()), {
          points: [],
          categories: STARS_HERO_CATEGORIES,
          fetchedAt: "1970-01-01T00:00:00.000Z",
          windowDays: 0,
          totalRepos: 0,
        })
      : null;
  // ItemList JSON-LD — the top-used models, so answer engines can cite the
  // Models surface for "most-used AI models" style queries. Each item points
  // to its canonical OpenRouter model page.
  const orJsonLd =
    category === "models" && orRows.length > 0
      ? buildItemListJsonLd(
          "Most-used AI models on OpenRouter",
          "/?cat=models",
          orRows.slice(0, 20).map((m) => ({
            name: m.name,
            path: `https://openrouter.ai/${m.id}`,
            description: orModelDesc(m),
          })),
        )
      : null;

  // /?cat=models layout — operator decree 2026-05-30: skip the second
  // header (stats strip is enough) and push the global filter bar BELOW
  // the chart, since this tab is data-first. Other categories keep the
  // hero → featured → controls → table flow.
  const isModels = category === "models";
  const controlBar = (
    <TrendingControlBar
      activeCategory={category}
      activeRanker={ranker}
      activeWindow={timeWindow}
      activeSort={sort}
      counts={switcherCounts}
    />
  );

  return (
    <div className="route-shell">
      <TrendingHubHero category={category} window={timeWindow} counts={switcherCounts} />

      {isModels ? null : category === "llms" ? (
        <FeaturedLlms rows={aaRows} />
      ) : (
        <>
          {starsByCatData ? <StarsByCategoryHero data={starsByCatData} /> : null}
          <FeaturedRepos repos={sorted} fetchedAt={fetchedAt} newSet={newSet} />
        </>
      )}

      {isModels ? null : controlBar}

      {isModels ? (
        orStats ? (
          <>
            <JsonLd data={orJsonLd} />
            <ModelsSection
              rows={orRows}
              stats={orStats}
              usage={orUsage}
              leaderboard={orLeaderboard}
              fetchedAt={orFetchedAt}
              usageFetchedAt={orUsageFetchedAt}
            />
            {controlBar}
          </>
        ) : null
      ) : category === "llms" ? (
        <LlmsLeaderboardTable rows={aaRows} showFeatured={false} />
      ) : (
        <TrendingTable
          repos={sorted}
          fetchedAt={fetchedAt}
          window={timeWindow}
          limit={50}
          category={category}
          language={language}
          sort={sort}
          newSet={newSet}
        />
      )}
    </div>
  );
}

function sortRepos(
  repos: Repo[],
  timeWindow: WindowId,
  sort: SortId,
  ranker: RankerId = "top",
  category: CategoryId = "repos",
): Repo[] {
  // /?cat=llms carries source-native popularity (downloads). The TOP composite
  // is tuned for GitHub stars + cross-source mentions and would re-shuffle that
  // order incorrectly. Fall through to a delta-first / popularity-tiebreaker
  // sort that honors the upstream rank on the default momentum+top combo.
  const useSourceNative =
    sort === "momentum" && ranker === "top" && category === "llms";

  // TOP composite is cohort-normalized — compute once against the visible/filtered
  // set so language slicing doesn't bias the medians.
  const topScores =
    sort === "momentum" && ranker === "top" && !useSourceNative
      ? computeTopComposite(repos, timeWindow)
      : null;
  // TREND tab consults the TrendShift rank map; ties (incl. repos not in the
  // map) fall back to OSSInsight 30d so the table still has a stable order.
  const trendRanks =
    sort === "momentum" && ranker === "trend" ? getTrendshiftRankMap() : null;

  const sorted = [...repos];
  sorted.sort((a, b) => {
    if (sort === "mentions") return mentionScore(b) - mentionScore(a);
    if (sort === "stars") return (b.stars ?? 0) - (a.stars ?? 0);
    if (sort === "consensus") return consensusScore(b) - consensusScore(a);
    // sort === "momentum" — but ranker overrides which momentum
    if (ranker === "gainer") return (b.trendScore24h ?? 0) - (a.trendScore24h ?? 0);
    if (ranker === "trend") {
      if (trendRanks && trendRanks.size > 0) {
        const aRank = trendRanks.get(a.fullName.toLowerCase()) ?? 9999;
        const bRank = trendRanks.get(b.fullName.toLowerCase()) ?? 9999;
        if (aRank !== bRank) return aRank - bRank;
      }
      return (b.trendScore30d ?? 0) - (a.trendScore30d ?? 0);
    }
    if (useSourceNative) {
      // 2026-05-23 (third iteration): operator pushback — "bad sourcing of
      // ranking". The earlier source-native rank put lobehub's 10-install
      // item at top of skills just because lobehub is one source. Now:
      // sort by ABSOLUTE popularity desc (the popularity scalar on `stars`
      // already holds installs / use_count / downloads depending on
      // category). Honest "most popular" ordering. Delta sort still wins
      // when user explicitly picks the 7d or 30d window — that's "who's
      // rising in that window".
      if (timeWindow === "7d" || timeWindow === "30d") {
        const deltaDiff = deltaForWindow(b, timeWindow) - deltaForWindow(a, timeWindow);
        if (deltaDiff !== 0) return deltaDiff;
      }
      const popDiff = (b.stars ?? 0) - (a.stars ?? 0);
      if (popDiff !== 0) return popDiff;
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    }
    if (topScores) {
      const diff = (topScores.get(b.id) ?? 0) - (topScores.get(a.id) ?? 0);
      if (diff !== 0) return diff;
    }
    return deltaForWindow(b, timeWindow) - deltaForWindow(a, timeWindow);
  });
  return sorted;
}

function deltaForWindow(repo: Repo, timeWindow: WindowId): number {
  if (timeWindow === "7d") return repo.starsDelta7d ?? 0;
  if (timeWindow === "30d") return repo.starsDelta30d ?? 0;
  return repo.starsDelta24h ?? 0;
}

function mentionScore(repo: Repo): number {
  return (repo.mentions?.total24h ?? repo.mentionCount24h ?? 0) + (repo.channelsFiring ?? 0) * 100;
}

function consensusScore(repo: Repo): number {
  return (repo.crossSignalScore ?? 0) * 100 + (repo.momentumScore ?? 0) + mentionScore(repo);
}

function normalizeSort(value: string): SortId {
  return value === "mentions" || value === "stars" || value === "consensus" ? value : "momentum";
}

function normalizeRanker(value: string): RankerId {
  return value === "gainer" || value === "trend" ? value : "top";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// Surface a store-refresh failure to server logs instead of swallowing it
// silently. Returns undefined so a cold/failed source never throws the
// (ISR-cached) render — the page still degrades gracefully — but the operator
// is no longer blind to *which* source was down during a brownout.
function onRefreshError(source: string): (err: unknown) => undefined {
  return (err) => {
    console.error(
      `[home] data refresh failed: ${source}`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  };
}

// Plain-text description for the Models ItemList JSON-LD entries.
function orModelDesc(m: {
  author: string;
  contextLength: number;
  priceInPerM: number | null;
}): string {
  const parts: string[] = [m.author];
  if (m.contextLength >= 1_000_000) {
    parts.push(`${(m.contextLength / 1_000_000).toFixed(m.contextLength % 1_000_000 === 0 ? 0 : 1)}M context`);
  } else if (m.contextLength >= 1_000) {
    parts.push(`${Math.round(m.contextLength / 1_000)}K context`);
  }
  if (m.priceInPerM === 0) parts.push("free");
  else if (m.priceInPerM !== null) parts.push(`$${m.priceInPerM}/1M input`);
  return parts.join(" · ");
}

function cleanQueryPage(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, v]) =>
        v !== "" &&
        v !== "all" &&
        !(key === "rank" && v === "top") &&
        !(key === "sort" && v === "momentum") &&
        !(key === "window" && v === "24h") &&
        !(key === "cat" && v === "repos"),
    ),
  );
}

interface UnifiedTab {
  id: string;
  label: string;
  cat: CategoryId;
  rank: RankerId;
  active: boolean;
  count: number | null;
}

function buildUnifiedTabs(
  category: CategoryId,
  ranker: RankerId,
  counts: Partial<Record<CategoryId, number>>,
): UnifiedTab[] {
  const repoCount = counts.repos ?? null;
  return [
    {
      id: "repos-top",
      label: "Top",
      cat: "repos",
      rank: "top",
      active: category === "repos" && ranker === "top",
      count: repoCount,
    },
    {
      id: "repos-gainer",
      label: "Gainer",
      cat: "repos",
      rank: "gainer",
      active: category === "repos" && ranker === "gainer",
      count: repoCount,
    },
    {
      id: "repos-trend",
      label: "Trend",
      cat: "repos",
      rank: "trend",
      active: category === "repos" && ranker === "trend",
      count: repoCount,
    },
    ...CATEGORIES.filter((c) => c.id !== "repos").map((c) => ({
      id: c.id,
      label: c.label,
      cat: c.id as CategoryId,
      rank: "top" as RankerId,
      active: category === c.id,
      count: counts[c.id] ?? null,
    })),
  ];
}
