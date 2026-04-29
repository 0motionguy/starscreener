// /mcp — MCP-server leaderboard with operator-terminal aesthetics.
//
// Rebuild brief F1-F6 (2026-04-29):
//   - 10 columns (rank / title / package / weekly-downloads / tool-count /
//     transports / liveness / last-release / registries / hotness)
//   - 4 sub-leaderboard tabs (most-downloaded / hottest / liveness-champs /
//     new-this-week)
//   - 4-state liveness classifier (live / degraded / offline / unknown)
//     surfaced via the shared LivenessPill — offline rows STAY listed.
//   - Right rail keeps the existing top-10 with the new pill.
//   - Per-MCP detail page deferred (no [slug] route exists yet); data
//     shape on EcosystemLeaderboardItem.mcp is ready for one to be added.
//
// The page reuses SignalSourcePage's chrome + tab strip, but each tab
// renders a TerminalFeedTable directly (instead of the generic SignalTable)
// so we can lay down the new MCP-specific columns cleanly.

import type { Metadata } from "next";
import Link from "next/link";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import {
  getMcpSignalData,
  type EcosystemBoard,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import {
  LivenessPill,
  classifyLiveness,
} from "@/components/signal/LivenessPill";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { classifyFreshness } from "@/lib/news/freshness";
import { mcpEntityLogoUrl } from "@/lib/logos";
import { absoluteUrl } from "@/lib/seo";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildEcosystemHeader } from "@/components/signal/ecosystemTopHeader";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import {
  TerminalCellHotness,
  TerminalCellInstalls24h,
  TerminalCellInstalls30d,
  TerminalCellInstalls7d,
  TerminalCellLastRelease,
  TerminalCellLiveness,
  TerminalCellPackage,
  TerminalCellRank,
  TerminalCellRegistries,
  TerminalCellTitle,
  TerminalCellToolCount,
  TerminalCellTransports,
  TerminalCellWeeklyDownloads,
} from "./_components/McpCells";

const MCP_ACCENT = "rgba(58, 214, 197, 0.85)";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending MCP - TrendingRepo",
  description:
    "Top Model Context Protocol servers ranked by weekly downloads, liveness, and cross-registry presence.",
  alternates: { canonical: absoluteUrl("/mcp") },
  openGraph: {
    title: "Trending MCP - TrendingRepo",
    description:
      "A live leaderboard for Model Context Protocol servers across MCP registries.",
    url: absoluteUrl("/mcp"),
  },
};

// ---------------------------------------------------------------------------
// Column definition (shared across tabs — same layout, different sort/filter)
// ---------------------------------------------------------------------------

const MCP_COLUMNS: FeedColumn<EcosystemLeaderboardItem>[] = [
  {
    id: "rank",
    header: "#",
    width: "44px",
    render: (_row, idx) => <TerminalCellRank index={idx} />,
  },
  {
    id: "title",
    header: "MCP",
    render: (row) => <TerminalCellTitle item={row} />,
  },
  {
    id: "package",
    header: "Package",
    width: "180px",
    hideBelow: "md",
    render: (row) => <TerminalCellPackage mcp={row.mcp} />,
  },
  // MCP install windows. Surfaced ahead of "Weekly DL" so the table reads
  // 24h | 7d | 30d | Weekly DL — operator can scan the velocity columns
  // first and use Weekly DL as the absolute-volume tiebreak. 24h + 30d
  // hide on small screens so the mobile/tablet views don't overflow; 7d
  // is the canonical "is this hot right now" window and stays visible.
  {
    id: "installs-24h",
    header: "24h",
    width: "70px",
    align: "right",
    hideBelow: "lg",
    render: (row) => <TerminalCellInstalls24h mcp={row.mcp} />,
  },
  {
    id: "installs-7d",
    header: "7d",
    width: "70px",
    align: "right",
    render: (row) => <TerminalCellInstalls7d mcp={row.mcp} />,
  },
  {
    id: "installs-30d",
    header: "30d",
    width: "70px",
    align: "right",
    hideBelow: "lg",
    render: (row) => <TerminalCellInstalls30d mcp={row.mcp} />,
  },
  {
    id: "weekly-downloads",
    header: "Weekly DL",
    width: "110px",
    align: "right",
    render: (row) => <TerminalCellWeeklyDownloads mcp={row.mcp} />,
  },
  {
    id: "tool-count",
    header: "Tools",
    width: "70px",
    align: "right",
    hideBelow: "md",
    render: (row) => <TerminalCellToolCount mcp={row.mcp} />,
  },
  {
    id: "transports",
    header: "Transport",
    width: "110px",
    hideBelow: "lg",
    render: (row) => <TerminalCellTransports mcp={row.mcp} />,
  },
  {
    id: "liveness",
    header: "Liveness",
    width: "100px",
    render: (row) => <TerminalCellLiveness item={row} />,
  },
  {
    id: "last-release",
    header: "Last Release",
    width: "110px",
    hideBelow: "lg",
    render: (row) => <TerminalCellLastRelease mcp={row.mcp} />,
  },
  {
    id: "registries",
    header: "Registries",
    width: "150px",
    hideBelow: "md",
    render: (row) => <TerminalCellRegistries item={row} />,
  },
  {
    id: "hotness",
    header: "Hot",
    width: "60px",
    align: "right",
    render: (row) => <TerminalCellHotness item={row} />,
  },
];

