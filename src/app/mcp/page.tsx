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
  ecosystemBoardToRows,
  formatCompact,
  getMcpSignalData,
  type EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import { classifyFreshness } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending MCP - TrendingRepo",
  description:
    "Top Model Context Protocol servers merged from official registry, Glama, PulseMCP, and Smithery signals.",
  alternates: { canonical: absoluteUrl("/mcp") },
  openGraph: {
    title: "Trending MCP - TrendingRepo",
    description:
      "A live leaderboard for Model Context Protocol servers across MCP registries.",
    url: absoluteUrl("/mcp"),
  },
};

export default async function McpPage() {
  const data = await getMcpSignalData();
  const freshness = classifyFreshness("mcp", data.fetchedAt);
  const rows = ecosystemBoardToRows(data.board);

  const metrics: SignalMetricCardProps[] = [
    {
      label: "MCP Servers",
      value: data.board.items.length,
      helper: sourceHelper(data.board),
      sparkTone: "brand",
    },
    {
      label: "Top Signal",
      value: signalValue(data.board.items[0]),
      helper: data.board.items[0]?.title ?? "no rows",
      sparkTone: "up",
    },
    {
      label: "Top Popularity",
      value: formatCompact(maxPopularity(data.board)),
      helper: data.board.items[0]?.popularityLabel ?? "registry signal",
      sparkTone: "warning",
    },
    {
      label: "Surface",
      value: "4",
      helper: "official / glama / pulsemcp / smithery",
      sparkTone: "info",
    },
    {
      label: "Worker Key",
      value: "MCP",
      helper: "trending-mcp",
      sparkTone: "brand",
    },
    {
      label: "Data Tier",
      value: data.source.toUpperCase(),
      helper: data.fetchedAt ? freshness.ageLabel : "missing",
      sparkTone: data.source === "redis" ? "up" : "warning",
    },
  ];

  const tabs: SignalTabSpec[] = [
    {
      id: "all",
      label: "MCP Servers",
      rows,
      columns: ["rank", "title", "source", "topic", "linkedRepo", "engagement", "age", "signal"],
      emptyTitle: "No MCP leaderboard rows have landed yet.",
      emptySubtitle: "Waiting for the publish-leaderboards job to write trending-mcp.",
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
                  title={item.vendor ? `${item.title} — ${item.vendor}` : item.title}
                >
                  {item.title}
                </a>
                {item.verified ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-up" title="Official vendor">
                    ✓
                  </span>
                ) : null}
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

function sourceHelper(board: EcosystemBoard): string {
  return `${board.source} / ${board.key}`;
}

function signalValue(item: { signalScore: number } | undefined): string {
  return item ? String(Math.round(item.signalScore)) : "-";
}

function maxPopularity(board: EcosystemBoard): number | null {
  const values = board.items
    .map((item) => item.popularity)
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}
