import type { Metadata } from "next";
import Link from "next/link";

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

  return (
    <SignalSourcePage
      source="mcp"
      sourceLabel="MCP"
      mode="TRENDING"
      subtitle="Merged MCP server momentum across official registry, Glama, PulseMCP, and Smithery feeds."
      fetchedAt={data.fetchedAt}
      freshnessStatus={freshness.status}
      ageLabel={freshness.ageLabel}
      metrics={metrics}
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
