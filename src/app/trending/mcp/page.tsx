import Link from "next/link";
import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore, lastFetchedAt } from "@/lib/trending";
import { loadRepoCategoryDetails } from "@/lib/repo-category-details";
import type { Repo } from "@/lib/types";
import { absoluteUrl, safeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { Card } from "@/components/ui/Card";

export const revalidate = 60;

const PATH = "/trending/mcp";
const DESCRIPTION =
  "Dedicated trending MCP page ranked by the same momentum scoring model as the main trending feed.";

export const metadata: Metadata = {
  title: `Trending MCP Feed - ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl(PATH) },
};

function isMcpRepo(repo: Repo): boolean {
  if (repo.repoCategory === "mcp") return true;
  if (repo.categoryId === "mcp") return true;
  return (repo.topics ?? []).some((t) => t.toLowerCase() === "mcp");
}

function excerpt(details: Awaited<ReturnType<typeof loadRepoCategoryDetails>>): string {
  if (details?.mcp) {
    return `exposes ${details.mcp.tools.length} tools`;
  }
  return "mcp manifest warming";
}

export default async function TrendingMcpPage() {
  await refreshTrendingFromStore();
  const rows = getDerivedRepos()
    .filter(isMcpRepo)
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 50);

  const details = await Promise.all(
    rows.map(async (repo) => {
      try {
        return await loadRepoCategoryDetails(repo);
      } catch {
        return null;
      }
    }),
  );
  const total24h = rows.reduce((sum, repo) => sum + Math.max(0, repo.starsDelta24h), 0);

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>TRENDING</b> · MCP · /TRENDING/MCP
          </>
        }
        h1="Trending MCP"
        lede="MCP-focused breakout board ranked with the same momentum formula as the main trending surface."
        clock={
          <>
            <span className="big">{rows.length}</span>
            <span className="muted">ROWS · LIVE</span>
          </>
        }
      />

      <MetricGrid columns={4}>
        <Metric label="ranked repos" value={rows.length} sub="momentum sorted" />
        <Metric label="24h stars" value={total24h} sub="mcp subset" tone="positive" />
        <Metric label="refreshed" value={new Date(lastFetchedAt).toISOString().slice(11, 19)} sub="utc" />
        <Metric label="scope" value="mcp" sub="sam-01 bucket" />
      </MetricGrid>

      <SectionHead num="// 01" title="Top 50 / mcp scope" meta={<><b>{rows.length}</b> rows</>} />
      <Card>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((repo, idx) => (
            <li key={repo.id} style={{ borderBottom: "1px solid var(--v4-line-100)", padding: "10px 12px" }}>
              <Link href={`/repo/${repo.owner}/${repo.name}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
                    #{idx + 1} {repo.fullName}
                  </span>
                  <span style={{ color: "var(--v4-money)" }}>+{repo.starsDelta24h} 24h</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--v4-ink-300)" }}>
                  {excerpt(details[idx])} · score {repo.momentumScore.toFixed(1)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Trending MCP Feed",
            url: absoluteUrl(PATH),
            description: DESCRIPTION,
            isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
            mainEntity: {
              "@type": "ItemList",
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              numberOfItems: rows.length,
              itemListElement: rows.map((repo, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${repo.owner}/${repo.name}`),
                name: repo.fullName,
              })),
            },
          }),
        }}
      />
    </main>
  );
}
