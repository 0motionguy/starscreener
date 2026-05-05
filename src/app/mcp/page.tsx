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
import { absoluteUrl, safeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";
import { preloadTopLcpImages } from "@/lib/lcp-preload";

export const revalidate = 60;
const PAGE_SIZE = 50;

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
    images: [{ url: absoluteUrl("/og-card.png"), width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending MCP - TrendingRepo",
    description:
      "Top Model Context Protocol servers ranked by stars, downloads, and cross-registry presence.",
    images: [absoluteUrl("/og-card.png")],
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

function hasMcpSignal(item: EcosystemLeaderboardItem): boolean {
  const m = item.mcp;
  if (!m) return false;
  if ((m.installsTotal ?? 0) > 0) return true;
  if ((m.useCount ?? 0) > 0) return true;
  if ((m.installs24h ?? 0) !== 0) return true;
  if ((m.installs7d ?? 0) !== 0) return true;
  if ((m.installs30d ?? 0) !== 0) return true;
  return false;
}

function buildMcpSparkline(
  item: EcosystemLeaderboardItem,
  linkedRepo?: Repo,
): number[] {
  if (linkedRepo?.sparklineData && linkedRepo.sparklineData.length > 1) {
    return linkedRepo.sparklineData;
  }
  const m = item.mcp;
  if (!m) return [];
  const now = m.installsTotal ?? m.useCount ?? item.popularity ?? 0;
  const d1 = m.installs24h ?? 0;
  const d7 = m.installs7d ?? 0;
  const d30 = m.installs30d ?? 0;
  if (now <= 0) return [];
  const p30 = Math.max(0, now - Math.max(0, d30));
  const p7 = Math.max(0, now - Math.max(0, d7));
  const p1 = Math.max(0, now - Math.max(0, d1));
  return [p30, p7, p1, now];
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
    ? `https://avatars.githubusercontent.com/${encodeURIComponent(owner)}?size=80`
    : null;
}

function authorAvatar(author: string | null | undefined): string | null {
  if (!author) return null;
  const trimmed = author.trim();
  if (!trimmed || /[^a-zA-Z0-9-]/.test(trimmed)) return null;
  return `https://avatars.githubusercontent.com/${encodeURIComponent(trimmed)}?size=80`;
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

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function buildMcpHref(page: number): string {
  if (page <= 1) return "/mcp";
  return `/mcp?page=${page}`;
}

interface McpPageProps {
  searchParams?: Promise<{ page?: string | string[] }>;
}

export default async function McpPage({ searchParams }: McpPageProps) {
  const params = (await searchParams) ?? {};
  const requestedPage = parsePage(params.page);

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
      if (hasMcpSignal(item)) return true;
      return false;
    })
    .map((item, idx) => {
      const sources = item.mcp?.sources ?? [];
      const lookup = lookupKeyForMcp(item);
      const linkedRepo = lookup ? repoByFullName.get(lookup) : undefined;

      // Prefer the registry's installs delta when the side-channel snapshot
      // has accrued AND the value is real (non-zero); otherwise fall back to
      // the linked repo's star delta so the column isn't always +0 during MCP
      // cold-start. As of 2026-05-04 the upstream snapshot has installs24h=0
      // on every row (no daily snapshot has accrued yet), so the linked-repo
      // fallback is the path that actually surfaces velocity today.
      const hasRegistryDelta =
        item.mcp?.installs24h !== null ||
        item.mcp?.installs7d !== null ||
        item.mcp?.installs30d !== null;
      const delta24h = hasRegistryDelta
        ? (item.mcp?.installs24h ?? 0)
        : (linkedRepo?.starsDelta24h ?? 0);
      const delta7d = hasRegistryDelta
        ? (item.mcp?.installs7d ?? 0)
        : (linkedRepo?.starsDelta7d ?? 0);
      const delta30d = hasRegistryDelta
        ? (item.mcp?.installs30d ?? 0)
        : (linkedRepo?.starsDelta30d ?? 0);
      const deltaUnit: McpRow["deltaUnit"] = hasRegistryDelta
        ? "installs"
        : linkedRepo
          ? "stars"
          : null;

      return {
        rank: item.rank || idx + 1,
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
        sparklineData: buildMcpSparkline(item, linkedRepo),
      };
    });

  const totalRows = mcpRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedRows = mcpRows.slice(pageStart, pageStart + PAGE_SIZE);
  preloadTopLcpImages(pagedRows.slice(0, 3).map((row) => row.logo));

  // Source-facet category counts for the filter chips. Scoped to the current
  // server-rendered page slice so chip counts match the rendered table.
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
      count: pagedRows.filter((r) => r.sources[c.key]).length,
    }))
    .filter((c) => c.count > 0);

  return (
    <main className="home-surface">
      <MarkVisited routeKey="mcp" count={totalRows} />
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

      <p
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--v4-ink-400)",
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        Page <b style={{ color: "var(--v4-ink-100)" }}>{page}</b> /{" "}
        <b style={{ color: "var(--v4-ink-100)" }}>{totalPages}</b> ·{" "}
        {PAGE_SIZE}/page · showing{" "}
        <b style={{ color: "var(--v4-ink-100)" }}>{pagedRows.length}</b> /{" "}
        <b style={{ color: "var(--v4-ink-100)" }}>{totalRows}</b>
      </p>

      {totalRows > 0 ? (
        <LiveMcpTable rows={pagedRows} categories={categories} />
      ) : (
        <section
          aria-label="MCP empty state"
          style={{
            border: "1px solid var(--v4-line-200)",
            borderRadius: 10,
            padding: "16px 14px",
            background: "var(--v4-bg-100)",
            display: "grid",
            gap: 8,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--v4-ink-400)",
            }}
          >
            // MCP EMPTY
          </p>
          <p style={{ margin: 0, color: "var(--v4-ink-200)" }}>
            No MCP servers are available right now. This usually means the
            upstream MCP feed has not produced rows yet.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--v4-ink-300)" }}>
            Check <Link href="/api/mcp/trending">/api/mcp/trending</Link> for
            the current payload, then retry this page.
          </p>
        </section>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="MCP pagination"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            padding: "12px 0 24px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {page > 1 ? (
            <Link href={buildMcpHref(page - 1)}>← Prev</Link>
          ) : (
            <span style={{ opacity: 0.4 }}>← Prev</span>
          )}
          <span style={{ color: "var(--v4-ink-400)" }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildMcpHref(page + 1)}>Next →</Link>
          ) : (
            <span style={{ opacity: 0.4 }}>Next →</span>
          )}
        </nav>
      ) : null}

      <p className="text-[11px] text-text-tertiary mt-4">
        Want the full table?{" "}
        <Link href="/api/mcp/trending">api/mcp/trending</Link> ships the raw
        payload.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Trending MCP",
            url: absoluteUrl("/mcp"),
            description:
              "Top Model Context Protocol servers ranked by stars, downloads, and cross-registry presence.",
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
          }),
        }}
      />
    </main>
  );
}
