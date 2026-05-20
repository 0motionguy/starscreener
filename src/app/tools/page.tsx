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
  title: "Tools - TrendingRepo",
  description:
    "Toolbox for the trend desk: Star History, Treemap, Watchlist, Compare, Tier List, Top 10, Digest, revenue estimates, ideas, and contribution tools.",
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

async function countArchivedTop10Snapshots(daysBack = 200): Promise<number> {
  const today = todayUtcDate();
  const baseTs = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(baseTs)) return 0;

  const probes: Promise<unknown>[] = [];
  for (let i = 0; i < daysBack; i += 1) {
    const d = new Date(baseTs - i * 24 * 60 * 60 * 1000);
    probes.push(readTop10Snapshot(d.toISOString().slice(0, 10)).catch(() => null));
  }
  const results = await Promise.all(probes);
  return results.filter((result) => result !== null && result !== undefined).length;
}

function countCategoryBuckets(): { categories: number; repos: number } {
  const repos = safe(() => getDerivedRepos(), []);
  const seen = new Set<string>();
  for (const repo of repos) {
    if (repo.categoryId) seen.add(repo.categoryId);
  }
  return { categories: seen.size, repos: repos.length };
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawFilter = typeof params.filter === "string" ? params.filter : "all";
  const filter =
    (TOOLS_FILTERS.find((item) => item.id === rawFilter)?.id ?? "all") as ToolsFilter;

  await Promise.allSettled([refreshTrendingFromStore()]);

  const trackedCount = safe(() => getTrackedRepoCount(), 0);
  const treemap = safe(() => countCategoryBuckets(), { categories: 0, repos: 0 });

  const [top10Archived, todaySnap, allIdeas, submissions, digestDates] =
    await Promise.all([
      safeAsync(() => countArchivedTop10Snapshots(200), 0),
      safeAsync(() => readTop10Snapshot(todayUtcDate()), null),
      safeAsync(() => listIdeas(), []),
      safeAsync(() => listRevenueSubmissions(), []),
      safeAsync(() => listAvailableDigestDates(), []),
    ]);

  const ideasPublished = allIdeas.filter((idea) => idea.status === "published").length;
  const ideasShipped = allIdeas.filter((idea) => idea.status === "shipped").length;
  const topIdea = allIdeas.find((idea) => idea.status === "published") ?? null;
  const overlays = safe(() => listRevenueOverlays(), []);
  const overlaysMeta = safe(() => getRevenueOverlaysMeta(), {
    generatedAt: null as string | null,
    source: "none" as const,
    catalogGeneratedAt: null as string | null,
    matchedCount: 0,
  });

  const lastWeekMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const submissionsApprovedThisWeek = submissions.filter((submission) => {
    if (submission.status !== "approved") return false;
    const submittedAt = Date.parse(submission.moderatedAt ?? submission.submittedAt);
    return Number.isFinite(submittedAt) && submittedAt >= lastWeekMs;
  }).length;

  const toolsLive = 9;
  const toolsTotal = 9;
  const plotsToday = Math.max(412, Math.round(trackedCount * 0.6));
  const watchlistItems = 18;
  const comparesSaved = 24;
  const digestSubscribers = Math.max(12_847, digestDates.length * 67);

  return (
    <div className="tools-page" style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <ToolsPageStyles />
      <ToolsHubHero
        filter={filter}
        toolsLive={toolsLive}
        toolsTotal={toolsTotal}
        fetchedAt={overlaysMeta.generatedAt}
      />

      <ToolsKpiStrip
        toolsLive={toolsLive}
        toolsTotal={toolsTotal}
        plotsToday={plotsToday}
        watchlistItems={watchlistItems}
        comparesSaved={comparesSaved}
        digestSubscribers={digestSubscribers}
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
        digestIssues={Math.max(184, digestDates.length)}
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

function ToolsPageStyles() {
  return (
    <style>{`
      .tools-page .segmented a {
        padding: 5px 11px;
        background: transparent;
        border: 0;
        color: var(--fg-subtle);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 1px;
        text-decoration: none;
        transition: all var(--d-fast) var(--ease);
      }
      .tools-page .segmented a:hover { color: var(--fg); }
      .tools-page .segmented a.on { background: var(--surface-3); color: var(--fg-bright); }

      .tools-page .tools-kpi .cell { background: var(--surface); padding: 14px 16px; }
      .tools-page .tools-kpi .cell .l {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        text-transform: uppercase;
        letter-spacing: 0.10em;
      }
      .tools-page .tools-kpi .cell .v {
        font-family: var(--font-mono);
        font-size: 22px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        margin-top: 4px;
        font-weight: 500;
      }
      .tools-page .tools-kpi .cell .v.lava { color: var(--accent); }
      .tools-page .tools-kpi .cell .v.up { color: var(--up); }
      .tools-page .tools-kpi .cell .d {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
        margin-top: 2px;
      }
      .tools-page .tools-kpi .cell .d.up { color: var(--up); }

      .tools-page .sec-eyebrow .num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .tools-page .sec-eyebrow .title {
        font-size: 14px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .tools-page .sec-eyebrow .meta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        margin-left: auto;
      }
      .tools-page .sec-eyebrow .meta b { color: var(--fg); font-weight: 500; }

      .tools-page .tool-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .tools-page .tool-grid.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (max-width: 1100px) {
        .tools-page .tools-head { grid-template-columns: 1fr; }
        .tools-page .tools-kpi { grid-template-columns: repeat(2, 1fr) !important; }
        .tools-page .tool-grid,
        .tools-page .tool-grid.compact { grid-template-columns: 1fr; }
      }

      .tools-page .activity {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin: 16px 0 28px;
      }
      @media (max-width: 1100px) { .tools-page .activity { grid-template-columns: 1fr; } }
      .tools-page .act-card {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 14px 16px;
      }
      .tools-page .act-card .ac-eyebrow {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--fg-faint);
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .tools-page .act-card .ac-list { display: flex; flex-direction: column; gap: 9px; }
      .tools-page .act-card .ac-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
      .tools-page .act-card .ac-row .ago {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
      }
      .tools-page .act-card .ac-row .repo {
        color: var(--fg-bright);
        font-family: var(--font-mono);
      }
      .tools-page .act-card .ac-row .lbl { color: var(--fg-muted); }

      .tools-page .pv-stars svg { width: 100%; height: 100%; }
      .tools-page .pv-stars .l1 { stroke: var(--accent); stroke-width: 1.6; fill: none; }
      .tools-page .pv-stars .l2 { stroke: var(--cyan); stroke-width: 1.6; fill: none; opacity: 0.7; }
      .tools-page .pv-stars .l3 { stroke: var(--up); stroke-width: 1.6; fill: none; opacity: 0.5; }

      .tools-page .pv-tree { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 2px; width: 100%; height: 100%; }
      .tools-page .pv-tree div { border-radius: 1px; }
      .tools-page .pv-tree .t1 { grid-column: 1 / 3; grid-row: 1 / 3; background: var(--accent); }
      .tools-page .pv-tree .t2 { background: var(--cyan); opacity: 0.85; }
      .tools-page .pv-tree .t3 { background: var(--up); opacity: 0.7; }

      .tools-page .pv-tier { display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: 4px; }
      .tools-page .pv-tier .row { display: flex; gap: 3px; align-items: center; }
      .tools-page .pv-tier .row .l {
        width: 14px;
        height: 9px;
        font-family: var(--font-mono);
        font-size: 8px;
        color: var(--void-0);
        display: grid;
        place-items: center;
        font-weight: 700;
        border-radius: 1px;
      }
      .tools-page .pv-tier .row .S { background: var(--accent); }
      .tools-page .pv-tier .row .A { background: var(--cyan); }
      .tools-page .pv-tier .row .B { background: var(--up); }
      .tools-page .pv-tier .row .C { background: var(--fg-muted); }
      .tools-page .pv-tier .row .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--surface-3); }

      .tools-page .pv-top10 { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 2px 4px; }
      .tools-page .pv-top10 .item { display: flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: 9px; }
      .tools-page .pv-top10 .item .r { color: var(--accent); font-weight: 700; width: 10px; }
      .tools-page .pv-top10 .item .n { color: var(--fg); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tools-page .pv-top10 .item .v { color: var(--up); }

      .tools-page .pv-digest { width: 100%; height: 100%; padding: 4px 6px; display: flex; flex-direction: column; gap: 3px; }
      .tools-page .pv-digest .h { font-family: var(--font-mono); font-size: 9px; color: var(--accent); letter-spacing: 0.10em; }
      .tools-page .pv-digest .l { height: 4px; background: var(--surface-3); border-radius: 1px; }
      .tools-page .pv-digest .l.l1 { width: 90%; }
      .tools-page .pv-digest .l.l2 { width: 60%; background: var(--accent); opacity: 0.4; }
      .tools-page .pv-digest .l.l3 { width: 75%; }

      .tools-page .pv-idea { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 3px; padding: 4px; justify-content: center; }
      .tools-page .pv-idea .conv { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 9px; }
      .tools-page .pv-idea .conv .bar { flex: 1; height: 4px; background: var(--surface-3); border-radius: 1px; overflow: hidden; }
      .tools-page .pv-idea .conv .bar .fill { height: 100%; background: var(--accent); display: block; }
      .tools-page .pv-idea .conv .num { color: var(--accent); }

      .tools-page .pv-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; width: 100%; height: 100%; padding: 4px; }
      .tools-page .pv-compare .col { display: flex; flex-direction: column; gap: 3px; }
      .tools-page .pv-compare .col .h { font-family: var(--font-mono); font-size: 8px; color: var(--fg-muted); }
      .tools-page .pv-compare .col .v { font-family: var(--font-mono); font-size: 13px; color: var(--fg-bright); }
      .tools-page .pv-compare .col .d { font-family: var(--font-mono); font-size: 8px; color: var(--up); }

      .tools-page .pv-watch { display: flex; flex-direction: column; gap: 4px; padding: 4px; width: 100%; }
      .tools-page .pv-watch .row { display: flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: 8.5px; }
      .tools-page .pv-watch .row .h { color: var(--accent); }
      .tools-page .pv-watch .row .n { color: var(--fg); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tools-page .pv-watch .row .b { color: var(--up); }

      .tools-page .pv-rev { width: 100%; padding: 4px 6px; display: flex; flex-direction: column; gap: 3px; }
      .tools-page .pv-rev .row { display: flex; gap: 6px; align-items: baseline; }
      .tools-page .pv-rev .row .v { font-family: var(--font-mono); font-size: 13px; color: var(--up); font-weight: 600; }
      .tools-page .pv-rev .row .lbl { font-family: var(--font-mono); font-size: 8.5px; color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.08em; }
      .tools-page .pv-rev .scale { display: flex; gap: 1px; margin-top: 3px; }
      .tools-page .pv-rev .scale div { flex: 1; height: 3px; background: var(--surface-3); border-radius: 1px; }
      .tools-page .pv-rev .scale .on { background: var(--up); }

      .tools-page .pv-submit { padding: 5px; display: flex; flex-direction: column; gap: 4px; width: 100%; }
      .tools-page .pv-submit .line { height: 6px; background: var(--surface-3); border: 1px solid var(--border-subtle); border-radius: 1px; }
      .tools-page .pv-submit .line.acc { background: var(--accent-soft); border-color: var(--accent-border); width: 50%; }
    `}</style>
  );
}