// ---------------------------------------------------------------------------
// Tab sort/filter rules
// ---------------------------------------------------------------------------

function sortByDownloads(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  // Primary: combined npm + pypi 7-day downloads. Cold-start: the
  // mcp-downloads / mcp-downloads-pypi fetchers haven't shipped data yet,
  // so most rows have downloadsCombined7d === null. Fall through to the
  // publish payload's absolutes (popularity = installs_total ?? downloads_7d
  // ?? stars_total — populated by coerceMcpItem), then signalScore as a
  // final tiebreak. Without this chain the tab renders in arbitrary
  // insertion order, which is what the screenshot showed.
  return [...items].sort((a, b) => {
    const aDl = a.mcp?.downloadsCombined7d;
    const bDl = b.mcp?.downloadsCombined7d;
    if (aDl !== null && aDl !== undefined && bDl !== null && bDl !== undefined && aDl !== bDl) {
      return bDl - aDl;
    }
    if ((aDl ?? null) !== null && (bDl ?? null) === null) return -1;
    if ((aDl ?? null) === null && (bDl ?? null) !== null) return 1;
    const aPop = a.popularity ?? 0;
    const bPop = b.popularity ?? 0;
    if (aPop !== bPop) return bPop - aPop;
    return (b.signalScore ?? 0) - (a.signalScore ?? 0);
  });
}

function sortByHotness(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  // Hottest by velocity: rank by Δhotness (current - 7d-prior) when EITHER
  // side has a 7d-ago snapshot. Cold-start (first 7d of the rolling window):
  // no row has a snapshot, so the delta branch is skipped entirely and we
  // drop straight to absolute `hotness` desc, then `signalScore`, then
  // last-release as final tiebreak so the day-1 list still ranks usefully.
  return [...items].sort((a, b) => {
    const aHasPrev = a.hotnessPrev7d !== undefined;
    const bHasPrev = b.hotnessPrev7d !== undefined;
    if (aHasPrev || bHasPrev) {
      const aDelta = (a.hotness ?? 0) - (a.hotnessPrev7d ?? a.hotness ?? 0);
      const bDelta = (b.hotness ?? 0) - (b.hotnessPrev7d ?? b.hotness ?? 0);
      if (aDelta !== bDelta) return bDelta - aDelta;
    }
    const aH = a.hotness ?? a.signalScore ?? 0;
    const bH = b.hotness ?? b.signalScore ?? 0;
    if (aH !== bH) return bH - aH;
    return (
      (Date.parse(b.mcp?.lastReleaseAt ?? "") || 0) -
      (Date.parse(a.mcp?.lastReleaseAt ?? "") || 0)
    );
  });
}

function filterLivenessChampions(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  // uptime >= 0.99 AND non-stdio. Sort by toolCount desc.
  const champs = items.filter((item) => {
    const c = classifyLiveness(item.liveness);
    if (c.isStdio) return false;
    if (c.uptime7d === null) return false;
    return c.uptime7d >= 0.99;
  });
  return champs.sort(
    (a, b) => (b.mcp?.toolCount ?? -1) - (a.mcp?.toolCount ?? -1),
  );
}

