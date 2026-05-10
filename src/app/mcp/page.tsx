// /mcp — Trending MCP servers, multi-column leaderboard.
//
// Adopted the homepage's `Live / top 50` layout (LiveTopTable) — sortable
// columns for Use / 24h / 7d / 30d, per-row sparkline, source-presence
// pills, registry-filter chips. Sortable columns replace the previous
// window-tab strip (24h trending = sort by the 24H column).
//
// ISR cadence (revalidate = 60).

import Link from "next/link";
import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { MarkVisited } from "@/components/layout/MarkVisited";
import {
  LiveMcpTable,
  type McpRow,
  type CategoryFacet,
} from "@/components/mcp/LiveMcpTable";

import {
  getMcpSignalData,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import { rankMcpItems } from "@/lib/mcp-ranking";
import { mcpEntityLogoUrl } from "@/lib/logos";
import { absoluteUrl } from "@/lib/seo";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

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

// ---- Logo resolution (extracted from the prior McpAvatar) -------------------
// Same priority chain we already shipped, but returns the URL directly so the
// table component can hand it to <EntityLogo>. EntityLogo's own monogram
// fallback handles 404s, so a never-null answer isn't required here.

const MCP_REGISTRY_HOMEPAGE: Record<string, string> = {
  smithery: "https://smithery.ai",
  glama: "https://glama.ai",
  pulsemcp: "https://pulsemcp.com",
  official: "https://modelcontextprotocol.io",
  "awesome-mcp": "https://github.com/punkpeye/awesome-mcp-servers",
};

function registryFavicon(item: EcosystemLeaderboardItem): string | null {
  const reg = item.mcp?.sources?.[0];
  const home = reg ? MCP_REGISTRY_HOMEPAGE[reg] : null;
  if (!home) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    new URL(home).host,
  )}&sz=64`;
}

function repoOwnerAvatar(linkedRepo: string | null | undefined): string | null {
  if (!linkedRepo) return null;
  const owner = linkedRepo.split("/", 1)[0];
  return owner
    ? `https://github.com/${encodeURIComponent(owner)}.png?size=80`
    : null;
}

function authorAvatar(author: string | null | undefined): string | null {
  if (!author) return null;
  const trimmed = author.trim();
  if (!trimmed || /[^a-zA-Z0-9-]/.test(trimmed)) return null;
  return `https://github.com/${encodeURIComponent(trimmed)}.png?size=80`;
}

function resolveMcpLogo(item: EcosystemLeaderboardItem): string | null {
  return (
    (item.logoUrl && !item.logoUrl.includes(".invalid")
      ? item.logoUrl
      : null) ??
    repoOwnerAvatar(item.linkedRepo) ??
    authorAvatar(item.author) ??
    registryFavicon(item) ??
    mcpEntityLogoUrl(item, 40)
  );
}

// ---- Page -------------------------------------------------------------------

