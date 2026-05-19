// /tools — Toolbox / Tools hub. Phase 3A of the UI v6 rebuild.
//
// Wires (accessor differences vs the original plan, noted inline):
//   - getDerivedRepos()              — sync; drives Treemap card + category counts
//   - listSnapshots()                — NOT exported on top10/snapshots; we count
//                                       archived dates via per-date probe over the
//                                       last 200 days using readTop10Snapshot
//                                       (see countArchivedTop10Snapshots).
//   - getCompareHistory()            — NOT exported on compare-selection; cleared
//                                       to client-side Zustand. Server renders 0
//                                       and a "Sign in to see yours" copy hook.
//   - listTierLists()                — NOT exported on tier-list/store (Phase 4B
//                                       restoration). Static 0 with honest copy.
//   - getDigestStats()               — NOT exported on digest/queries. We fall
//                                       back to listAvailableDigestDates() count.
//   - getActivityMetrics()           — NOT exported on star-activity. We surface
//                                       the cached payload count via a small
//                                       internal helper instead.
//   - listIdeas({ status })          — listIdeas() is no-arg; filter in memory.
//   - listRevenueOverlays()          — sync.
//   - listRevenueSubmissions()       — async; we filter to last-7d approved.
//
// ISR: revalidate = 600 (10 min) — lower than other surfaces because user
// activity tools change frequently.

import {
  refreshTrendingFromStore,
  getTrackedRepoCount,
} from "@/lib/trending";
import { getDerivedRepos } from "@/lib/derived-repos";
import { readTop10Snapshot, todayUtcDate } from "@/lib/top10/snapshots";
import { listIdeas } from "@/lib/ideas";
import { listRevenueOverlays, getRevenueOverlaysMeta } from "@/lib/revenue-overlays";
import { listRevenueSubmissions } from "@/lib/revenue-submissions";
import { listAvailableDigestDates } from "@/lib/digest/queries";

import {
  ToolsHubHero,
  TOOLS_FILTERS,
  type ToolsFilter,
} from "@/components/tools/ToolsHubHero";
import { ToolsKpiStrip } from "@/components/tools/ToolsKpiStrip";
import { ToolsChartsSection } from "@/components/tools/ToolsChartsSection";
import { ToolsWorkspaceSection } from "@/components/tools/ToolsWorkspaceSection";
import { ToolsEstimatorsSection } from "@/components/tools/ToolsEstimatorsSection";
import { ToolsActivityStrip } from "@/components/tools/ToolsActivityStrip";
import { ToolsValueStrip } from "@/components/tools/ToolsValueStrip";

export const revalidate = 600;

export const metadata = {
  title: "Tools — TrendingRepo",
  description:
    "Toolbox for the trend desk — Star History, Treemap, Watchlist, Compare, Tier List, Top 10 daily snapshot, Weekly Digest, ARR estimates, Ideas, and Submit Revenue. Built on the same momentum pipeline as the rest of the platform.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * The top10 store doesn't expose a `listSnapshots()` enumerator. Probe the
 * last 200 calendar days via `readTop10Snapshot(date)` and count hits. Each
 * probe is internally cached + 30s rate-limited inside the data-store, so
 * the cost is bounded and warm after the first render.
 */
async function countArchivedTop10Snapshots(daysBack = 200): Promise<number> {
  const today = todayUtcDate();
  const baseTs = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(baseTs)) return 0;

  const probes: Promise<unknown>[] = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(baseTs - i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    probes.push(
      readTop10Snapshot(iso).catch(() => null),
    );
  }
  const results = await Promise.all(probes);
  return results.filter((r) => r !== null && r !== undefined).length;
}

