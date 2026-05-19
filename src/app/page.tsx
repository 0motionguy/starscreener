// Trending hub — phase 1A. Wires the data spine (derived repos + cross-source
// mentions + sidebar counts + freshness) onto the new HTML chrome.

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos, getDerivedRepoCount } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";

import { TrendingHubHero, type CategoryId, type WindowId, CATEGORIES, WINDOWS } from "@/components/trending/TrendingHubHero";
import { KpiStrip } from "@/components/trending/KpiStrip";
import { TrendingTable } from "@/components/trending/TrendingTable";
import { TopMoversRail } from "@/components/trending/TopMoversRail";
import { SourceHealthGrid } from "@/components/trending/SourceHealthGrid";

export const revalidate = 1800;

export const metadata = {
  title: "TrendingRepo — the radar for everything AI",
  description:
    "Real-time trend discovery across GitHub, HN, Reddit, X, Bluesky, ProductHunt, Dev.to and 23 more. Updated every 30 min.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TrendingHubPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawCat = typeof params.cat === "string" ? params.cat : "repos";
  const rawWin = typeof params.window === "string" ? params.window : "24h";
  const category = (CATEGORIES.find((c) => c.id === rawCat)?.id ?? "repos") as CategoryId;
  const timeWindow = (WINDOWS.find((w) => w.id === rawWin)?.id ?? "24h") as WindowId;

  await refreshTrendingFromStore().catch(() => undefined);

  const repos = (() => {
    try {
      return getDerivedRepos();
    } catch {
      return [];
    }
  })();

  const sorted = [...repos].sort((a, b) => {
    if (timeWindow === "7d") return (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0);
    if (timeWindow === "30d") return (b.starsDelta30d ?? 0) - (a.starsDelta30d ?? 0);
    return (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0);
  });

  const counts = await getSidebarSourceCounts().catch(() => null);
  const switcherCounts: Partial<Record<CategoryId, number>> = {
    repos: (() => {
      try {
        return getDerivedRepoCount();
      } catch {
        return repos.length;
      }
    })(),
    skills: counts?.skillsItems ?? 0,
    mcp: counts?.mcpItems ?? 0,
    agents: counts?.agentRepos ?? 0,
    llms: (counts?.hfModels ?? 0) + (counts?.hfDatasets ?? 0) + (counts?.hfSpaces ?? 0),
  };

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  // The 4 non-repos panels are empty until Phase 1A-extension wires their
  // dedicated data. Render an honest empty state when category isn't 'repos'.
  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <TrendingHubHero category={category} window={timeWindow} counts={switcherCounts} />

      <KpiStrip />

      {category === "repos" ? (
        <div
          className="trending-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 18,
            marginTop: 8,
          }}
        >
          <TrendingTable repos={sorted} fetchedAt={fetchedAt} limit={50} />
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <TopMoversRail limit={5} />
            <SourceHealthGrid />
          </aside>
        </div>
      ) : (
        <div
          className="empty"
          style={{
            marginTop: 16,
            padding: "60px 28px",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: "var(--r-1)",
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "var(--fg-bright)", fontSize: 18, marginBottom: 8 }}>
            {category === "skills"
              ? "Skills hub"
              : category === "mcp"
                ? "MCP servers hub"
                : category === "agents"
                  ? "Agents hub"
                  : "LLMs · HF models hub"}
          </h2>
          <p style={{ color: "var(--fg-muted)", fontSize: 12, maxWidth: 560, margin: "0 auto" }}>
            Same terminal table layout, ranked by adoption + cross-source mentions. Data wires available
            ({(switcherCounts[category] ?? 0).toLocaleString()} items cached) — UI deferred to
            Phase 1A-extension. Switch back to <b>Repos</b> for the full live table.
          </p>
        </div>
      )}
    </div>
  );
}
