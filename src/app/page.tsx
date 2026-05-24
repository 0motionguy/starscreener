import Link from "next/link";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos, getDerivedRepoCount } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import {
  getAgentsAsRepos,
  getLlmsAsRepos,
  refreshCategoryFromStore,
} from "@/lib/category-adapters";
import { refreshAaLlmsFromStore, getAaLlmsRanked } from "@/lib/aa-llms";
import { LlmsLeaderboardTable } from "@/components/llms/LlmsLeaderboardTable";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import {
  refreshTrendshiftFromStore,
  getTrendshiftRankMap,
} from "@/lib/trendshift";
import type { Repo } from "@/lib/types";

import { FeaturedRepos } from "@/components/trending/FeaturedRepos";
import { TrendingHubHero, type CategoryId, type WindowId, CATEGORIES, WINDOWS } from "@/components/trending/TrendingHubHero";
import { TrendingControlBar } from "@/components/trending/TrendingControlBar";
import { KpiStrip } from "@/components/trending/KpiStrip";
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

  await refreshTrendingFromStore().catch(() => undefined);
  if (category === "llms") {
    await refreshAaLlmsFromStore().catch(() => undefined);
  } else if (category !== "repos") {
    await refreshCategoryFromStore(category).catch(() => undefined);
  } else if (ranker === "trend") {
    await refreshTrendshiftFromStore().catch(() => undefined);
  }

  const repos = (() => {
    if (category === "repos") return safe(() => getDerivedRepos(), []);
    if (category === "agents") return safe(() => getAgentsAsRepos(), []);
    if (category === "llms") return safe(() => getLlmsAsRepos(), []);
    return [];
  })();

  // Language filter removed (operator: "all its only about AI · no filter per coding language").
  // `lang` URL param is accepted for back-compat but no longer filters the list.
  const language = rawLang;
  const sorted = sortRepos(repos, timeWindow, sort, ranker, category);

  const counts = await getSidebarSourceCounts().catch(() => null);
  const switcherCounts: Partial<Record<CategoryId, number>> = {
    repos: safe(() => getDerivedRepoCount(), repos.length),
    agents: counts?.agentRepos ?? 0,
    // llms count will be the AA model count once Wave 4 wires the reader.
    llms: 0,
  };

  const fetchedAt = safe(() => getLastFetchedAt() || null, null);

  return (
    <div className="route-shell">
      <TrendingHubHero category={category} window={timeWindow} counts={switcherCounts} />

      <KpiStrip />

      <FeaturedRepos repos={sorted} fetchedAt={fetchedAt} />

      <TrendingControlBar
        activeCategory={category}
        activeRanker={ranker}
        activeWindow={timeWindow}
        activeSort={sort}
        counts={switcherCounts}
      />

      {category === "llms" ? (
        <LlmsLeaderboardTable rows={safe(() => getAaLlmsRanked(200), [])} />
      ) : (
        <TrendingTable
          repos={sorted}
          fetchedAt={fetchedAt}
          window={timeWindow}
          limit={50}
          category={category}
          language={language}
          sort={sort}
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
