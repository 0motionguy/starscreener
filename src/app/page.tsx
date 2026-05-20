import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos, getDerivedRepoCount } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import type { Repo } from "@/lib/types";

import { FeaturedRepos } from "@/components/trending/FeaturedRepos";
import { TrendingFilters, type LanguageStat } from "@/components/trending/TrendingFilters";
import {
  TrendingHubHero,
  type CategoryId,
  type WindowId,
  CATEGORIES,
  WINDOWS,
} from "@/components/trending/TrendingHubHero";
import { KpiStrip } from "@/components/trending/KpiStrip";
import { TrendingTable } from "@/components/trending/TrendingTable";

export const revalidate = 1800;

export const metadata = {
  title: "TrendingRepo - the radar for everything AI",
  description:
    "Real-time trend discovery across GitHub, HN, Reddit, X, Bluesky, ProductHunt, Dev.to and 23 more. Updated every 30 min.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type SortId = "momentum" | "mentions" | "stars" | "consensus";

export default async function TrendingHubPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawCat = typeof params.cat === "string" ? params.cat : "repos";
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const rawLang =
    typeof params.lang === "string" ? params.lang.toLowerCase() : "all";
  const rawSort = typeof params.sort === "string" ? params.sort : "momentum";
  const category = (CATEGORIES.find((c) => c.id === rawCat)?.id ??
    "repos") as CategoryId;
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ??
    "24h") as WindowId;
  const sort = normalizeSort(rawSort);

  await refreshTrendingFromStore().catch(() => undefined);

  const repos = safe(() => getDerivedRepos(), []);
  const languageStats = getLanguageStats(repos);
  const language =
    rawLang === "all" ||
    languageStats.some((item) => item.language.toLowerCase() === rawLang)
      ? rawLang
      : "all";
  const filtered =
    language === "all"
      ? repos
      : repos.filter((repo) => repo.language?.toLowerCase() === language);
  const sorted = sortRepos(filtered, timeWindow, sort);

  const counts = await getSidebarSourceCounts().catch(() => null);
  const switcherCounts: Partial<Record<CategoryId, number>> = {
    repos: safe(() => getDerivedRepoCount(), repos.length),
    skills: counts?.skillsItems ?? 0,
    mcp: counts?.mcpItems ?? 0,
    agents: counts?.agentRepos ?? 0,
    llms:
      (counts?.hfModels ?? 0) +
      (counts?.hfDatasets ?? 0) +
      (counts?.hfSpaces ?? 0),
  };

  const fetchedAt = safe(() => getLastFetchedAt() || null, null);

  return (
    <div className="route-shell">
      <TrendingHubHero
        category={category}
        window={timeWindow}
        counts={switcherCounts}
      />

      <KpiStrip />

      <FeaturedRepos repos={sorted} fetchedAt={fetchedAt} />
      <TrendingFilters
        activeLanguage={language}
        activeSort={sort}
        category={category}
        window={timeWindow}
        languages={languageStats}
      />

      <div className="trending-grid trending-grid-wide">
        <TrendingTable
          repos={sorted}
          fetchedAt={fetchedAt}
          window={timeWindow}
          limit={50}
          category={category}
          language={language}
          sort={sort}
        />
      </div>
    </div>
  );
}

function sortRepos(repos: Repo[], timeWindow: WindowId, sort: SortId): Repo[] {
  const sorted = [...repos];
  sorted.sort((a, b) => {
    if (sort === "mentions") return mentionScore(b) - mentionScore(a);
    if (sort === "stars") return (b.stars ?? 0) - (a.stars ?? 0);
    if (sort === "consensus") return consensusScore(b) - consensusScore(a);
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
  return (
    (repo.mentions?.total24h ?? repo.mentionCount24h ?? 0) +
    (repo.channelsFiring ?? 0) * 100
  );
}

function consensusScore(repo: Repo): number {
  return (
    (repo.crossSignalScore ?? 0) * 100 +
    (repo.momentumScore ?? 0) +
    mentionScore(repo)
  );
}

function getLanguageStats(repos: Repo[]): LanguageStat[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    const language = repo.language?.trim();
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return Array.from(counts, ([language, count]) => ({ language, count })).sort(
    (a, b) => b.count - a.count,
  );
}

function normalizeSort(value: string): SortId {
  return value === "mentions" || value === "stars" || value === "consensus"
    ? value
    : "momentum";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
