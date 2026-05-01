// TrendingRepo — /top10 (V4)
//
// Today's leaderboard. Composes V4 primitives directly: PageHead +
// VerdictRibbon + KpiBand + two SectionHead bands. The first lists the
// canonical top-10 repos via <RankRow>, the second points operators
// at the per-category surfaces under /categories.
//
// All readers are wired to the data-store. The repo set comes from
// getDerivedRepos(), which is hydrated by the ambient refresh hooks of
// the surfaces that share its caches (homepage, /repos, the /top10
// per-category sub-routes). On a cold Lambda the bundled JSON snapshot
// seeds the cache, so the page never blanks out.

import Link from "next/link";
import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";

import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import {
  buildRepoTop10,
  emptyBundle,
} from "@/lib/top10/builders";
import { CATEGORIES } from "@/lib/constants";
import { formatNumber, getRelativeTime } from "@/lib/utils";

// V4 primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RankRow } from "@/components/ui/RankRow";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

// ISR — 10-minute cadence matches the V4 leaderboard surfaces. Underlying
// readers refresh every 6 hours via cron; tighter cache wastes work
// without buying freshness, looser one drifts from the consensus board
// users land on next.
export const revalidate = 600;

const TITLE = `Top 10 — ${SITE_NAME}`;
const DESCRIPTION =
  "Top 10 repos by cross-signal score — GitHub stars, Reddit, Hacker News, ProductHunt, Bluesky, dev.to, Lobsters. Updated every 6 hours.";
const OG_IMAGE = absoluteUrl("/api/og/top10?cat=repos&window=7d&aspect=h");

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/top10") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/top10"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: "TrendingRepo — Top 10 across eight surfaces",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

// V4 inline panel chrome — line-200 border, bg-050 fill, no rounded
// corners (V4 cards use radius 2). Inline rather than via a class so the
// migration is grep-clean of v2-* / v3-* shells.
const PANEL_STYLE = {
  border: "1px solid var(--v4-line-200)",
  background: "var(--v4-bg-050)",
  borderRadius: 2,
};

// V4 mono header strip — sits above each panel body. Caps mono key in
// --v4-acc + ink-400 trailing detail. Mirrors the .panel-head pattern
// the consensus + funding pages use, minus the v3 vars.
const PANEL_HEAD_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderBottom: "1px solid var(--v4-line-200)",
  fontFamily: "var(--v4-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "var(--v4-ink-400)",
};

