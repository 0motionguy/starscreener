// /githubrepo — canonical trending-repos surface.
//
// As of commit 05beb1b6 the sidebar's "Trending Repos" link points here, so
// this page is the dashboard a navigation-following user actually lands on.
// It mirrors the home-page rhythm — sequential `// 01 .. // 0n` SectionHeads,
// dense Card grid, mono uppercase voice, Liquid-Lava + Functional palette —
// while staying repo-only (no skills / mcp / featured / bubble map sections
// that would compete with `/skills`, `/mcp`, and the home aggregator).
//
// Section ordering:
//   00  page-head (title + clock + freshness)
//   --  KPI strip (6-up MetricGrid)
//   01  Cross-source agreement (top 3 consensus repos)
//   02  Breaking out (top 5 by 24h vs 7d-baseline velocity)
//   03  Live / top 50 (RankTabs: Trending / OSS / TrendShift / Momentum)
//   04  Categories / 24h share (top-4 ChartStats)
//   --  FooterBar
//
// Inline JSON-LD (CollectionPage + ItemList + BreadcrumbList) anchors this
// surface in structured data so crawlers don't fall back to the parent
// homepage feed, plus an explicit per-page Metadata export with canonical /
// OG / Twitter / robots so rich-result tooling has a complete head block.

import type { Metadata } from "next";
import {
  EChartSparkline,
  type EChartSparklineProps,
} from "@/components/charts/EChartSparkline";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  getTrending,
  lastFetchedAt,
  refreshTrendingFromStore,
} from "@/lib/trending";
import {
  getTrendshiftFetchedAt,
  getTrendshiftItems,
  refreshTrendshiftFromStore,
} from "@/lib/trendshift-trending";
import { refreshRedditMentionsFromStore } from "@/lib/reddit-data";
import { refreshHackernewsMentionsFromStore } from "@/lib/hackernews";
import { refreshBlueskyMentionsFromStore } from "@/lib/bluesky";
import { refreshDevtoMentionsFromStore } from "@/lib/devto";
import { refreshLobstersMentionsFromStore } from "@/lib/lobsters";
import { refreshNpmFromStore } from "@/lib/npm";
import { refreshHfModelsFromStore } from "@/lib/huggingface";
import { refreshArxivFromStore } from "@/lib/arxiv";
import { refreshProducthuntLaunchesFromStore } from "@/lib/producthunt";
import { refreshFundingNewsFromStore } from "@/lib/funding-news";
import { getRepoMetadata } from "@/lib/repo-metadata";
import { slugToId } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { ChartStat, ChartStats } from "@/components/ui/ChartShell";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { repoLogoUrl } from "@/lib/logos";
import { MarkVisited } from "@/components/layout/MarkVisited";
import {
  GithubIcon,
  HackerNewsIcon,
  RedditIcon,
  BlueskyIcon,
  DevtoIcon,
} from "@/components/brand/BrandIcons";
import {
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";
import {
  RankTabs,
  type RankMode,
} from "@/components/githubrepo/RankTabs";
import { CATEGORIES } from "@/lib/constants";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";
import type { Repo } from "@/lib/types";

export const revalidate = 60;

const PAGE_PATH = "/githubrepo";
const PAGE_TITLE = "Top 50 trending GitHub repos — live";
const PAGE_DESCRIPTION =
  "Live momentum-ranked list of the top 50 trending GitHub repositories with cross-source mention chips (Hacker News, Reddit, Bluesky, dev.to, Lobsters, npm, Hugging Face, arXiv, X). Refreshes every minute.";
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

function formatDelta(value: number): string {
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function percentDelta(delta: number, base: number): number | null {
  if (base <= 0 || delta === 0) return null;
  return Math.round((delta / Math.max(1, base - delta)) * 100);
}

const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.id, c.shortName]));

function categoryLabel(repo: Repo): string {
  return CATEGORY_LABELS.get(repo.categoryId) ?? repo.language ?? "Repo";
}

