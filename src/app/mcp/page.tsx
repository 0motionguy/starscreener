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
import { getRepoMetadata } from "@/lib/repo-metadata";
import {
  synthesizeRecentRepoSparkline,
  synthesizeSparkline,
} from "@/lib/derived-repos/sparkline";
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

function lookupKeyForMcp(item: EcosystemLeaderboardItem): string | null {
  // Prefer the explicit `linkedRepo`; otherwise extract owner/name from a
  // github.com URL. Same fallback chain the home page uses for skill / mcp
  // rows (src/app/page.tsx ecosystemEntity), so MCP rows surface real
  // velocity even when the upstream merger left `linkedRepo` null.
  if (item.linkedRepo) return item.linkedRepo.toLowerCase();
  if (typeof item.url !== "string") return null;
  const m = item.url.match(/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase();
}

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
  const TOP_N = 50;
  // Fallback chain for "what GitHub repo does this MCP live on":
  //   1. derived-repos (full Repo with deltas + sparkline)
  //   2. data/repo-metadata.json (~870 repos with stars/forks/lastCommit
  //      but no deltas) — fills Use + Released columns even when the
  //      repo isn't in our trending feed.
  const enriched = items.map((item) => {
    const lookup = lookupKeyForMcp(item);
    const linked = lookup ? repoByFullName.get(lookup) : undefined;
    const metaFullName = item.linkedRepo ?? lookup ?? null;
    const meta = metaFullName ? getRepoMetadata(metaFullName) : null;
    const hasPopularity = (item.popularity ?? 0) > 0;
    const hasLinkedStars = Boolean(
      (linked && linked.stars > 0) || (meta && meta.stars > 0),
    );
    const hasReleaseDate = Boolean(
      item.mcp?.lastReleaseAt ||
        linked?.lastCommitAt ||
        meta?.pushedAt ||
        meta?.updatedAt,
    );
    // hasInstallsDeltas = item-level install deltas exist on the row even
    // without a linked repo. We can synthesize a curve from popularity +
    // those deltas via synthesizeSparkline.
    const hasInstallsDeltas = Boolean(
      hasPopularity &&
        ((item.installsDelta1d ?? 0) !== 0 ||
          (item.installsDelta7d ?? 0) !== 0 ||
          (item.installsDelta30d ?? 0) !== 0 ||
          (item.mcp?.installs24h ?? 0) !== 0 ||
          (item.mcp?.installs7d ?? 0) !== 0 ||
          (item.mcp?.installs30d ?? 0) !== 0),
    );
    // hasChartData = we can render a non-empty sparkline (real from derived,
    // synthesized from stars + createdAt, or synthesized from popularity +
    // installsDelta). Used to lift chart-able rows to the top of the board.
    const hasRealSparkline = Boolean(
      linked?.sparklineData && linked.sparklineData.length > 1,
    );
    const repoStars = linked?.stars ?? meta?.stars ?? 0;
    const repoCreatedAt = linked?.createdAt ?? meta?.createdAt ?? null;
    const hasSynthFromStars = repoStars > 0 && Boolean(repoCreatedAt);
    const hasChartData =
      hasRealSparkline || hasSynthFromStars || hasInstallsDeltas;
    const hasFillableData =
      hasPopularity || hasLinkedStars || hasReleaseDate || hasInstallsDeltas;
    return { item, linked, meta, hasFillableData, hasChartData };
  });

  // Trending score — the primary rank. Pre-fix the sort led with
  // `hasChartData` + `hasFillableData`, which lifted prettier-but-quiet
  // rows over genuinely active ones (e.g. open-code-review with use=21
  // outranked domain-check with use=271 + +5 weekly installs). The new
  // score weights install velocity heavy (24h heaviest, 30d lightest),
  // log-scales popularity so absolute counts can't fully dominate, and
  // adds small kickers for cross-registry presence + signalScore. Visual
  // polish flags drop to last-resort tiebreakers, so every top-N row is
  // there because it's *actually* moving.
  function trendingScore(e: (typeof enriched)[number]): number {
    const item = e.item;
    const linked = e.linked;
    // Prefer registry-reported install velocity (item.mcp.installs*),
    // fall back to top-level installsDelta*, then to the linked repo's
    // star deltas — same priority chain the row renderer uses for the
    // 24h/7d/30d columns, so the score lines up with what users see.
    const i24 = Math.max(
      item.mcp?.installs24h ?? 0,
      item.installsDelta1d ?? 0,
      linked?.starsDelta24h ?? 0,
    );
    const i7 = Math.max(
      item.mcp?.installs7d ?? 0,
      item.installsDelta7d ?? 0,
      linked?.starsDelta7d ?? 0,
    );
    const i30 = Math.max(
      item.mcp?.installs30d ?? 0,
      item.installsDelta30d ?? 0,
      linked?.starsDelta30d ?? 0,
    );
    const velocity = i24 * 5 + i7 * 1 + i30 * 0.2;
    const popularityFloor = Math.log1p(item.popularity ?? 0) * 2;
    const crossKicker = Math.max(0, (item.crossSourceCount ?? 1) - 1) * 1.5;
    const signal = item.signalScore ?? 0;
    return velocity + popularityFloor + crossKicker + signal;
  }

  // Filter is permissive — any item with multi-source presence,
  // popularity, a release date, OR signalScore > 0 passes — then we
  // take top 50 by trendingScore. Charts get synthesized from metadata
  // for rows without a real series (see toLiveRow mapper below) so
  // every visible row still has a sparkline.
  const ranked = enriched
    .filter((e) => {
      if (e.hasFillableData) return true;
      if ((e.item.crossSourceCount ?? 1) >= 2) return true;
      if ((e.item.signalScore ?? 0) > 0) return true;
      if (e.item.verified) return true;
      return false;
    })
    .sort((a, b) => {
      const sa = trendingScore(a);
      const sb = trendingScore(b);
      if (sb !== sa) return sb - sa;
      // Tiebreakers: chart-able + fillable rows surface first so the
      // visible board doesn't open with empty cells when scores match.
      if (a.hasChartData !== b.hasChartData) {
        return a.hasChartData ? -1 : 1;
      }
      if (a.hasFillableData !== b.hasFillableData) {
        return a.hasFillableData ? -1 : 1;
      }
      return 0;
    });

  const mcpRows: McpRow[] = ranked
    .slice(0, TOP_N)
    .map(({ item, linked: linkedRepo, meta }) => {
      const sources = item.mcp?.sources ?? [];

      // Stars source: derived repo first, then bundled metadata. Used for
      // synthesizing both the sparkline and the delta estimates.
      const repoStars = linkedRepo?.stars ?? meta?.stars ?? 0;
      const repoCreatedAt =
        linkedRepo?.createdAt ?? meta?.createdAt ?? null;

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
      const ageDays = repoCreatedAt
        ? Math.max(
            1,
            Math.ceil((Date.now() - Date.parse(repoCreatedAt)) / 86_400_000),
          )
        : null;
      const estDailyStars =
        ageDays && repoStars > 0 ? Math.max(0, repoStars / ageDays) : 0;
      const delta24h = hasNonZeroRegistryDelta
        ? (installs24h ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta24h ?? 0)
          : Math.round(estDailyStars);
      const delta7d = hasNonZeroRegistryDelta
        ? (installs7d ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta7d ?? 0)
          : Math.round(estDailyStars * 7);
      const delta30d = hasNonZeroRegistryDelta
        ? (installs30d ?? 0)
        : hasRealRepoDelta
          ? (linkedRepo?.starsDelta30d ?? 0)
          : Math.round(estDailyStars * 30);
      const deltaUnit: McpRow["deltaUnit"] = hasNonZeroRegistryDelta
        ? "installs"
        : hasRealRepoDelta
          ? "stars"
          : repoStars > 0
            ? "stars"
            : null;

      // Sparkline fallback chain:
      //   1. Real series from the linked derived repo
      //   2. Synthesize from total stars + repo age (linked or metadata)
      //   3. Synthesize from popularity + installs-deltas
      //   4. Last resort: synthesize from postedAt + signalScore so every
      //      visible row gets a curve. The shape is "discovery age vs
      //      current signal" — not a stars/installs claim, but visually
      //      honest about how long an MCP has been on our radar.
      let sparklineData: number[] = linkedRepo?.sparklineData ?? [];
      if (sparklineData.length < 2 && repoStars > 0 && repoCreatedAt) {
        sparklineData = synthesizeRecentRepoSparkline(repoStars, repoCreatedAt);
      }
      if (sparklineData.length < 2 && (item.popularity ?? 0) > 0) {
        const popD24 =
          item.mcp?.installs24h ?? item.installsDelta1d ?? 0;
        const popD7 =
          item.mcp?.installs7d ?? item.installsDelta7d ?? 0;
        const popD30 =
          item.mcp?.installs30d ?? item.installsDelta30d ?? 0;
        if (popD24 !== 0 || popD7 !== 0 || popD30 !== 0) {
          sparklineData = synthesizeSparkline(
            item.popularity ?? 0,
            popD24,
            popD7,
            popD30,
          );
        }
      }
      if (
        sparklineData.length < 2 &&
        (item.signalScore ?? 0) > 0 &&
        item.postedAt
      ) {
        sparklineData = synthesizeRecentRepoSparkline(
          Math.round(item.signalScore ?? 0),
          item.postedAt,
        );
      }

      // Use column: registry popularity first, then any repo stars source.
      const registryUse = item.popularity ?? 0;
      const useValue = registryUse > 0 ? registryUse : repoStars;
      const useLabel =
        registryUse > 0 && item.popularityLabel
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

      <LiveMcpTable rows={mcpRows} categories={categories} />

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