export default async function McpPage() {
  // Pull MCP board and refresh the repo store so linked-repo rows can surface
  // real GitHub deltas/sparklines when registry install windows are cold.
  // Same hydration pattern /githubrepo uses (src/app/githubrepo/page.tsx).
  const [data] = await Promise.all([
    getMcpSignalData(),
    refreshTrendingFromStore(),
  ]);
  const items = data.board.items;
  const repos = getDerivedRepos();
  const repoByFullName = new Map<string, Repo>();
  for (const r of repos) {
    repoByFullName.set(r.fullName.toLowerCase(), r);
  }

  const total = items.length;
  const newCount = items.filter(isNewWithin7d).length;
  const topByPopularity = [...items].sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  )[0];
  const mostCited = [...items].sort(
    (a, b) => (b.crossSourceCount ?? 0) - (a.crossSourceCount ?? 0),
  )[0];

  // Build the table rows. Ranking matches the OSS-Insight + TrendShift
  // pattern from /githubrepo: multi-registry consensus first (a server
  // listed in 4 registries beats one listed in 1), then signalScore /
  // popularity within. The filter requires at least one fillable signal
  // (real registry use OR a tracked linked repo with stars OR a release
  // date) so blank cells don't dominate the top of the board.
  const TABLE_ROW_LIMIT = 1000;
  // Fallback chain for "what GitHub repo does this MCP live on":
  //   1. derived-repos (full Repo with deltas + sparkline)
  //   2. data/repo-metadata.json (~870 repos with stars/forks/lastCommit
  //      but no deltas) — fills Use + Released columns even when the
  //      repo isn't in our trending feed.
  const ranked = rankMcpItems(items, repoByFullName);

  // Rank by data-richness first, then multi-registry consensus, then
  // popularity, then signalScore. This is the OSS-Insight + TrendShift
  // equivalent for MCPs (cross-registry agreement = the primary "fused
  // trending" signal) but with rows that actually render data lifted to
  // the top so the visible board doesn't open with empty cells.
  // Filter is permissive — any item with multi-source presence, popularity,
  // a release date, OR signalScore > 0 passes — and we then take top 50.
  // Charts get synthesized from metadata for rows without a real series
  // (see toLiveRow mapper below) so every visible row has a sparkline.
  const mcpRows: McpRow[] = ranked
    .slice(0, TABLE_ROW_LIMIT)
    .map(({ item, linked: linkedRepo, meta }) => {
      const sources = item.mcp?.sources ?? [];

      // Stars source: derived repo first, then bundled metadata. Used as a
      // real fallback for the Use column; deltas require linked repo history.
      const repoStars = linkedRepo?.stars ?? meta?.stars ?? 0;

      // 24h/7d/30d: prefer registry installs, then real linked-repo deltas,
      // then a heuristic estimate from total stars / age (capped so a 5y old
      // repo doesn't show fake "+0.5/24h" — only kicks in when we have at
      // least the createdAt to amortise against).
      const installs24h = item.mcp?.installs24h;
      const installs7d = item.mcp?.installs7d;
      const installs30d = item.mcp?.installs30d;
      const hasNonZeroRegistryDelta =
        (typeof installs24h === "number" && installs24h !== 0) ||
        (typeof installs7d === "number" && installs7d !== 0) ||
        (typeof installs30d === "number" && installs30d !== 0);
      const hasRealRepoDelta = Boolean(
        linkedRepo &&
          ((linkedRepo.starsDelta24h ?? 0) !== 0 ||
            (linkedRepo.starsDelta7d ?? 0) !== 0 ||
            (linkedRepo.starsDelta30d ?? 0) !== 0),
      );
      const delta24h = hasNonZeroRegistryDelta
        ? (installs24h ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta24h ?? 0)
          : 0;
      const delta7d = hasNonZeroRegistryDelta
        ? (installs7d ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta7d ?? 0)
          : 0;
      const delta30d = hasNonZeroRegistryDelta
        ? (installs30d ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta30d ?? 0)
          : 0;
      const deltaUnit: McpRow["deltaUnit"] = hasNonZeroRegistryDelta
        ? "installs"
        : hasRealRepoDelta
          ? "stars"
          : null;

      // Sparkline: real series from a derived repo only. Without one, an empty
      // array keeps the "no chart" state honest.
      const sparklineData: number[] = linkedRepo?.sparklineData ?? [];

      // Use column: registry popularity first, then any repo stars source.
      const registryUse = item.popularity ?? 0;
      const useValue = registryUse > 0 ? registryUse : repoStars;
      const useLabel =
        item.sourceMetricLabel
          ? item.sourceMetricLabel.toLowerCase()
          : registryUse > 0 && item.popularityLabel
            ? item.popularityLabel.toLowerCase()
          : registryUse > 0
            ? sources[0] ?? "mcp"
            : repoStars > 0
              ? "github stars"
              : (sources[0] ?? "mcp");

      // Released column: registry release date, then linked-repo last-commit,
      // then bundled metadata pushedAt / createdAt.
      const releasedAt =
        item.mcp?.lastReleaseAt ??
        linkedRepo?.lastCommitAt ??
        linkedRepo?.createdAt ??
        meta?.pushedAt ??
        meta?.updatedAt ??
        meta?.createdAt ??
        null;

      return {
        id: item.id,
        title: item.title,
        href: `/mcp/${slugForMcp(item)}`,
        logo: resolveMcpLogo(item),
        author: item.vendor ?? item.author ?? null,
        sourceLabel: useLabel,
        use: useValue,
        releasedAt,
        verified: Boolean(item.verified),
        sources: {
          s: sources.includes("smithery"),
          g: sources.includes("glama"),
          p: sources.includes("pulsemcp"),
          o: sources.includes("official"),
        },
        crossSourceCount: item.crossSourceCount ?? 1,
        delta24h,
        delta7d,
        delta30d,
        deltaUnit,
        sparklineData,
      };
    });

  // Source-facet category counts for the filter chips. Drop empty buckets.
  const categories: CategoryFacet[] = (
    [
      { id: "smithery", label: "SMITHERY", key: "s" as const },
      { id: "glama", label: "GLAMA", key: "g" as const },
      { id: "pulsemcp", label: "PULSEMCP", key: "p" as const },
      { id: "official", label: "OFFICIAL", key: "o" as const },
    ] as const
  )
    .map((c) => ({
      id: c.id,
      label: c.label,
      count: mcpRows.filter((r) => r.sources[c.key]).length,
    }))
    .filter((c) => c.count > 0);

  // M2 — "TRENDING THIS WEEK" leaderboard. Ranks rows by 7d delta using
  // whatever signal the fallback chain populated (installs from snapshots,
  // stars from linked-repo, …). Until daily mcp-usage-snapshots accrue
  // sustainably, this list is short — by design surface what's measurable
  // rather than synthesize fake numbers.
  const topMovers = [...mcpRows]
    .filter((r) => r.delta7d > 0 && r.deltaUnit !== null)
    .sort((a, b) => b.delta7d - a.delta7d)
    .slice(0, 5);

  return (
    <main className="home-surface">
      <MarkVisited routeKey="mcp" count={mcpRows.length} />
      <PageHead
        crumb={
          <>
            <b>MCP</b> · TERMINAL · /MCP
          </>
        }
        h1="Model Context Protocol leaderboard."
        lede="Trending MCP servers across four registries — Smithery, Glama, PulseMCP, Anthropic Official. Sort by 24h / 7d / 30d delta to see what's actually moving."
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
          sub: `source · ${data.source} · revalidate 60s`,
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
            label: "TOP · CONNECTIONS",
            value: topByPopularity?.popularity
              ? compactNumber(topByPopularity.popularity)
              : "—",
            sub: topByPopularity?.title ?? "—",
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
            value: mostCited?.crossSourceCount ?? 0,
            sub: mostCited?.title ?? "—",
            tone: "default",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      <TrendingThisWeek movers={topMovers} totalRows={mcpRows.length} />

      <LiveMcpTable rows={mcpRows} categories={categories} totalCount={total} />

      <div
        style={{
          marginTop: 24,
          padding: "10px 14px",
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-300)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>
          {"// "}
          <span style={{ color: "var(--v4-ink-100)" }}>RAW PAYLOAD</span>
          {" · unranked, full table, JSON"}
        </span>
        <Link
          href="/api/mcp/trending"
          style={{ color: "var(--v4-acc)", textDecoration: "none" }}
        >
          api/mcp/trending →
        </Link>
      </div>
    </main>
  );
}

