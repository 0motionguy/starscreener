import type { Metadata } from "next";
import Link from "next/link";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import {
  ecosystemBoardToRows,
  getMcpSignalData,
  type EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import { classifyFreshness } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildEcosystemHeader } from "@/components/signal/ecosystemTopHeader";

const MCP_ACCENT = "rgba(58, 214, 197, 0.85)";

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

  const { cards, topStories } = buildEcosystemHeader({
    items: data.board.items,
    snapshotEyebrow: "// SNAPSHOT · NOW",
    snapshotLabel: "MCP SERVERS",
    snapshotRight: `${data.board.items.length.toLocaleString("en-US")} ITEMS`,
    volumeEyebrow: "// VOLUME · PER REGISTRY",
    topicsEyebrow: "// TOPICS · MENTIONED MOST",
    sourceLabelMap: {
      "official": "OFCL",
      "Official": "OFCL",
      "glama": "GLAMA",
      "Glama": "GLAMA",
      "pulsemcp": "PULSE",
      "PulseMCP": "PULSE",
      "smithery": "SMTHY",
      "Smithery": "SMTHY",
    },
  });

  const topHeader = (
    <NewsTopHeaderV3
      eyebrow={`// MCP · ${data.source.toUpperCase()} · ${freshness.ageLabel.toUpperCase()}`}
      status={`${data.board.items.length.toLocaleString("en-US")} TRACKED · 4 REGISTRIES`}
      cards={cards}
      topStories={topStories}
      accent={MCP_ACCENT}
    />
  );

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

