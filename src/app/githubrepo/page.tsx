// /githubrepo — top 50 by Trendshift + OSS Insight consensus.
//
// 2026-05-07: dropped getDerivedRepos / momentumScore / crossSignalScore.
// User constraint: "use either Trendshift or OSS Insight both for ranker".
// We render the UNION of the two upstream lists, deduped by `owner/name`,
// ranked by minimum-position-across-sources (smallest wins). Repos that
// appear in BOTH lists float to the top and get a "consensus" badge.
//
// Inline JSON-LD (CollectionPage + ItemList + BreadcrumbList) anchors this
// surface in structured data so crawlers don't fall back to the parent
// homepage feed, plus an explicit per-page Metadata export with canonical /
// OG / Twitter / robots so rich-result tooling has a complete head block.

import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { MarkVisited } from "@/components/layout/MarkVisited";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";
import {
  getGithubTrendingConsensus,
  type ConsensusRow,
} from "@/lib/github-trending-consensus";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";

export const revalidate = 60;

const PAGE_PATH = "/githubrepo";
const PAGE_TITLE = "Top 50 trending GitHub repos — live";
const PAGE_DESCRIPTION =
  "Top 50 trending GitHub repos ranked by Trendshift + OSS Insight — the two upstreams with the strongest daily signal. Each row shows where it placed on each source. Repos appearing on both float to the top.";
const PAGE_OG_TITLE = `${PAGE_TITLE} — ${SITE_NAME}`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: absoluteUrl(PAGE_PATH) },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    locale: "en_US",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — top 50 trending GitHub repositories, live`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@0motionguy",
    creator: "@0motionguy",
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/og-card.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function attributionLabel(row: ConsensusRow): string {
  const parts: string[] = [];
  if (row.trendshiftRank !== null) parts.push(`Trendshift #${row.trendshiftRank}`);
  if (row.ossRank !== null) parts.push(`OSS Insight #${row.ossRank}`);
  return parts.join(" · ");
}

function refreshedClock(iso: string | null): string {
  if (!iso) return "--:--:--";
  return iso.slice(11, 19);
}

function pickRefreshedAt(
  trendshift: string | null,
  oss: string | null,
): string | null {
  // Most-recent of the two timestamps so the clock reflects whichever
  // upstream landed last.
  if (!trendshift) return oss;
  if (!oss) return trendshift;
  return trendshift > oss ? trendshift : oss;
}

