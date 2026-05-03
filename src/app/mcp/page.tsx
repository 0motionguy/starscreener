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
import type { Repo } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "Trending MCP",
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

  // Build the table rows — only fields with real upstream data. Filter to
  // rows that carry at least a real `use_count` OR a release date OR a
  // verified-vendor stamp OR a matching trending-board entry (so MCPs whose
  // host repo is itself trending surface even when the registry hasn't
  // tagged them yet). The trending-board match is what unlocks the spark
  // sparkline + 24h/7d/30d star delta on this row.
  const mcpRows: McpRow[] = items
    .filter((item) => {
      if ((item.popularity ?? 0) > 0) return true;
      if (Boolean(item.mcp?.lastReleaseAt)) return true;
      if (item.verified) return true;
      const lookup = lookupKeyForMcp(item);
      if (lookup && repoByFullName.has(lookup)) return true;
      return false;
    })
    .map((item) => {
      const sources = item.mcp?.sources ?? [];
      const lookup = lookupKeyForMcp(item);
      const linkedRepo = lookup ? repoByFullName.get(lookup) : undefined;

      // Prefer the registry's installs delta when the side-channel snapshot
      // has accrued AND the value is real (non-zero); otherwise fall back to
      // the linked repo's star delta so the column isn't always +0 during MCP
      // cold-start. As of 2026-05-04 the upstream snapshot has installs24h=0
      // on every row (no daily snapshot has accrued yet), so the linked-repo
      // fallback is the path that actually surfaces velocity today.
      const installs24h = item.mcp?.installs24h;
      const installs7d = item.mcp?.installs7d;
      const installs30d = item.mcp?.installs30d;
      const hasNonZeroRegistryDelta =
        (typeof installs24h === "number" && installs24h !== 0) ||
        (typeof installs7d === "number" && installs7d !== 0) ||
        (typeof installs30d === "number" && installs30d !== 0);
      const delta24h = hasNonZeroRegistryDelta
        ? (installs24h ?? 0)
        : (linkedRepo?.starsDelta24h ?? 0);
      const delta7d = hasNonZeroRegistryDelta
        ? (installs7d ?? 0)
        : (linkedRepo?.starsDelta7d ?? 0);
      const delta30d = hasNonZeroRegistryDelta
        ? (installs30d ?? 0)
        : (linkedRepo?.starsDelta30d ?? 0);
      const deltaUnit: McpRow["deltaUnit"] = hasNonZeroRegistryDelta
        ? "installs"
        : linkedRepo
          ? "stars"
          : null;

      return {
        id: item.id,
        title: item.title,
        href: `/mcp/${slugForMcp(item)}`,
        logo: resolveMcpLogo(item),
        author: item.vendor ?? item.author ?? null,
        sourceLabel:
          item.popularityLabel && item.popularity != null
            ? item.popularityLabel.toLowerCase()
            : (sources[0] ?? "mcp"),
        use: item.popularity ?? 0,
        releasedAt: item.mcp?.lastReleaseAt ?? null,
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
        sparklineData: linkedRepo?.sparklineData ?? [],
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

      <p className="text-[11px] text-text-tertiary mt-4">
        Want the full table?{" "}
        <Link href="/api/mcp/trending">api/mcp/trending</Link> ships the raw
        payload.
      </p>
    </main>
  );
}
