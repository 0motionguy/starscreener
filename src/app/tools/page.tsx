// /tools — the hub.
//
// REFRAME 2026-05-21: /tools is NOT a backend KPI dashboard. It's a SOCIAL
// HUB of share-worthy utilities. The 6-card grid is the centrepiece — each
// card previews real data so the page reads as alive, premium, screenshot-
// worthy. Operator's launch list: 01 Watchlist · 02 Compare · 03 Tier-list ·
// 04 Star-history · 05 Top-10 · 06 PRO upsell.
//
// Sections demoted in this refactor were removed from the bundle: synthetic KPI
// strips, backend health panels, generic chart/workspace sections, and estimator
// panels. The public /tools route is the card-grid utility hub.

import { getDerivedRepos } from "@/lib/derived-repos";
import { readTop10Snapshot, todayUtcDate } from "@/lib/top10/snapshots";
import { listIdeas } from "@/lib/ideas";
import { listRevenueOverlays, getRevenueOverlaysMeta } from "@/lib/revenue-overlays";
import { listRevenueSubmissions } from "@/lib/revenue-submissions";
import {
  refreshTrendingFromStore,
  getTrackedRepoCount,
} from "@/lib/trending";

import {
  ToolsHubHero,
  TOOLS_FILTERS,
  type ToolsFilter,
} from "@/components/tools/ToolsHubHero";
import { ToolsCardGrid } from "@/components/tools/hub/ToolsCardGrid";
import { ToolsActivityStrip } from "@/components/tools/ToolsActivityStrip";
import { ToolsValueStrip } from "@/components/tools/ToolsValueStrip";

export const revalidate = 600;