export default async function GithubRepoPage() {
  const consensus = await getGithubTrendingConsensus(50);
  const rows = consensus.rows;
  const refreshedIso = pickRefreshedAt(
    consensus.trendshiftFetchedAt,
    consensus.ossFetchedAt,
  );
  const refreshedTime = refreshedClock(refreshedIso);

  const consensusCount = rows.filter((r) => r.sourceCount === 2).length;
  const trendshiftOnly = rows.filter(
    (r) => r.trendshiftRank !== null && r.ossRank === null,
  ).length;
  const ossOnly = rows.filter(
    (r) => r.ossRank !== null && r.trendshiftRank === null,
  ).length;

  // Top 20 of the visible 50 — keeps the structured-data payload bounded
  // while still giving crawlers a meaningful ItemList to anchor against.
  const itemListTop = rows.slice(0, 20);
  const pageUrl = absoluteUrl(PAGE_PATH);

  // Banner copy adapts when only one upstream has data, so users know why
  // attribution chips are one-sided.
  const onlyTrendshift = consensus.ossCount === 0 && consensus.trendshiftCount > 0;
  const onlyOss = consensus.trendshiftCount === 0 && consensus.ossCount > 0;
  const noData = consensus.trendshiftCount === 0 && consensus.ossCount === 0;

  return (
    <>
      <MarkVisited routeKey="trendingRepos" count={rows.length} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL}${PAGE_PATH}#page`,
            name: PAGE_OG_TITLE,
            description: PAGE_DESCRIPTION,
            url: pageUrl,
            inLanguage: "en-US",
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            dateModified: refreshedIso ?? new Date().toISOString(),
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderAscending",
              itemListElement: itemListTop.map((row, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${row.owner}/${row.name}`),
                name: row.fullName,
              })),
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: absoluteUrl("/"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "GitHub repos",
                item: pageUrl,
              },
            ],
          }),
        }}
      />
      <div className="home-surface">
        <section className="page-head">
          <div>
            <div className="crumb">
              <b>TREND</b> / TERMINAL / GITHUB REPOS
            </div>
            <h1>Top 50 trending GitHub repos — Trendshift + OSS Insight.</h1>
            <p className="lede">
              Two upstreams, one ranked union. Repos on both lists float to the
              top by smallest min-rank; ties break on sum-of-ranks. We do not
              compute our own score on this page — only what Trendshift and OSS
              Insight already published.
            </p>
          </div>
          <div
            className="clock"
            aria-label={`Data refreshed at ${refreshedTime} UTC`}
          >
            <span className="big">{refreshedTime} UTC</span>
          </div>
        </section>

        <MetricGrid columns={4}>
          <Metric
            label="union size"
            value={formatCompact(consensus.unionCount)}
            sub="ranked output"
          />
          <Metric
            label="on both"
            value={consensusCount}
            sub="trendshift + OSS"
            tone="consensus"
          />
          <Metric
            label="trendshift list"
            value={formatCompact(consensus.trendshiftCount)}
            sub="daily top 100"
          />
          <Metric
            label="OSS Insight list"
            value={formatCompact(consensus.ossCount)}
            sub="past 24h / All"
          />
        </MetricGrid>

        {(onlyTrendshift || onlyOss || noData) && (
          <Card className="rank-banner">
            {noData
              ? "Both upstreams returned empty payloads — falling back to the cached snapshot. Check the worker health board."
              : onlyTrendshift
              ? "Showing Trendshift only — OSS Insight payload was empty for this refresh."
              : `Showing OSS Insight only — Trendshift payload was empty for this refresh.`}
          </Card>
        )}

        <SectionHead
          num="// 01"
          title={`Top ${rows.length} / consensus union`}
          meta={
            <>
              <b>{refreshedTime}</b> / refreshed
            </>
          }
        />
        <Card>
          <table className="ds-table consensus-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: "3rem" }}>
                  #
                </th>
                <th scope="col">Repo</th>
                <th scope="col" style={{ width: "12rem" }}>
                  Sources
                </th>
                <th
                  scope="col"
                  style={{ width: "6rem", textAlign: "right" }}
                >
                  Stars
                </th>
                <th scope="col" style={{ width: "8rem" }}>
                  Language
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "1.5rem", textAlign: "center", opacity: 0.7 }}
                  >
                    No upstream data yet. Both Trendshift and OSS Insight are
                    cold — try again in a few minutes.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const consensusRow = row.sourceCount === 2;
                  const logoUrl = repoLogoUrl(row.fullName, 28);
                  return (
                    <tr
                      key={row.fullName}
                      data-consensus={consensusRow ? "true" : "false"}
                    >
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        {i + 1}
                      </td>
                      <td>
                        <a
                          href={`/repo/${row.owner}/${row.name}`}
                          className="repo-link"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.6rem",
                          }}
                        >
                          <EntityLogo
                            src={logoUrl}
                            name={row.fullName}
                            size={28}
                          />
                          <span style={{ display: "inline-flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: 600 }}>{row.fullName}</span>
                            {row.description && (
                              <span
                                style={{
                                  fontSize: "0.78rem",
                                  opacity: 0.7,
                                  maxWidth: "44ch",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {row.description}
                              </span>
                            )}
                          </span>
                        </a>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.4rem",
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {row.trendshiftRank !== null && (
                            <span
                              className="src-chip"
                              title={`Trendshift daily rank #${row.trendshiftRank}`}
                              style={{
                                padding: "0.15rem 0.45rem",
                                borderRadius: "0.3rem",
                                fontSize: "0.72rem",
                                background: "rgba(120, 120, 255, 0.12)",
                                border: "1px solid rgba(120, 120, 255, 0.35)",
                              }}
                            >
                              Trendshift #{row.trendshiftRank}
                            </span>
                          )}
                          {row.ossRank !== null && (
                            <span
                              className="src-chip"
                              title={`OSS Insight past_24_hours rank #${row.ossRank}`}
                              style={{
                                padding: "0.15rem 0.45rem",
                                borderRadius: "0.3rem",
                                fontSize: "0.72rem",
                                background: "rgba(120, 200, 120, 0.12)",
                                border: "1px solid rgba(120, 200, 120, 0.35)",
                              }}
                            >
                              OSS Insight #{row.ossRank}
                            </span>
                          )}
                          {consensusRow && (
                            <span
                              className="src-chip"
                              aria-label="Appears on both Trendshift and OSS Insight"
                              title="Appears on both Trendshift and OSS Insight"
                              style={{
                                padding: "0.15rem 0.45rem",
                                borderRadius: "0.3rem",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                background: "rgba(255, 200, 80, 0.18)",
                                border: "1px solid rgba(255, 200, 80, 0.5)",
                              }}
                            >
                              consensus
                            </span>
                          )}
                          {attributionLabel(row) && (
                            <span className="sr-only">
                              {attributionLabel(row)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.stars !== null ? formatCompact(row.stars) : "--"}
                      </td>
                      <td style={{ opacity: 0.85 }}>{row.language ?? "--"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>

        <p
          className="rank-fineprint"
          style={{
            marginTop: "1rem",
            fontSize: "0.78rem",
            opacity: 0.7,
            maxWidth: "60ch",
          }}
        >
          Trendshift list: {consensus.trendshiftCount} repos. OSS Insight list:{" "}
          {consensus.ossCount} repos. Consensus union after dedupe:{" "}
          {consensus.unionCount}. Showing top {rows.length}. Repos on both
          ({consensusCount}) sort first; trendshift-only ({trendshiftOnly}) and
          OSS-only ({ossOnly}) interleave by their own ranks.
        </p>
      </div>

      <FooterBar
        meta={`// TRENDINGREPO / githubrepo / serial ${rows.length}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
