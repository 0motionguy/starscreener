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
import { mcpEntityLogoUrl } from "@/lib/logos";
import { absoluteUrl } from "@/lib/seo";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import {
  mcpUsageMetric,
  rankMcpItems,
  type McpTrendSource,
} from "@/lib/mcp-ranking";
import { synthesizeSparkline } from "@/lib/derived-repos/sparkline";
import type { Repo } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Trending MCP - TrendingRepo",
  description:
    "Top Model Context Protocol servers ranked by usage velocity, adoption, and cross-registry presence.",
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
  const iso = item.mcp?.lastReleaseAt;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < SEVEN_DAYS_MS;
}

function trendSourceLabel(source: McpTrendSource): string {
  switch (source) {
    case "registry-velocity":
      return "registry velocity";
    case "linked-repo-velocity":
      return "repo velocity";
    case "domain-scorer":
      return "MCP scorer";
    case "momentum":
      return "momentum";
    case "smithery-rank":
      return "Smithery rank";
    case "source-rank":
      return "source rank";
    case "none":
    default:
      return "pending";
  }
}

function qualityLabel(item: EcosystemLeaderboardItem): string | null {
  const bits: string[] = [];
  if (typeof item.mcp?.qualityScore === "number") {
    bits.push(`Q${Math.round(item.mcp.qualityScore)}`);
  }
  if (item.mcp?.securityGrade) {
    bits.push(`grade ${item.mcp.securityGrade}`);
  }
  if (item.mcp?.isStdio || item.liveness?.isStdio) {
    bits.push("stdio");
  }
  return bits.length > 0 ? bits.join(" · ") : null;
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
  // Pull MCP board AND fresh trending data so the linked-repo fallback can
  // surface real GitHub star deltas / sparklines on rows where the registry
  // installs snapshot is still cold. Same hydration pattern /githubrepo
  // uses (src/app/githubrepo/page.tsx).
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
  const mostCited = [...items].sort(
    (a, b) => (b.crossSourceCount ?? 0) - (a.crossSourceCount ?? 0),
  )[0];

  // Build the table rows. Ranking is the shared MCP trend model used by the
  // homepage too: registry velocity first, then the existing MCP domain scorer
  // and source-rank fallbacks. Raw absolute popularity is fallback data only.
  const TOP_N = 50;
  // Fallback chain for "what GitHub repo does this MCP live on":
  //   1. derived-repos (full Repo with deltas + sparkline)
  //   2. data/repo-metadata.json (~870 repos with stars/forks/lastCommit
  //      but no deltas) — fills Use + Released columns even when the
  //      repo isn't in our trending feed.
  const ranked = rankMcpItems(items, repoByFullName);
  const topTrend = ranked[0];

  const mcpRows: McpRow[] = ranked
    .filter(({ hasDisplayData }) => hasDisplayData)
    .slice(0, TOP_N)
    .map(
      ({
        item,
        linked: linkedRepo,
        meta,
        trendRank,
        trendSource,
        trendLabel,
      }) => {
      const sources = item.mcp?.sources ?? [];

      // Stars source: derived repo first, then bundled metadata. Used only as
      // a fallback display value; rank/deltas come from real source windows.
      const repoStars = linkedRepo?.stars ?? meta?.stars ?? 0;
      // 24h/7d/30d: prefer registry installs, then real linked-repo deltas,
      // otherwise render a dash. Do not estimate velocity from repo age.
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

      // Sparkline fallback chain:
      //   1. Real linked-repo series
      //   2. Synthesize from real registry usage + installs deltas
      let sparklineData: number[] = linkedRepo?.sparklineData ?? [];
      const usageMetric = mcpUsageMetric(item);
      if (sparklineData.length < 2 && usageMetric) {
        const popD24 = item.mcp?.installs24h ?? item.installsDelta1d ?? 0;
        const popD7 = item.mcp?.installs7d ?? item.installsDelta7d ?? 0;
        const popD30 = item.mcp?.installs30d ?? item.installsDelta30d ?? 0;
        if (popD24 !== 0 || popD7 !== 0 || popD30 !== 0) {
          sparklineData = synthesizeSparkline(
            usageMetric.value,
            popD24,
            popD7,
            popD30,
          );
        }
      }

      // Use column: MCP-native usage metrics first, then raw registry
      // popularity when it is more than a one-item placeholder, then repo stars.
      const registryUse = item.popularity ?? 0;
      const useValue =
        usageMetric
          ? usageMetric.value
          : registryUse > 1
            ? registryUse
            : repoStars;
      const useLabel =
        usageMetric
          ? usageMetric.label
          : registryUse > 1 && item.popularityLabel
            ? item.popularityLabel.toLowerCase()
            : registryUse > 1
              ? sources[0] ?? "mcp"
            : repoStars > 0
              ? "github stars"
              : (sources[0] ?? "mcp");

      // Seen column: registry release date, linked-repo activity, bundled
      // metadata, then the published MCP timestamp that exists on every row.
      const releasedAt =
        item.mcp?.lastReleaseAt ??
        linkedRepo?.lastCommitAt ??
        linkedRepo?.createdAt ??
        meta?.pushedAt ??
        meta?.updatedAt ??
        meta?.createdAt ??
        item.postedAt ??
        null;

      return {
        id: item.id,
        title: item.title,
        href: `/mcp/${slugForMcp(item)}`,
        logo: resolveMcpLogo(item),
        author: item.vendor ?? item.author ?? null,
        sourceLabel: useLabel,
        use: useValue,
        trend: trendRank,
        trendSourceLabel: trendSourceLabel(trendSource),
        trendLabel,
        hotness: item.hotness ?? 0,
        momentum: item.signalScore ?? 0,
        qualityLabel: qualityLabel(item),
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
      },
    );

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

  return (
    <main className="home-surface">
      <MarkVisited routeKey="mcp" count={total} />
      <PageHead
        crumb={
          <>
            <b>MCP</b> · TERMINAL · /MCP
          </>
        }
        h1="Model Context Protocol leaderboard."
        lede="Trending MCP servers ranked from the source signals we actually have: registry velocity when populated, then source order, source-native ranks, the MCP scorer, and momentum."
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
            <span style={{ color: "var(--v4-money)" }}>{newCount}</span> have
            dated source releases in the last 7 days.
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
            label: "TOP · RANKED",
            value: topTrend?.trendRank ? compactNumber(topTrend.trendRank) : "—",
            sub: topTrend?.item.title ?? "—",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "DATED · 7D",
            value: newCount,
            sub: "source releases",
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
          <span style={{ color: "var(--v4-ink-100)" }}>RANKED PAYLOAD</span>
          {" · source trend fields, full table, JSON"}
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