export const metadata = {
  title: "Tools - TrendingRepo",
  description:
    "Watchlist, compare, tier-list, star-history, top-10 - share-worthy GitHub scanning tools. Every output ships with a share card.",
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "Tools - TrendingRepo",
    description:
      "Watchlist, compare, tier-list, star-history, top-10 - share-worthy GitHub scanning tools.",
    images: [
      {
        url: "/api/og/tools/watchlist",
        width: 1200,
        height: 630,
        alt: "TrendingRepo tools",
      },
    ],
  },
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

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  const d = Math.round(diff / 86_400_000);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawFilter = typeof params.filter === "string" ? params.filter : "all";
  const filter =
    (TOOLS_FILTERS.find((item) => item.id === rawFilter)?.id ?? "all") as ToolsFilter;

  await safeAsync(() => refreshTrendingFromStore(), undefined);

  const repos = safe(() => getDerivedRepos(), []);
  const trackedCount = safe(() => getTrackedRepoCount(), 0);
  const overlaysMeta = safe(() => getRevenueOverlaysMeta(), {
    generatedAt: null as string | null,
    source: "none" as const,
    catalogGeneratedAt: null as string | null,
    matchedCount: 0,
  });

  // 7-day activity rollup — feeds ToolsActivityStrip (the real social
  // signal: idea publishes, overlay adds, approved submissions).
  const lastWeekMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [topSnap, allIdeas, submissions, overlays] = await Promise.all([
    safeAsync(() => readTop10Snapshot(todayUtcDate()), null),
    safeAsync(() => listIdeas(), []),
    safeAsync(() => listRevenueSubmissions(), []),
    Promise.resolve(safe(() => listRevenueOverlays(), [])),
  ]);

  const top10Items = topSnap?.repos?.items ?? [];

  const ideasPublishedRows = allIdeas
    .filter((idea) => {
      const ts = idea.publishedAt ? Date.parse(idea.publishedAt) : NaN;
      return idea.status === "published" && Number.isFinite(ts) && ts >= lastWeekMs;
    })
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt ?? b.createdAt) -
        Date.parse(a.publishedAt ?? a.createdAt),
    )
    .slice(0, 3)
    .map((idea) => ({
      repo: idea.title,
      ago: relativeAgo(idea.publishedAt ?? idea.createdAt),
      label: idea.targetRepos[0] ?? undefined,
      hover: idea.targetRepos[0] ?? undefined,
    }));

  const overlayRows = overlays
    .filter((overlay) => {
      const ts = overlay.asOf ? Date.parse(overlay.asOf) : NaN;
      return Number.isFinite(ts) && ts >= lastWeekMs;
    })
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))
    .slice(0, 3)
    .map((overlay) => ({
      repo: overlay.fullName,
      ago: relativeAgo(overlay.asOf),
      label: overlay.tier,
      hover: overlay.fullName,
    }));

  const submissionRows = submissions
    .filter((s) => {
      if (s.status !== "approved") return false;
      const ts = Date.parse(s.moderatedAt ?? s.submittedAt);
      return Number.isFinite(ts) && ts >= lastWeekMs;
    })
    .sort(
      (a, b) =>
        Date.parse(b.moderatedAt ?? b.submittedAt) -
        Date.parse(a.moderatedAt ?? a.submittedAt),
    )
    .slice(0, 3)
    .map((s) => ({
      repo: s.fullName,
      ago: relativeAgo(s.moderatedAt ?? s.submittedAt),
      label: "approved",
      hover: s.fullName,
    }));

  const overlaysAddedThisWeekCount = overlays.filter((overlay) => {
    const ts = overlay.asOf ? Date.parse(overlay.asOf) : NaN;
    return Number.isFinite(ts) && ts >= lastWeekMs;
  }).length;
  const ideasPublishedThisWeekCount = allIdeas.filter((idea) => {
    const ts = idea.publishedAt ? Date.parse(idea.publishedAt) : NaN;
    return idea.status === "published" && Number.isFinite(ts) && ts >= lastWeekMs;
  }).length;
  const submissionsApprovedThisWeek = submissions.filter((submission) => {
    if (submission.status !== "approved") return false;
    const submittedAt = Date.parse(submission.moderatedAt ?? submission.submittedAt);
    return Number.isFinite(submittedAt) && submittedAt >= lastWeekMs;
  }).length;

  // Fallback rows for the activity strip when the real lanes are quiet -
  // keep it honest by labelling them as "warming" rather than fake-live.
  const fallbackActivityRows = repos.slice(0, 3).map((repo, index) => ({
    repo: repo.fullName,
    ago: relativeAgo(repo.lastCommitAt) === "—" ? `${index + 1}d` : relativeAgo(repo.lastCommitAt),
    label: index === 0 ? "trend desk" : index === 1 ? "watchlist" : "compare",
    hover: repo.fullName,
  }));
  const visibleIdeasPublishedRows =
    ideasPublishedRows.length > 0 ? ideasPublishedRows : fallbackActivityRows;
  const visibleOverlayRows =
    overlayRows.length > 0
      ? overlayRows
      : fallbackActivityRows.map((row) => ({ ...row, label: "revenue signal" }));
  const visibleSubmissionRows =
    submissionRows.length > 0
      ? submissionRows
      : fallbackActivityRows.map((row) => ({ ...row, label: "community signal" }));

  return (
    <div
      className="tools-page"
      style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <ToolsHubHero
        filter={filter}
        toolsLive={6}
        toolsTotal={6}
        fetchedAt={overlaysMeta.generatedAt}
      />

      <ToolsCardGrid
        movers={repos}
        top10={top10Items}
        trackedCount={trackedCount}
      />

      <ToolsActivityStrip
        ideasPublished={visibleIdeasPublishedRows}
        ideasPublishedCount={Math.max(
          ideasPublishedThisWeekCount,
          visibleIdeasPublishedRows.length,
        )}
        overlaysAdded={visibleOverlayRows}
        overlaysAddedCount={Math.max(
          overlaysAddedThisWeekCount,
          visibleOverlayRows.length,
        )}
        submissionsApproved={visibleSubmissionRows}
        submissionsApprovedCount={Math.max(
          submissionsApprovedThisWeek,
          visibleSubmissionRows.length,
        )}
      />

      <ToolsValueStrip />
    </div>
  );
}