function filterNewThisWeek(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const recent = items.filter((item) => {
    const iso = item.mcp?.lastReleaseAt;
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= cutoff;
  });
  return recent.sort((a, b) => {
    const ta = Date.parse(a.mcp?.lastReleaseAt ?? "");
    const tb = Date.parse(b.mcp?.lastReleaseAt ?? "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function McpPage() {
  const data = await getMcpSignalData();
  const freshness = classifyFreshness("mcp", data.fetchedAt);
  const items = data.board.items;

  const { cards, topStories } = buildEcosystemHeader({
    items,
    snapshotEyebrow: "// SNAPSHOT · NOW",
    snapshotLabel: "MCP SERVERS",
    snapshotRight: `${items.length.toLocaleString("en-US")} ITEMS`,
    volumeEyebrow: "// VOLUME · PER REGISTRY",
    topicsEyebrow: "// TOPICS · MENTIONED MOST",
    sourceLabelMap: {
      official: "OFCL",
      Official: "OFCL",
      glama: "GLAMA",
      Glama: "GLAMA",
      pulsemcp: "PULSE",
      PulseMCP: "PULSE",
      smithery: "SMTHY",
      Smithery: "SMTHY",
    },
  });

  const topHeader = (
    <NewsTopHeaderV3
      routeTitle="MCP · TRENDING"
      liveLabel="LIVE · 30M"
      eyebrow={`// MCP · ${data.source.toUpperCase()} · ${freshness.ageLabel.toUpperCase()}`}
      meta={[
        {
          label: "TRACKED",
          value: items.length.toLocaleString("en-US"),
        },
        { label: "REGISTRIES", value: "5" },
      ]}
      cards={cards}
      topStories={topStories}
      accent={MCP_ACCENT}
      caption={[
        "// LAYOUT compact-v1",
        "· 3-COL · 320 / 1FR / 1FR",
        "· DATA UNCHANGED",
      ]}
    />
  );

  // Pre-rendered tab content. Each is a TerminalFeedTable bound to the
  // matching sort/filter slice. Capped at TOP_N because /mcp now ships
  // 500 items per the worker's enriched publish payload, and rendering
  // all 500 across 4 tabs (= 2000 row renders) made SSR take 47s + 17MB.
  // Top-N keeps the tabs feeling like a leaderboard, not a database dump.
  const TOP_N = 50;
  const mostDownloaded = sortByDownloads(items).slice(0, TOP_N);
  const hottest = sortByHotness(items).slice(0, TOP_N);
  const livenessChamps = filterLivenessChampions(items).slice(0, TOP_N);
  const newThisWeek = filterNewThisWeek(items).slice(0, TOP_N);

  const tabs: SignalTabSpec[] = [
    {
      id: "most-downloaded",
      label: "Most Downloaded · 7d",
      rows: [],
      content: (
        <TerminalFeedTable
          rows={mostDownloaded}
          columns={MCP_COLUMNS}
          rowKey={(row) => row.id}
          accent={MCP_ACCENT}
          caption="MCP servers ranked by combined npm + pypi 7-day downloads"
          emptyTitle="No MCP rows yet."
          emptySubtitle="Waiting for trending-mcp + npm/pypi download fetchers."
        />
      ),
    },
    {
      id: "hottest",
      label: "Hottest by Velocity",
      rows: [],
      content: (
        <TerminalFeedTable
          rows={hottest}
          columns={MCP_COLUMNS}
          rowKey={(row) => row.id}
          accent={MCP_ACCENT}
          caption="MCP servers ranked by hotness (raw scorer output)"
          emptyTitle="No MCP rows yet."
        />
      ),
    },
    {
      id: "liveness-champs",
      label: "Liveness Champions",
      rows: [],
      content: (
        <TerminalFeedTable
          rows={livenessChamps}
          columns={MCP_COLUMNS}
          rowKey={(row) => row.id}
          accent={MCP_ACCENT}
          caption="HTTP MCP servers with 99%+ 7-day uptime, ranked by tool count"
          emptyTitle="No MCP server has crossed the 99% uptime line yet."
          emptySubtitle="Liveness pings run every 6h - the rolling window fills as they accrue."
        />
      ),
    },
    {
      id: "new-this-week",
      label: "New This Week",
      rows: [],
      content: (
        <TerminalFeedTable
          rows={newThisWeek}
          columns={MCP_COLUMNS}
          rowKey={(row) => row.id}
          accent={MCP_ACCENT}
          caption="MCP servers with an npm/pypi release in the last 7 days"
          emptyTitle="No MCP packages have published in the last 7 days."
          emptySubtitle="lastReleaseAt is sourced from npm/pypi - cold-starts as side-channels backfill."
        />
      ),
    },
  ];

  return (
    <SignalSourcePage
      source="mcp"
      sourceLabel="MCP"
      mode="TRENDING"
      fetchedAt={data.fetchedAt}
      freshnessStatus={freshness.status}
      ageLabel={freshness.ageLabel}
      metrics={[]}
      topSlot={topHeader}
      tabs={tabs}
      rightRail={<McpRightRail board={data.board} />}
    />
  );
}

function McpRightRail({ board }: { board: EcosystemBoard }) {
  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top MCP Servers
        </h3>
        {board.items.length === 0 ? (
          <p className="mt-2 text-[11px] text-text-tertiary">No rows yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {board.items.slice(0, 10).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-[11px]">
                <EntityLogo
                  src={mcpEntityLogoUrl(item, 16)}
                  name={item.title}
                  size={16}
                  shape="square"
                  alt=""
                />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate font-mono text-functional hover:underline"
                  title={item.vendor ? `${item.title} - ${item.vendor}` : item.title}
                >
                  {item.title}
                </a>
                <LivenessPill liveness={item.liveness} />
                <span className="font-mono tabular-nums text-text-secondary">
                  {item.signalScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Worker Key
        </h3>
        <p className="mt-2 text-[11px] text-text-secondary">
          The top-level page reads the Supabase-published leaderboard at
          <span className="font-mono text-text-primary"> trending-mcp</span>.
        </p>
        <Link
          href="/api/mcp/trending"
          className="mt-3 inline-flex font-mono text-[11px] text-functional hover:underline"
        >
          api preview
        </Link>
      </div>
    </aside>
  );
}
