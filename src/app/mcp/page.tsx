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

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RankRow } from "@/components/ui/RankRow";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import {
  WindowedRanking,
  type WindowedRow,
} from "@/components/leaderboards/WindowedRanking";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import {
  getMcpSignalData,
  type EcosystemBoard,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import {
  LivenessPill,
  classifyLiveness,
} from "@/components/signal/LivenessPill";
import { classifyFreshness } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildEcosystemHeader } from "@/components/signal/ecosystemTopHeader";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import {
  TerminalCellHotness,
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
  return [...items].sort(
    (a, b) =>
      (b.mcp?.downloadsCombined7d ?? -1) - (a.mcp?.downloadsCombined7d ?? -1),
  );
}

function sortByHotness(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  // Hottest by velocity: rank by Δhotness (current - 7d-prior) when both
  // values are present. Falls back to absolute `hotness` (raw scorer
  // output) and finally `signalScore` so cold-start rows still place. The
  // 7d snapshot is populated by the `hotness-snapshot` worker fetcher; for
  // the first 7 days of the rolling window everything sorts on absolute.
  return [...items].sort((a, b) => {
    const av =
      a.hotness !== undefined && a.hotnessPrev7d !== undefined
        ? a.hotness - a.hotnessPrev7d
        : (a.hotness ?? a.signalScore);
    const bv =
      b.hotness !== undefined && b.hotnessPrev7d !== undefined
        ? b.hotness - b.hotnessPrev7d
        : (b.hotness ?? b.signalScore);
    return bv - av;
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
  // matching sort/filter slice.
  const mostDownloaded = sortByDownloads(items);
  const hottest = sortByHotness(items);
  const livenessChamps = filterLivenessChampions(items);
  const newThisWeek = filterNewThisWeek(items);

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

  // ---- Top movers (// 03) — 24h / 7d / 30d windowed install velocity. ----
  // installsDelta1d/7d/30d come from the worker's npm-downloads + smithery-
  // rank fetchers. Many MCPs don't yet have install telemetry (the npm-
  // dependents path lights up only for packages that publish to npm), so
  // we drop rows with no movement to avoid a wall of zeroes.
  const buildMcpRow = (
    item: EcosystemLeaderboardItem,
    delta: number,
  ): WindowedRow => {
    const author = item.vendor ?? item.author ?? item.linkedRepo ?? "";
    return {
      id: `mcp-${item.id}`,
      href: `/mcp/${slugForMcp(item)}`,
      avatarText: item.title.slice(0, 2).toUpperCase(),
      avatarSrc: item.logoUrl,
      title: author ? `${author} / ${item.title}` : item.title,
      desc: item.description ?? `${item.crossSourceCount} registries`,
      metric: {
        value: compactNumber(Math.abs(delta)),
        label: "INSTALLS",
      },
      delta: {
        value: `${delta >= 0 ? "+" : "-"}${compactNumber(Math.abs(delta))}`,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      },
    };
  };
  const moversByWindow = (key: "1d" | "7d" | "30d"): WindowedRow[] => {
    const get = (it: EcosystemLeaderboardItem) =>
      key === "1d"
        ? it.installsDelta1d ?? 0
        : key === "7d"
          ? it.installsDelta7d ?? 0
          : it.installsDelta30d ?? 0;
    return [...items]
      .map((it) => ({ it, d: get(it) }))
      .filter(({ d }) => d !== 0)
      .sort((a, b) => b.d - a.d)
      .slice(0, 10)
      .map(({ it, d }) => buildMcpRow(it, d));
  };
  const movers24h = moversByWindow("1d");
  const movers7d = moversByWindow("7d");
  const movers30d = moversByWindow("30d");
  const moversEmpty =
    movers24h.length === 0 && movers7d.length === 0 && movers30d.length === 0;
  // True outage signal: Redis returned no items for the leaderboard at all.
  // Used to upgrade empty-state copy from "no data yet" (cold-start) to
  // "data warming up" (something's actually wrong upstream — e.g. a stale
  // trending-mcp key or a worker fetch that hasn't recovered).
  const itemsEmpty = items.length === 0;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>MCP</b> · TERMINAL · /MCP
          </>
        }
        h1="Model Context Protocol leaderboard."
        lede="Trending MCP servers ranked by stars, downloads, and cross-registry presence. Track install velocity, tool counts, and breakout candidates as registries publish."
        clock={
          <>
            <span className="big">{total.toLocaleString("en-US")}</span>
            <span className="muted">SERVERS · TRACKED</span>
            <FreshnessBadge source="mcp" lastUpdatedAt={data.fetchedAt} />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// MCP TAPE",
          headline: `${total.toLocaleString("en-US")} SERVERS`,
          sub: `source · ${data.source} · revalidate 30m`,
        }}
        text={
          <>
            <b>{total.toLocaleString("en-US")} MCP servers</b> tracked across{" "}
            <span style={{ color: "var(--v4-acc)" }}>4 registries</span>.{" "}
            <span style={{ color: "var(--v4-money)" }}>{newCount}</span> shipped
            a release in the last 7 days.
          </>
        }
        actionHref="/api/mcp/trending"
        actionLabel="API →"
      />

      <KpiBand
        cells={[
          {
            label: "TOTAL · MCP",
            value: total.toLocaleString("en-US"),
            sub: "tracked",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "TOP · STARS",
            value: topByStars ? compactNumber(starsOf(topByStars)) : "0",
            sub: topByStars?.title ?? "—",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "NEW · 7D",
            value: newCount,
            sub: "fresh releases",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "MOST · CITED",
            value: mostCited ? citationsOf(mostCited) : 0,
            sub: mostCited?.title ?? "—",
            tone: "default",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Top MCP servers"
        meta={
          <>
            <b>{topByStarsList.length}</b> · by stars
          </>
        }
      />
      <section className="board">
        {topByStarsList.length === 0 ? (
          <div className="p-8 text-sm text-text-secondary">
            {itemsEmpty
              ? "MCP data warming up — the trending-mcp feed hasn't published yet. Check back in a few minutes."
              : "No MCP servers tracked yet."}
          </div>
        ) : (
          topByStarsList.map((item, index) => {
            const stars = starsOf(item);
            const author = item.vendor ?? item.author ?? item.linkedRepo ?? "";
            return (
              <RankRow
                key={item.id}
                rank={index + 1}
                href={`/mcp/${slugForMcp(item)}`}
                first={index === 0}
                avatar={
                  <span className="av">
                    {item.title.slice(0, 2).toUpperCase()}
                  </span>
                }
                title={
                  author ? (
                    <>
                      {author} <span className="o">/</span> {item.title}
                    </>
                  ) : (
                    item.title
                  )
                }
                desc={
                  item.description ?? `${item.crossSourceCount} registries`
                }
                metric={{
                  value: compactNumber(stars),
                  label: "STARS",
                }}
                delta={{
                  value: `${item.crossSourceCount}× reg`,
                  direction: item.crossSourceCount >= 2 ? "up" : "flat",
                }}
              />
            );
          })
        )}
      </section>

      <SectionHead
        num="// 02"
        title="New / breakout"
        meta={
          <>
            <b>{breakouts.length}</b> · last 7d
          </>
        }
      />
      <section className="board">
        {breakouts.length === 0 ? (
          <div className="p-8 text-sm text-text-secondary">
            {itemsEmpty
              ? "Release feed warming up — waiting on the next collector cycle."
              : "No fresh MCP releases yet."}
          </div>
        ) : (
          breakouts.map((item, index) => {
            const releasedAt =
              item.mcp?.lastReleaseAt ?? item.postedAt ?? null;
            const author = item.vendor ?? item.author ?? item.linkedRepo ?? "";
            return (
              <RankRow
                key={item.id}
                rank={index + 1}
                href={`/mcp/${slugForMcp(item)}`}
                first={index === 0}
                avatar={
                  <span className="av">
                    {item.title.slice(0, 2).toUpperCase()}
                  </span>
                }
                title={
                  author ? (
                    <>
                      {author} <span className="o">/</span> {item.title}
                    </>
                  ) : (
                    item.title
                  )
                }
                desc={item.description ?? "MCP server"}
                metric={{
                  value: releasedAt ? formatAge(releasedAt) : "—",
                  label: "RELEASED",
                }}
                delta={{
                  value: isNewWithin7d(item) ? "NEW" : "—",
                  direction: isNewWithin7d(item) ? "up" : "flat",
                }}
              />
            );
          })
        )}
      </section>

      <SectionHead
        num="// 03"
        title="Top movers"
        meta={
          <>
            <b>installs</b> · 24h / 7d / 30d
          </>
        }
      />
      {moversEmpty ? (
        // Install velocity comes from the npm-downloads + smithery-rank +
        // mcp-usage-snapshot worker fetchers. When none of the three windows
        // have non-zero deltas (cold start, missing daily snapshots, or all
        // tracked MCPs are sub-npm packages), don't show three empty tabs —
        // render one clear placeholder so the section reads as "warming up"
        // instead of broken.
        <section className="board">
          <div className="p-8 text-sm text-text-secondary">
            Install velocity warming up — waiting on the next snapshot from the
            mcp-usage worker. New MCPs need at least one prior daily snapshot
            before deltas appear here.
          </div>
        </section>
      ) : (
        <WindowedRanking
          rows24h={movers24h}
          rows7d={movers7d}
          rows30d={movers30d}
          defaultWindow="7d"
        />
      )}

      <p className="text-[11px] text-text-tertiary mt-4">
        Want the full table? <Link href="/api/mcp/trending">api/mcp/trending</Link> ships
        the raw payload.
      </p>
    </main>
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
                {item.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.logoUrl}
                    alt=""
                    width={16}
                    height={16}
                    loading="lazy"
                    className="h-4 w-4 flex-none rounded-sm object-contain"
                  />
                ) : (
                  <span className="h-4 w-4 flex-none rounded-sm bg-bg-muted" />
                )}
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