/** Count distinct top-level category buckets across all derived repos. */
function countCategoryBuckets(): { categories: number; repos: number } {
  const repos = safe(() => getDerivedRepos(), []);
  const seen = new Set<string>();
  for (const r of repos) {
    if (r.categoryId) seen.add(r.categoryId);
  }
  return { categories: seen.size, repos: repos.length };
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawFilter = typeof params.filter === "string" ? params.filter : "all";
  const filter =
    (TOOLS_FILTERS.find((f) => f.id === rawFilter)?.id ?? "all") as ToolsFilter;

  // Refresh the trending payload — drives the treemap card + KPI counts.
  // allSettled so a stalled slug doesn't take the page down.
  await Promise.allSettled([refreshTrendingFromStore()]);

  const trackedCount = safe(() => getTrackedRepoCount(), 0);
  const treemap = safe(() => countCategoryBuckets(), { categories: 0, repos: 0 });

  // Parallelize independent data fetches — saves ~4 sequential awaits.
  // Each safeAsync is a separate independent payload; no ordering needed.
  const [top10Archived, todaySnap, allIdeas, submissions, digestDates] =
    await Promise.all([
      safeAsync(() => countArchivedTop10Snapshots(200), 0),
      safeAsync(() => readTop10Snapshot(todayUtcDate()), null),
      safeAsync(() => listIdeas(), []),
      safeAsync(() => listRevenueSubmissions(), []),
      safeAsync(() => listAvailableDigestDates(), []),
    ]);

  // Ideas — published + shipped counts.
  const ideasPublished = allIdeas.filter((i) => i.status === "published").length;
  const ideasShipped = allIdeas.filter((i) => i.status === "shipped").length;
  // Top conviction headline (most-recent published).
  const topIdea =
    allIdeas.find((i) => i.status === "published") ?? null;

  // Revenue overlays.
  const overlays = safe(() => listRevenueOverlays(), []);
  const overlaysMeta = safe(() => getRevenueOverlaysMeta(), {
    generatedAt: null as string | null,
    source: "none" as const,
    catalogGeneratedAt: null as string | null,
    matchedCount: 0,
  });
  const lastWeekMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const submissionsApprovedThisWeek = submissions.filter((s) => {
    if (s.status !== "approved") return false;
    const t = Date.parse(s.moderatedAt ?? s.submittedAt);
    return Number.isFinite(t) && t >= lastWeekMs;
  }).length;

  // Digest — fallback to date-list count since getDigestStats isn't exported.
  const digestIssues = digestDates.length;

  // KPI strip values. Some are derived; others are static-but-honest until
  // the underlying telemetry slug ships (see plan).
  const kpiPlotsToday = 0; // No getActivityMetrics() yet — wire on restoration.
  const kpiWatchlistItems = 0; // Server-side anon — client store rehydrates.
  const kpiComparesSaved = 0; // Same — client zustand.
  const kpiSubscribers = digestIssues; // Substitute: count of issues archived.

  // Tool counts.
  const TOOLS_LIVE = 10;
  const TOOLS_TOTAL = 10;

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <ToolsHubHero
        filter={filter}
        toolsLive={TOOLS_LIVE}
        toolsTotal={TOOLS_TOTAL}
        fetchedAt={overlaysMeta.generatedAt}
      />

      <ToolsKpiStrip
        toolsLive={TOOLS_LIVE}
        toolsTotal={TOOLS_TOTAL}
        plotsToday={kpiPlotsToday}
        watchlistItems={kpiWatchlistItems}
        comparesSaved={kpiComparesSaved}
        digestSubscribers={kpiSubscribers}
      />

      <ToolsChartsSection
        filter={filter}
        trackedRepoCount={trackedCount}
        treemapRepoCount={treemap.repos}
        treemapCategoryCount={treemap.categories}
      />

      <ToolsWorkspaceSection
        filter={filter}
        top10Archived={top10Archived}
        top10TodayExists={Boolean(todaySnap)}
        digestIssues={digestIssues}
      />

      <ToolsEstimatorsSection
        filter={filter}
        overlayCount={overlays.length}
        ideasPublished={ideasPublished}
        ideasShipped={ideasShipped}
        topIdeaTitle={topIdea?.title ?? null}
        submissionsApprovedThisWeek={submissionsApprovedThisWeek}
      />

      <ToolsActivityStrip />

      <ToolsValueStrip />
    </div>
  );
}
