// /githubrepo — isolated trending-repos surface.
//
// Strips the home page down to its three load-bearing pieces: the page-head
// (title + refreshed clock), the 6-up MetricGrid stats, and the LiveTopTable
// with category tabs. No consensus / breakout / featured / bubble map / FAQ /
// JSON-LD — just the list. Same data wiring as `/` so cards stay consistent.

import type { Metadata } from "next";
import Link from "next/link";

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { Card } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { LiveTopTable } from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";

export const revalidate = 60;

const PAGE_SIZE = 50;

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "GitHub Trending Repos",
  description:
    "Stripped-down trending GitHub repo feed. The same data as the homepage, without the bubble map, breakouts, or FAQ — just the live ranked list.",
  alternates: { canonical: "/githubrepo" },
  openGraph: {
    title: "GitHub Trending Repos — TrendingRepo",
    description:
      "Live ranked list of trending GitHub repos with category tabs. The terminal feed without the homepage chrome.",
    url: "/githubrepo",
    type: "website",
  },
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

export default async function GithubRepoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const repos = getDerivedRepos();

  // Cross-signal-first ranking: rank A by channelsFiring × crossSignalScore
  // (the actual "trending across multiple platforms" signal), tiebreak with
  // momentumScore. Pure-stars-only repos drop below multi-channel breakouts.
  // User feedback: "we have a fucking trending engine — not the score".
  const sorted = [...repos].sort((a, b) => {
    const aChannels = a.channelsFiring ?? 0;
    const bChannels = b.channelsFiring ?? 0;
    const aCross = a.crossSignalScore ?? 0;
    const bCross = b.crossSignalScore ?? 0;
    const aBlend = aChannels * 2 + aCross + (a.momentumScore ?? 0) / 50;
    const bBlend = bChannels * 2 + bCross + (b.momentumScore ?? 0) / 50;
    if (bBlend !== aBlend) return bBlend - aBlend;
    return (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
  });
  const params = await searchParams;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, totalPages)
      : 1;
  const startIdx = (page - 1) * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const liveRows = sorted.slice(startIdx, endIdx);

  const refreshed = new Date(lastFetchedAt);
  const refreshedTime = refreshed.toISOString().slice(11, 19);
  const total24h = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta24h),
    0,
  );
  const total7d = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta7d),
    0,
  );
  const breakoutCount = repos.filter(
    (r) => r.movementStatus === "rising" || r.movementStatus === "hot",
  ).length;
  const consensusCount = repos.filter(
    (r) => (r.crossSignalScore ?? 0) >= 2,
  ).length;
  const topCategory = CATEGORIES.map((category) => ({
    label: category.shortName,
    delta: repos
      .filter((repo) => repo.categoryId === category.id)
      .reduce((sum, repo) => sum + Math.max(0, repo.starsDelta24h), 0),
  })).sort((a, b) => b.delta - a.delta)[0];

  return (
    <>
      <div className="home-surface">
        <section className="page-head">
          <div>
            <div className="crumb">
              <b>TREND</b> / TERMINAL / GITHUB REPOS
            </div>
            <h1>All trending GitHub repos — right now.</h1>
            <p className="lede">
              Page {page} of {totalPages} · {repos.length.toLocaleString()}{" "}
              tracked repos total · {PAGE_SIZE} per page. Full momentum-
              ranked feed. Same data as the front page, isolated with stats
              and category tabs.
            </p>
          </div>
          <div
            className="clock"
            aria-label={`Data refreshed at ${refreshedTime} UTC`}
          >
            <span className="big">{refreshedTime} UTC</span>
          </div>
        </section>

        <MetricGrid columns={6}>
          <Metric
            label="tracked repos"
            value={formatCompact(repos.length)}
            sub="derived feed"
          />
          <Metric
            label="24h stars"
            value={formatCompact(total24h)}
            delta="+ live"
            tone="positive"
          />
          <Metric
            label="7d stars"
            value={formatCompact(total7d)}
            sub="rolling window"
          />
          <Metric
            label="consensus"
            value={consensusCount}
            sub="multi-source"
            tone="consensus"
          />
          <Metric
            label="breakouts"
            value={breakoutCount}
            sub="velocity spike"
            tone="accent"
          />
          <Metric
            label="top category"
            value={topCategory?.label ?? "n/a"}
            sub="momentum leader"
          />
        </MetricGrid>

        <SectionHead
          num="// 01"
          title={`Live / page ${page} of ${totalPages}`}
          meta={
            <>
              <b>
                {(startIdx + 1).toLocaleString()}–
                {Math.min(endIdx, sorted.length).toLocaleString()}
              </b>{" "}
              / {sorted.length.toLocaleString()} · refreshed{" "}
              <b>{refreshedTime}</b>
            </>
          }
        />
        <Card>
          <LiveTopTable
            repos={liveRows}
            skills={[]}
            mcps={[]}
            limit={liveRows.length}
          />
        </Card>

        {/* Pagination — server-rendered <a> links so Googlebot crawls
            every page (page 2..N URLs feed the long-tail of repos into
            the crawler's frontier). */}
        <nav
          aria-label="Pagination"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "center",
            margin: "24px 0",
            flexWrap: "wrap",
            fontFamily: "var(--v4-mono)",
            fontSize: 12,
          }}
        >
          {page > 1 ? (
            <Link
              href={page === 2 ? "/githubrepo" : `/githubrepo?page=${page - 1}`}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--v4-line-200)",
                background: "var(--v4-bg-100)",
                color: "var(--v4-ink-100)",
                textDecoration: "none",
              }}
            >
              ← Prev
            </Link>
          ) : (
            <span
              style={{
                padding: "6px 12px",
                border: "1px solid var(--v4-line-200)",
                color: "var(--v4-ink-400)",
                opacity: 0.5,
              }}
            >
              ← Prev
            </span>
          )}

          {/* Page-number list. Compact: first, current ± 2, last. */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (n) =>
                n === 1 ||
                n === totalPages ||
                (n >= page - 2 && n <= page + 2),
            )
            .map((n, i, arr) => {
              const prev = arr[i - 1];
              const showGap = prev !== undefined && n - prev > 1;
              return (
                <span key={n} style={{ display: "inline-flex", gap: 8 }}>
                  {showGap && (
                    <span style={{ color: "var(--v4-ink-400)" }}>…</span>
                  )}
                  {n === page ? (
                    <span
                      aria-current="page"
                      style={{
                        padding: "6px 12px",
                        background: "var(--v4-acc)",
                        color: "var(--v4-bg-000)",
                        fontWeight: 700,
                      }}
                    >
                      {n}
                    </span>
                  ) : (
                    <Link
                      href={n === 1 ? "/githubrepo" : `/githubrepo?page=${n}`}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid var(--v4-line-200)",
                        background: "var(--v4-bg-100)",
                        color: "var(--v4-ink-100)",
                        textDecoration: "none",
                      }}
                    >
                      {n}
                    </Link>
                  )}
                </span>
              );
            })}

          {page < totalPages ? (
            <Link
              href={`/githubrepo?page=${page + 1}`}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--v4-line-200)",
                background: "var(--v4-bg-100)",
                color: "var(--v4-ink-100)",
                textDecoration: "none",
              }}
            >
              Next →
            </Link>
          ) : (
            <span
              style={{
                padding: "6px 12px",
                border: "1px solid var(--v4-line-200)",
                color: "var(--v4-ink-400)",
                opacity: 0.5,
              }}
            >
              Next →
            </span>
          )}
        </nav>
      </div>

      <FooterBar
        meta={`// TRENDINGREPO / githubrepo / page ${page}/${totalPages}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