function sourceCount(repo: Repo): number {
  if (typeof repo.channelsFiring === "number") return repo.channelsFiring;
  if (!repo.channelStatus) return repo.mentionCount24h > 0 ? 2 : 1;
  return Object.values(repo.channelStatus).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Sparkline — backed by the shared <EChartSparkline> wrapper. Was a
// duplicate of the inline-SVG sparkline in src/app/page.tsx; both moved
// to ECharts canvas in this PR for a visible visual upgrade (animated
// draw on first paint, hover tooltip, slightly larger 84×28 default).
// Wrapper preserves the old prop defaults so call sites don't shift.
// ---------------------------------------------------------------------------

function Sparkline({
  color = "var(--sig-green)",
  className = "spark",
  ...rest
}: EChartSparklineProps) {
  return <EChartSparkline color={color} className={className} {...rest} />;
}

// ---------------------------------------------------------------------------
// Consensus + breakout row renderers — JSX shape matches the home page so
// the existing global CSS (`cons-row`, `brk-row` in src/app/globals.css)
// styles them without a separate stylesheet here.
// ---------------------------------------------------------------------------

const SOURCE_ICONS: ReadonlyArray<{
  key: string;
  label: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
}> = [
  { key: "gh", label: "GitHub", Icon: GithubIcon },
  { key: "hn", label: "Hacker News", Icon: HackerNewsIcon },
  { key: "r", label: "Reddit", Icon: RedditIcon },
  { key: "b", label: "Bluesky", Icon: BlueskyIcon },
  { key: "d", label: "dev.to", Icon: DevtoIcon },
];

function ConsensusRow({ repo, index }: { repo: Repo; index: number }) {
  const channels = Math.max(1, sourceCount(repo));
  return (
    <a
      className={`cons-row ${index === 0 ? "first" : ""}`}
      href={`/repo/${repo.owner}/${repo.name}`}
    >
      <div className="cons-top">
        <span className="rk">{String(index + 1).padStart(2, "0")}</span>
        <EntityLogo
          src={repoLogoUrl(repo.fullName, 64)}
          name={repo.fullName}
          size={28}
          className="cons-av"
        />
        <span className="nm">
          <span className="h">{repo.fullName}</span>
          <span className="meta">
            <span className="tag">{categoryLabel(repo)}</span>
            {channels} sources
          </span>
        </span>
        <span className="delta">
          {formatDelta(repo.starsDelta24h)}
          <span className="lbl">24h</span>
        </span>
      </div>
      <div className="cons-bot">
        <span className="srcs" aria-label={`${channels} sources firing`}>
          {SOURCE_ICONS.slice(0, channels).map(({ key, label, Icon }) => (
            <span
              key={key}
              className={`sd sd-${key}`}
              title={label}
              aria-label={label}
            >
              <Icon size={16} />
            </span>
          ))}
        </span>
        <Sparkline values={repo.sparklineData} className="spark-mini" />
      </div>
    </a>
  );
}

function BreakoutRow({ repo, index }: { repo: Repo; index: number }) {
  const baseline = Math.max(1, repo.starsDelta7d / 7);
  const velocityRatio = repo.starsDelta24h / baseline;
  const velocity = Math.min(100, Math.round(velocityRatio * 18));
  const pct = percentDelta(repo.starsDelta24h, repo.stars);
  return (
    <a
      className={`brk-row ${index === 0 ? "first" : ""}`}
      href={`/repo/${repo.owner}/${repo.name}`}
    >
      <span className="rk">{String(index + 1).padStart(2, "0")}</span>
      <EntityLogo
        src={repoLogoUrl(repo.fullName, 64)}
        name={repo.fullName}
        size={28}
        className="brk-av"
      />
      <span className="nm">
        <span className="h">{repo.fullName}</span>
        <span className="meta">
          {categoryLabel(repo)} / {repo.movementStatus.replace("_", " ")}
        </span>
      </span>
      <span className="vel">
        <span className="bar">
          <i style={{ width: `${velocity}%` }} />
        </span>
        <span className="lbl">{velocityRatio.toFixed(1)}x 7d avg</span>
      </span>
      <span className="delta">
        {formatDelta(repo.starsDelta24h)}
        {pct !== null ? <span className="pct">+{pct}%</span> : null}
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Ranking helpers — four orderings rendered into one set of LiveRow[] each.
// ---------------------------------------------------------------------------

const TOP_N = 50;
const RRF_K = 60; // Standard Reciprocal Rank Fusion constant.

function toLiveRow(repo: Repo, rankScore: number): LiveRow {
  const ps = repo.mentions?.perSource;
  return {
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    href: `/repo/${repo.owner}/${repo.name}`,
    categoryId: repo.categoryId,
    categoryLabel: categoryLabel(repo),
    language: repo.language ?? null,
    stars: repo.stars,
    starsDelta24h: repo.starsDelta24h,
    starsDelta7d: repo.starsDelta7d,
    starsDelta30d: repo.starsDelta30d,
    forks: repo.forks,
    // Default to [] when the repo's sparkline collector hasn't run yet.
    // LiveTopTable's inline Sparkline derefs `values.length` and `values.map`,
    // both of which throw on undefined and bubble up as a route 500 during
    // hydration. The cold-start path (which can hit on a fresh dev server
    // before any collectors have populated trending.json) was the most
    // likely culprit for the transient 500 we saw on /repo/* and /githubrepo.
    sparklineData: repo.sparklineData ?? [],
    // The "Rank" column in LiveTopTable sorts by this field desc — overload
    // it per active mode so the table's own rank-sort matches the ordering
    // the parent passed in.
    momentumScore: rankScore,
    mentionCount24h: repo.mentionCount24h ?? 0,
    // Chip on/off uses the wider 7d window so slow-cadence sources
    // (lobsters / npm / hf / arxiv / devto) actually fire on the row.
    sources: {
      gh: 1,
      hn: ps?.hackernews.count7d ?? ps?.hackernews.count24h ?? 0,
      r: ps?.reddit.count7d ?? ps?.reddit.count24h ?? 0,
      b: ps?.bluesky.count7d ?? ps?.bluesky.count24h ?? 0,
      d: ps?.devto.count7d ?? ps?.devto.count24h ?? 0,
      lobsters: ps?.lobsters.count7d ?? ps?.lobsters.count24h ?? 0,
      x: ps?.twitter.count7d ?? ps?.twitter.count24h ?? 0,
      npm: ps?.npm.count7d ?? ps?.npm.count24h ?? 0,
      hf: ps?.huggingface.count7d ?? ps?.huggingface.count24h ?? 0,
      arxiv: ps?.arxiv.count7d ?? ps?.arxiv.count24h ?? 0,
    },
  };
}

// For repos that show up in TrendShift / OSS Insight but haven't been
// ingested into our derived feed yet. We still want them visible — render a
// minimal row with whatever metadata cache holds.
function toStubLiveRow(fullName: string, rankScore: number): LiveRow {
  const [owner = fullName, name = ""] = fullName.split("/");
  const meta = getRepoMetadata(fullName);
  return {
    id: slugToId(fullName),
    fullName,
    owner,
    name,
    // Send unknown-to-us repos to GitHub directly; our /repo route 404s.
    href: name ? `https://github.com/${fullName}` : `https://github.com/${owner}`,
    categoryId: "other",
    categoryLabel: meta?.language ?? "—",
    language: meta?.language ?? null,
    stars: meta?.stars ?? 0,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forks: meta?.forks ?? 0,
    sparklineData: [],
    momentumScore: rankScore,
    mentionCount24h: 0,
    sources: { gh: 1 },
  };
}

function buildCategories(rows: LiveRow[]): CategoryFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return CATEGORIES.map((category) => ({
    id: category.id,
    label: category.shortName,
    count: counts.get(category.id) ?? 0,
  }))
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

interface RankedSource {
  /** fullName (case-preserved) -> rank position (1-based). */
  rankByFullName: Map<string, number>;
  /** fullName (case-preserved) -> raw upstream score, when available. */
  scoreByFullName: Map<string, number>;
  /** Ordered list of canonical fullNames (lowercased). */
  ordered: string[];
}

// OSS Insight: pull past_24_hours/All. Rows arrive sorted by total_score desc
// already; we honor that order.
function buildOssSource(): RankedSource {
  const rows = getTrending("past_24_hours", "All");
  const rankByFullName = new Map<string, number>();
  const scoreByFullName = new Map<string, number>();
  const ordered: string[] = [];
  let pos = 0;
  for (const row of rows) {
    if (!row.repo_name || !row.repo_name.includes("/")) continue;
    const lower = row.repo_name.toLowerCase();
    if (rankByFullName.has(lower)) continue;
    pos += 1;
    rankByFullName.set(lower, pos);
    const score = Number.parseFloat(row.total_score ?? "0");
    if (Number.isFinite(score)) scoreByFullName.set(lower, score);
    ordered.push(lower);
  }
  return { rankByFullName, scoreByFullName, ordered };
}

function buildTrendshiftSource(): RankedSource {
  const items = getTrendshiftItems();
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const rankByFullName = new Map<string, number>();
  const scoreByFullName = new Map<string, number>();
  const ordered: string[] = [];
  for (const item of sorted) {
    const lower = item.fullName.toLowerCase();
    if (rankByFullName.has(lower)) continue;
    rankByFullName.set(lower, item.rank);
    // No raw score in the TrendShift scrape — invert rank so lower=better.
    scoreByFullName.set(lower, 1 / item.rank);
    ordered.push(lower);
  }
  return { rankByFullName, scoreByFullName, ordered };
}

// Reciprocal Rank Fusion. Combines the two rankings by summing 1/(k+rank)
// across sources. Robust to missing entries — a repo that shows up in only
// one source still gets a real score.
function fuseRRF(
  oss: RankedSource,
  ts: RankedSource,
  k: number,
): { ordered: string[]; rrfByFullName: Map<string, number> } {
  const all = new Set<string>([
    ...oss.rankByFullName.keys(),
    ...ts.rankByFullName.keys(),
  ]);
  const rrfByFullName = new Map<string, number>();
  for (const name of all) {
    let s = 0;
    const ro = oss.rankByFullName.get(name);
    const rt = ts.rankByFullName.get(name);
    if (typeof ro === "number") s += 1 / (k + ro);
    if (typeof rt === "number") s += 1 / (k + rt);
    rrfByFullName.set(name, s);
  }
  const ordered = [...all].sort((a, b) => {
    const sa = rrfByFullName.get(a) ?? 0;
    const sb = rrfByFullName.get(b) ?? 0;
    if (sb !== sa) return sb - sa;
    return a.localeCompare(b);
  });
  return { ordered, rrfByFullName };
}

interface OrderingArgs {
  orderedLowercaseFullNames: string[];
  reposByLowercaseFullName: Map<string, Repo>;
  /** Compute the rank-score (higher = top) for the row at upstream position. */
  rankScoreFor: (lower: string, position: number) => number;
  /** When the lookup misses, pull the casing-preserved fullName. */
  displayNameFor: (lower: string) => string;
}

function buildOrderedRows({
  orderedLowercaseFullNames,
  reposByLowercaseFullName,
  rankScoreFor,
  displayNameFor,
}: OrderingArgs): LiveRow[] {
  const rows: LiveRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < orderedLowercaseFullNames.length; i++) {
    const lower = orderedLowercaseFullNames[i];
    if (seen.has(lower)) continue;
    seen.add(lower);
    const repo = reposByLowercaseFullName.get(lower);
    const rankScore = rankScoreFor(lower, i + 1);
    rows.push(
      repo
        ? toLiveRow(repo, rankScore)
        : toStubLiveRow(displayNameFor(lower), rankScore),
    );
    if (rows.length >= TOP_N) break;
  }
  return rows;
}

function ageLabel(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return fallback;
  const ageMin = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (ageMin < 60) return `${ageMin}m ago`;
  const h = Math.floor(ageMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function GithubRepoPage() {
  // Keep the LiveTopTable mention badges + TrendShift rank tied to the
  // latest data-store payloads instead of stale bundled snapshots.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshTrendshiftFromStore(),
    refreshRedditMentionsFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshNpmFromStore(),
    refreshHfModelsFromStore(),
    refreshArxivFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  const repos = getDerivedRepos();
  const reposByLowercaseFullName = new Map<string, Repo>();
  for (const r of repos) {
    reposByLowercaseFullName.set(r.fullName.toLowerCase(), r);
  }

  // Casing-preserved lookup so stub rows can render the upstream-supplied
  // fullName when our derived feed doesn't carry the repo yet.
  const displayCasing = new Map<string, string>();
  for (const row of getTrending("past_24_hours", "All")) {
    if (row.repo_name && !displayCasing.has(row.repo_name.toLowerCase())) {
      displayCasing.set(row.repo_name.toLowerCase(), row.repo_name);
    }
  }
  for (const item of getTrendshiftItems()) {
    if (item.fullName && !displayCasing.has(item.fullName.toLowerCase())) {
      displayCasing.set(item.fullName.toLowerCase(), item.fullName);
    }
  }
  const displayNameFor = (lower: string): string =>
    displayCasing.get(lower) ?? lower;

  const oss = buildOssSource();
  const ts = buildTrendshiftSource();
  const fused = fuseRRF(oss, ts, RRF_K);

  // ----- Trending (default): RRF of OSS Insight + TrendShift.
  const trendingRows = buildOrderedRows({
    orderedLowercaseFullNames: fused.ordered,
    reposByLowercaseFullName,
    // Scale RRF score to a wider range so the table's rank-sort displays
    // them in the same order we passed.
    rankScoreFor: (lower) => (fused.rrfByFullName.get(lower) ?? 0) * 1_000_000,
    displayNameFor,
  });

  // ----- Pure OSS Insight.
  const ossRows = buildOrderedRows({
    orderedLowercaseFullNames: oss.ordered,
    reposByLowercaseFullName,
    rankScoreFor: (lower) => oss.scoreByFullName.get(lower) ?? 0,
    displayNameFor,
  });

  // ----- Pure TrendShift (rank 1 -> top). Convert rank to a high-is-top
  // score so LiveTopTable's own rank-sort matches.
  const trendshiftRows = buildOrderedRows({
    orderedLowercaseFullNames: ts.ordered,
    reposByLowercaseFullName,
    rankScoreFor: (_lower, pos) => 1000 - pos,
    displayNameFor,
  });

  // ----- Momentum (legacy default — kept as a tab).
  const momentumOrdered = [...repos]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .map((r) => r.fullName.toLowerCase());
  const momentumRows = buildOrderedRows({
    orderedLowercaseFullNames: momentumOrdered,
    reposByLowercaseFullName,
    rankScoreFor: (lower) =>
      reposByLowercaseFullName.get(lower)?.momentumScore ?? 0,
    displayNameFor,
  });

  const rowsByMode: Record<RankMode, LiveRow[]> = {
    trending: trendingRows,
    oss: ossRows,
    trendshift: trendshiftRows,
    momentum: momentumRows,
  };
  const categoriesByMode: Record<RankMode, CategoryFacet[]> = {
    trending: buildCategories(trendingRows),
    oss: buildCategories(ossRows),
    trendshift: buildCategories(trendshiftRows),
    momentum: buildCategories(momentumRows),
  };
  const trendshiftFetchedAt = getTrendshiftFetchedAt();
  const sourceMetaByMode: Record<RankMode, string> = {
    trending: `OSS Insight + TrendShift / fused`,
    oss: `OSS Insight / ${ageLabel(lastFetchedAt, "live")}`,
    trendshift: `TrendShift / ${ageLabel(trendshiftFetchedAt, trendshiftFetchedAt ? "live" : "no data yet")}`,
    momentum: `our composite / ${ageLabel(lastFetchedAt, "live")}`,
  };

  // The visible top 50 of the active default tab (trending) feeds the
  // ItemList JSON-LD below + downstream stats.
  const liveRows = trendingRows;

  const refreshed = new Date(lastFetchedAt);
  const refreshedTime = refreshed.toISOString().slice(11, 19);

  // --- KPI strip aggregates (same shape as home, repo-only universe).
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
  const categoryDeltaTable = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.shortName,
    delta: repos
      .filter((repo) => repo.categoryId === category.id)
      .reduce((sum, repo) => sum + Math.max(0, repo.starsDelta24h), 0),
    count: repos.filter((repo) => repo.categoryId === category.id).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.delta - a.delta);
  const topCategory = categoryDeltaTable[0];

  // --- Section 01 input: top 3 by cross-source signal score.
  const consensusRepos = [...repos]
    .sort(
      (a, b) =>
        (b.crossSignalScore ?? sourceCount(b)) -
        (a.crossSignalScore ?? sourceCount(a)),
    )
    .slice(0, 3);

  // --- Section 02 input: top 5 by 24h velocity vs 7d-baseline ratio.
  const breakoutRepos = [...repos]
    .sort((a, b) => {
      const aBase = Math.max(1, a.starsDelta7d / 7);
      const bBase = Math.max(1, b.starsDelta7d / 7);
      return b.starsDelta24h / bBase - a.starsDelta24h / aBase;
    })
    .slice(0, 5);

  // Top 20 of the visible 50 — keeps the structured-data payload bounded
  // while still giving crawlers a meaningful ItemList to anchor against.
  // Only repos in our derived feed have a working /repo/owner/name route;
  // stub rows (TrendShift entries we haven't ingested yet) point off-site,
  // so they'd emit 404'd canonical URLs in the JSON-LD ItemList.
  const itemListTop = liveRows
    .filter((r) => r.href.startsWith("/repo/"))
    .slice(0, 20);
  const pageUrl = absoluteUrl(PAGE_PATH);

  return (
    <>
      <MarkVisited routeKey="trendingRepos" count={repos.length} />
      {/* CollectionPage + ItemList JSON-LD — declares this page is a
          curated list of trending GitHub repos and enumerates the top 20
          so structured-data rich results can pick them up. */}
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
            dateModified: new Date(lastFetchedAt).toISOString(),
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: itemListTop.map((repo, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${repo.owner}/${repo.name}`),
                name: repo.fullName,
              })),
            },
          }),
        }}
      />
      {/* BreadcrumbList JSON-LD — Home -> GitHub repos so crawlers can
          attach this surface to the canonical home anchor. */}
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
            <h1>Top 50 trending GitHub repos — right now.</h1>
            <p className="lede">
              Default ranking is <b>OSS Insight + TrendShift</b> fused via
              Reciprocal Rank Fusion. Switch tabs for either source raw, or
              our composite Momentum score.
            </p>
          </div>
          <div
            className="clock"
            aria-label={`Data refreshed at ${refreshedTime} UTC`}
          >
            <span className="big">{refreshedTime} UTC</span>
            <FreshnessBadge
              lastUpdatedAt={lastFetchedAt}
              source="hackernews"
            />
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
          title="Cross-source agreement / top 3"
          meta={
            <>
              <b>{consensusCount}</b> / multi-source repos
            </>
          }
        />
        <Card>
          <CardHeader
            right={<span className="live">LIVE</span>}
            showCorner
          >
            {"// Consensus / 24h"}
          </CardHeader>
          <div className="panel-body">
            {consensusRepos.length > 0 ? (
              consensusRepos.map((repo, index) => (
                <ConsensusRow key={repo.id} repo={repo} index={index} />
              ))
            ) : (
              <div className="hero-panel-empty">waiting for live rows</div>
            )}
          </div>
        </Card>

        <SectionHead
          num="// 02"
          title="Breaking out / 24h vs 7d baseline"
          meta={
            <>
              <b>{breakoutCount}</b> / above baseline
            </>
          }
        />
        <Card>
          <CardHeader
            right={<span className="positive">accelerating</span>}
            showCorner
          >
            {"// Breakout / velocity rank"}
          </CardHeader>
          <div className="panel-body">
            {breakoutRepos.length > 0 ? (
              breakoutRepos.map((repo, index) => (
                <BreakoutRow key={repo.id} repo={repo} index={index} />
              ))
            ) : (
              <div className="hero-panel-empty">waiting for live rows</div>
            )}
          </div>
        </Card>

        <SectionHead
          num="// 03"
          title="Live / top 50"
          meta={
            <>
              <b>{refreshedTime}</b> / refreshed
            </>
          }
        />
        <Card>
          <RankTabs
            rowsByMode={rowsByMode}
            categoriesByMode={categoriesByMode}
            sourceMetaByMode={sourceMetaByMode}
          />
        </Card>

        <SectionHead
          num="// 04"
          title="Categories / 24h share"
          meta={
            <>
              <b>{categoryDeltaTable.length}</b> / categories live
            </>
          }
        />
        <Card>
          <CardHeader
            right={
              <span>
                + {formatCompact(total24h)} stars / 24h
              </span>
            }
            showCorner
          >
            {"// Category breakdown"}
          </CardHeader>
          <ChartStats columns={4}>
            {categoryDeltaTable.slice(0, 4).map((row) => {
              const share =
                total24h > 0
                  ? Math.round((row.delta / total24h) * 100)
                  : 0;
              return (
                <ChartStat
                  key={row.id}
                  label={row.label}
                  value={`+${formatCompact(row.delta)}`}
                  sub={`${row.count} repos · ${share}% share`}
                />
              );
            })}
          </ChartStats>
        </Card>
      </div>

      <FooterBar
        meta={`// TRENDINGREPO / githubrepo / serial ${repos.length}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
