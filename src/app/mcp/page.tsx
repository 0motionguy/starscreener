// /mcp — V4 MCP-server leaderboard (terminal aesthetic).
//
// Composes V4 primitives directly: PageHead + VerdictRibbon + KpiBand
// + SectionHead + RankRow. The previous V3-Tailwind chrome (TerminalFeedTable,
// SignalSourcePage, NewsTopHeaderV3) is retired in favour of the canonical
// V4 leaderboard pattern used across /breakouts, /consensus, /signals.
//
// ISR cadence (revalidate = 1800) mirrors the rest of the V4 surfaces.

import Link from "next/link";
import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RankRow } from "@/components/ui/RankRow";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

import {
  getMcpSignalData,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Trending MCP - TrendingRepo",
  description:
    "Top Model Context Protocol servers ranked by stars, downloads, and cross-registry presence.",
  alternates: { canonical: absoluteUrl("/mcp") },
  openGraph: {
    title: "Trending MCP - TrendingRepo",
    description:
      "A live leaderboard for Model Context Protocol servers across MCP registries.",
    url: absoluteUrl("/mcp"),
  },
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function starsOf(item: EcosystemLeaderboardItem): number {
  // Prefer absolute stars from the publish payload; fall back to popularity
  // when the label says "Stars". Items without star data return 0 so they
  // sort to the bottom of the stars-leaderboard.
  if (item.popularityLabel === "Stars" && typeof item.popularity === "number") {
    return item.popularity;
  }
  return 0;
}

function citationsOf(item: EcosystemLeaderboardItem): number {
  // Cross-registry presence — counts how many registries this MCP appears
  // on. Best proxy for "most-cited" we have today.
  return item.crossSourceCount ?? 0;
}

function isNewWithin7d(item: EcosystemLeaderboardItem): boolean {
  const iso = item.mcp?.lastReleaseAt ?? item.postedAt;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < SEVEN_DAYS_MS;
}

function slugForMcp(item: EcosystemLeaderboardItem): string {
  return encodeURIComponent((item.id ?? "").toLowerCase());
}

export default async function McpPage() {
  const data = await getMcpSignalData();
  const items = data.board.items;

  // ---- KPI band metrics ----------------------------------------------------
  const total = items.length;
  const topByStars = [...items].sort((a, b) => starsOf(b) - starsOf(a))[0];
  const newCount = items.filter(isNewWithin7d).length;
  const mostCited = [...items].sort(
    (a, b) => citationsOf(b) - citationsOf(a),
  )[0];

  // ---- Top 10 by stars (// 01) --------------------------------------------
  const topByStarsList = [...items]
    .sort((a, b) => starsOf(b) - starsOf(a))
    .slice(0, 10);

  // ---- Breakouts / new (// 02) --------------------------------------------
  // Sort by lastRelease desc, capped at 10. Falls back to signalScore desc
  // when no release timestamp is available so the section still populates
  // on cold-start.
  const breakouts = [...items]
    .sort((a, b) => {
      const at = Date.parse(a.mcp?.lastReleaseAt ?? a.postedAt ?? "") || 0;
      const bt = Date.parse(b.mcp?.lastReleaseAt ?? b.postedAt ?? "") || 0;
      if (bt !== at) return bt - at;
      return (b.signalScore ?? 0) - (a.signalScore ?? 0);
    })
    .slice(0, 10);

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
            No MCP servers tracked yet.
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
            No fresh MCP releases yet.
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

      <p className="text-[11px] text-text-tertiary mt-4">
        Want the full table? <Link href="/api/mcp/trending">api/mcp/trending</Link> ships
        the raw payload.
      </p>
    </main>
  );
}

function formatAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const days = diff / 86_400_000;
  if (days < 1) {
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    return `${hours}h`;
  }
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(months / 12)}y`;
}