export default async function Top10RootPage() {
  // Repo set is the only signal this page renders. getDerivedRepos pulls
  // from the same in-memory cache the homepage primes; the bundled JSON
  // seed handles cold-start. No per-render refresh hook needed —
  // cross-signal score on a 7d window is steady across 10-minute ticks.
  const repos = getDerivedRepos();

  // Reuse the canonical top-10 repo bundle so /top10 and the per-category
  // sub-routes stay in lock-step. emptyBundle handles the cold-start case.
  const bundle =
    repos.length > 0
      ? buildRepoTop10(repos, "7d", "cross-signal")
      : emptyBundle("7d");
  const topItems = bundle.items;
  const topRepo = topItems[0];

  // repoToItem encodes slug = repo.fullName, so the slug round-trips back
  // into the underlying derived row for the language / topics / delta lookups
  // the KPI band needs.
  const repoByFullName = new Map(repos.map((r) => [r.fullName, r]));
  const totalStars24h = topItems.reduce((sum, item) => {
    const row = repoByFullName.get(item.slug);
    return sum + (row?.starsDelta24h ?? 0);
  }, 0);

  // Top language across the top 10 — most frequent non-empty language.
  const langCounts = new Map<string, number>();
  for (const item of topItems) {
    const lang = repoByFullName.get(item.slug)?.language;
    if (lang) langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
  }
  const topLanguage =
    [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Hottest tag — most frequent topic across the top-10's underlying repos.
  const tagCounts = new Map<string, number>();
  for (const item of topItems) {
    const topics = repoByFullName.get(item.slug)?.topics ?? [];
    for (const t of topics) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const hottestTag =
    [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Computed-ago label for the verdict ribbon.
  const computedAt = new Date().toISOString();
  const computedAgo = getRelativeTime(computedAt);
  const computedClock = computedAt.slice(11, 19);

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>TOP 10</b> · TERMINAL · /TOP10
          </>
        }
        h1="Today's leaders — the cross-signal top 10."
        lede="The ten repos with the strongest 7-day cross-signal score across GitHub, Reddit, Hacker News, ProductHunt, Bluesky, dev.to, Lobsters, and our own ranker."
        clock={
          <>
            <span className="big">{computedClock}</span>
            <span className="muted">UTC · COMPUTED</span>
            <FreshnessBadge source="mcp" lastUpdatedAt={lastFetchedAt} />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// TODAY'S LEADERS",
          headline: computedAt.replace("T", " · ").slice(0, 16) + " UTC",
          sub: `computed ${computedAgo} · ${topItems.length} ranked`,
        }}
        text={
          topRepo ? (
            <>
              led by <b>{topRepo.slug}</b> with a cross-signal score of{" "}
              <b>{topRepo.score.toFixed(2)}</b> / 5.0.
            </>
          ) : (
            <>Top-10 pool is warming. Awaiting first ranker pass.</>
          )
        }
        actionHref="#top10-leaderboard"
        actionLabel="JUMP TO BOARD →"
      />

      <KpiBand
        cells={[
          {
            label: "TOP REPO",
            value: topRepo ? topRepo.slug : "—",
            sub: topRepo ? `score ${topRepo.score.toFixed(2)} / 5.0` : "warming",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "TOTAL STARS · 24H",
            value: `+${formatNumber(totalStars24h)}`,
            sub: "across top 10",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "TOP LANGUAGE",
            value: topLanguage,
            sub: "most-represented",
          },
          {
            label: "HOTTEST TAG",
            value: hottestTag,
            sub: "most-shared topic",
            tone: "amber",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Today's top 10"
        meta={
          <>
            <b>{topItems.length}</b> ranked · 7-day window
          </>
        }
      />

      <section id="top10-leaderboard" style={PANEL_STYLE}>
        <div style={PANEL_HEAD_STYLE}>
          <span style={{ color: "var(--v4-acc)" }}>{"// LEADERBOARD"}</span>
          <span>· CROSS-SIGNAL · 7D</span>
        </div>
        {topItems.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: "var(--v4-ink-300)",
              fontSize: 13,
            }}
          >
            Top-10 pool is warming. The ranker publishes after the cross-signal
            fetchers refresh.
          </div>
        ) : (
          topItems.map((item, i) => (
            <RankRow
              key={item.slug}
              rank={item.rank}
              title={
                item.owner ? (
                  <>
                    {item.owner}{" "}
                    <span style={{ color: "var(--v4-ink-400)" }}>/</span>{" "}
                    {item.title}
                  </>
                ) : (
                  item.title
                )
              }
              desc={item.description}
              metric={{ value: item.score.toFixed(2), label: "/ 5.0" }}
              delta={
                item.deltaPct !== undefined
                  ? {
                      value: `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`,
                      direction:
                        item.deltaPct > 0
                          ? "up"
                          : item.deltaPct < 0
                            ? "down"
                            : "flat",
                    }
                  : undefined
              }
              href={item.href}
              first={i === 0}
            />
          ))
        )}
      </section>

      <SectionHead
        num="// 02"
        title="Categories"
        meta={
          <>
            <b>{CATEGORIES.length}</b> sectors · drill in
          </>
        }
      />

      <section style={PANEL_STYLE}>
        <div style={PANEL_HEAD_STYLE}>
          <span style={{ color: "var(--v4-acc)" }}>{"// CATEGORIES"}</span>
          <span>· OPEN ANY SECTOR FOR ITS OWN MOMENTUM BOARD</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 1,
            background: "var(--v4-line-200)",
          }}
        >
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: "var(--v4-bg-050)",
                color: "var(--v4-ink-100)",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: cat.color,
                  flex: "none",
                }}
              />
              <span style={{ fontWeight: 500 }}>{cat.shortName}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--v4-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--v4-ink-400)",
                }}
              >
                /{cat.id} →
              </span>
            </Link>
          ))}
        </div>
        <div
          style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--v4-line-200)",
            fontFamily: "var(--v4-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--v4-ink-400)",
          }}
        >
          <Link
            href="/categories"
            style={{ color: "var(--v4-acc)", textDecoration: "none" }}
          >
            VIEW ALL CATEGORIES →
          </Link>
        </div>
      </section>
    </main>
  );
}