interface TrendingThisWeekProps {
  movers: McpRow[];
  totalRows: number;
}

/**
 * Top-5 MCPs by best-available 7d momentum signal. Reads `mcpRows[].delta7d`
 * which is already populated by the fallback chain in McpPage (snapshot
 * deltas → linked-repo star deltas → 0). Until the daily mcp-usage-snapshot
 * cron fully accrues — needs ~7 days of consecutive runs to power 7d
 * windows for every server — most rows have delta7d=0 and the section
 * shows whatever real movers exist. Not a synthesized fake.
 */
function TrendingThisWeek({ movers, totalRows }: TrendingThisWeekProps) {
  const moverCount = movers.length;
  const totalLabel = totalRows.toLocaleString("en-US");
  const status =
    moverCount === 0
      ? `momentum signals warming · daily snapshots accruing across ${totalLabel} servers`
      : moverCount === 1
        ? `1 mover · 7d window · across ${totalLabel} servers`
        : `${moverCount} movers · 7d window · across ${totalLabel} servers`;
  return (
    <section
      aria-labelledby="trending-this-week-h"
      style={{
        marginTop: 16,
        marginBottom: 16,
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-050)",
        borderRadius: 4,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--v4-line-200)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <h3
          id="trending-this-week-h"
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--v4-ink-100)",
            fontWeight: 600,
          }}
        >
          {"// "}TRENDING THIS WEEK
        </h3>
        <span style={{ color: "var(--v4-ink-400)" }}>{status}</span>
      </header>
      {moverCount === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "14px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-300)",
          }}
        >
          {"// "}no 7d movers detected. The mcp-usage-snapshot cron writes a
          daily snapshot to Redis at 03:30 UTC; the 7d delta becomes
          computable once a snapshot from 7 days ago exists. Sort the table
          below by the 24h column to see whatever short-window movement is
          measurable today.
        </p>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: "10px 14px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 8,
          }}
        >
          {movers.map((row, idx) => {
            const deltaLabel =
              row.delta7d >= 1000
                ? new Intl.NumberFormat("en-US", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(row.delta7d)
                : Math.round(row.delta7d).toLocaleString("en-US");
            const unitLabel = row.deltaUnit ?? "";
            return (
              <li key={row.id}>
                <Link
                  href={row.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid var(--v4-line-200)",
                    borderRadius: 3,
                    background: "var(--v4-bg-100)",
                    textDecoration: "none",
                    color: "var(--v4-ink-100)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 10,
                      color: "var(--v4-ink-400)",
                      width: 18,
                      flexShrink: 0,
                    }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {row.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.logo}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: "var(--v4-bg-200)",
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 12,
                    }}
                  >
                    {row.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--v4-up, #4ade80)",
                      flexShrink: 0,
                    }}
                    title={`+${deltaLabel} ${unitLabel} · 7d`}
                  >
                    ↑{deltaLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
