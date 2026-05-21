// /api/og/tools/[slug] — shared OG card renderer for the 8 /tools sub-routes.
//
// Renders a 1200×630 brand card (Twitter `summary_large_image` size) for each
// tool: tier-list, star-history, top-10, digest, treemap, compare, watchlist,
// revenue-estimate. Composition is uniform — header (brand + route), title +
// tagline, body with 1-3 data points specific to the tool, footer (domain +
// "share card"). Text-first by design: cards are crawl-safe even when a
// tool's live data is mid-backfill.
//
// Runtime: `nodejs` — matches existing `/api/og/tier-list` and `/api/og/top10`
// so they can share the `OG_COLORS` palette and `og-primitives` without
// edge-runtime polyfills.
//
// Note: the legacy `/api/og/tier-list` route is intentionally untouched (it
// has external callers per the 2026-05-08 handover). This route renders a
// thumbnail-grade summary card and is referenced from `metadata.openGraph`
// on each tool page.

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { getDerivedRepos } from "@/lib/derived-repos";
import { listAvailableDigestDates, getDigestForDate } from "@/lib/digest/queries";
import {
  AccentStrip,
  StarMark,
  Wordmark,
  truncate,
} from "@/lib/og-primitives";
import { getLeaderboard, refreshRevenueStartupsFromStore } from "@/lib/revenue-startups";
import { OG_COLORS, SITE_URL } from "@/lib/seo";
import { readTop10Snapshot, todayUtcDate } from "@/lib/top10/snapshots";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARD_W = 1200;
const CARD_H = 630;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=3600";

// ---------------------------------------------------------------------------
// Slug registry — one entry per supported /tools sub-route. Each entry maps
// to a copy block (title + tagline) and a data resolver that returns 1-3
// "bullets" rendered in the card body. Resolvers are async and best-effort;
// they should never throw — fall back to a static teaser when the live data
// is empty.
// ---------------------------------------------------------------------------

type Slug =
  | "tier-list"
  | "star-history"
  | "top-10"
  | "digest"
  | "treemap"
  | "compare"
  | "watchlist"
  | "revenue-estimate";

const SLUGS: readonly Slug[] = [
  "tier-list",
  "star-history",
  "top-10",
  "digest",
  "treemap",
  "compare",
  "watchlist",
  "revenue-estimate",
];

interface Bullet {
  /** Short label printed in mono on the left (e.g. "01", "S-TIER"). */
  label: string;
  /** Main line — repo name, headline, sector, etc. */
  primary: string;
  /** Optional right-side stat (e.g. "+1.2k", "$8.5K MRR"). */
  trailing?: string;
}

interface ToolCard {
  routePath: string; // shown in header chrome, e.g. "/tools/tier-list"
  title: string; // big hero line
  tagline: string; // one-line subtitle below title
  bullets: Bullet[]; // 0-5 body rows; 3 is the visual sweet spot
}

function isSlug(value: string): value is Slug {
  return (SLUGS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function formatSignedDelta(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatCompact(n)}`;
}

function formatUsdCompact(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Per-tool resolvers
// ---------------------------------------------------------------------------

function tierListCard(repos: Repo[]): ToolCard {
  // Score reuses the same weights as /tools/tier-list; we don't need exact
  // tier slicing for a thumbnail — we just want the top 3 S-tier candidates.
  const scored = repos
    .filter((r) => r.fullName.includes("/"))
    .map((r) => {
      const mentions =
        r.mentions?.total7d ?? r.mentions?.total24h ?? r.mentionCount24h ?? 0;
      const score =
        (r.starsDelta7d ?? 0) * 0.6 +
        (r.starsDelta24h ?? 0) * 1.2 +
        mentions * 40;
      return { repo: r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const bullets: Bullet[] = scored.map((s, i) => ({
    label: i === 0 ? "S" : i === 1 ? "S" : "A",
    primary: s.repo.fullName,
    trailing: formatSignedDelta(s.repo.starsDelta7d ?? 0) + " · 7d",
  }));
  return {
    routePath: "/tools/tier-list",
    title: "Tier List",
    tagline: "Top tracked repos graded S / A / B / C / D",
    bullets: bullets.length
      ? bullets
      : [{ label: "—", primary: "Building rankings…" }],
  };
}

function starHistoryCard(repos: Repo[]): ToolCard {
  // Highlight the single biggest 7d mover — that's the default repo the page
  // opens to when `?repo=` is absent.
  const top = [...repos]
    .filter((r) => r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))[0];
  const bullets: Bullet[] = [];
  if (top) {
    bullets.push({
      label: "REPO",
      primary: top.fullName,
      trailing: `${formatCompact(top.stars ?? 0)} ★`,
    });
    bullets.push({
      label: "7D",
      primary: "Weekly star momentum",
      trailing: formatSignedDelta(top.starsDelta7d ?? 0),
    });
    bullets.push({
      label: "24H",
      primary: "Today's velocity",
      trailing: formatSignedDelta(top.starsDelta24h ?? 0),
    });
  }
  return {
    routePath: "/tools/star-history",
    title: "Star History",
    tagline: "30-day cumulative star curves for any tracked repo",
    bullets: bullets.length
      ? bullets
      : [{ label: "—", primary: "History backfilling…" }],
  };
}

async function top10Card(): Promise<ToolCard> {
  const today = todayUtcDate();
  const snap = await readTop10Snapshot(today).catch(() => null);
  const bundle = snap?.repos ?? null;
  const bullets: Bullet[] =
    bundle?.items.slice(0, 3).map((item) => ({
      label: String(item.rank).padStart(2, "0"),
      primary: item.owner ? `${item.owner} / ${item.title}` : item.title,
      trailing:
        item.deltaPct !== undefined
          ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
          : item.score.toFixed(2),
    })) ?? [];
  return {
    routePath: "/tools/top-10",
    title: "Top 10 — Daily",
    tagline: `Frozen snapshot for ${today}`,
    bullets: bullets.length
      ? bullets
      : [{ label: "—", primary: "Snapshot pending…" }],
  };
}

async function digestCard(): Promise<ToolCard> {
  const dates = await listAvailableDigestDates().catch(() => []);
  const date = dates[0] ?? todayUtcDate();
  const digest = await getDigestForDate(date).catch(() => null);
  const bullets: Bullet[] =
    digest?.entries.slice(0, 3).map((e) => ({
      label: String(e.rank).padStart(2, "0"),
      primary: e.fullName,
      trailing: formatSignedDelta(e.starsDelta24h ?? 0),
    })) ?? [];
  return {
    routePath: "/tools/digest",
    title: `Daily Digest · ${date}`,
    tagline: digest
      ? `${digest.totalRepos.toLocaleString()} repos in the trend desk`
      : "Top movers, breakout repos, and the news the desk is reading",
    bullets: bullets.length
      ? bullets
      : [{ label: "—", primary: "Digest building…" }],
  };
}

function treemapCard(repos: Repo[]): ToolCard {
  // Count tracked categories + name the dominant sector (most repos by
  // category). Text-first by design — we don't try to render the actual
  // SVG inside the OG card.
  const tally = new Map<string, number>();
  for (const r of repos) {
    if (!r.categoryId) continue;
    tally.set(r.categoryId, (tally.get(r.categoryId) ?? 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const topSector = sorted[0]?.[0] ?? "—";
  const sectorCount = sorted.length;
  const bullets: Bullet[] = [
    {
      label: "REPOS",
      primary: "Tracked open-source corpus",
      trailing: formatCompact(repos.length),
    },
    {
      label: "SECTORS",
      primary: "Active categories",
      trailing: String(sectorCount),
    },
    {
      label: "TOP",
      primary: humanizeSlug(topSector),
      trailing: `${sorted[0]?.[1] ?? 0} repos`,
    },
  ];
  return {
    routePath: "/tools/treemap",
    title: "Sector Treemap",
    tagline: "Every tracked repo squarified by category and momentum",
    bullets,
  };
}

function compareCard(repos: Repo[]): ToolCard {
  // Default head-to-head is the top 2 movers — same heuristic the page uses
  // when `?repos=` is empty.
  const sorted = [...repos]
    .filter((r) => r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, 2);
  const bullets: Bullet[] = sorted.map((r, i) => ({
    label: i === 0 ? "A" : "B",
    primary: r.fullName,
    trailing: `${formatCompact(r.stars ?? 0)} ★ · ${formatSignedDelta(r.starsDelta7d ?? 0)} 7d`,
  }));
  if (bullets.length === 0) {
    bullets.push({ label: "—", primary: "Pick two repos to compare" });
  }
  return {
    routePath: "/tools/compare",
    title: "Compare",
    tagline: "Side-by-side matrix across 10 metrics for up to 6 repos",
    bullets,
  };
}

function watchlistCard(): ToolCard {
  // Watchlist is browser-local (Zustand + localStorage) — no public state to
  // surface server-side. Generic card by design.
  return {
    routePath: "/tools/watchlist",
    title: "Your Watchlist",
    tagline: "Pin the repos you want to track — live stars, deltas, breakout flags",
    bullets: [
      { label: "PIN", primary: "Add any tracked repo to your list" },
      { label: "TRACK", primary: "24h / 7d star deltas, cross-source mentions" },
      { label: "LOCAL", primary: "Lives in your browser — sign in to sync" },
    ],
  };
}

async function revenueEstimateCard(): Promise<ToolCard> {
  await refreshRevenueStartupsFromStore().catch(() => undefined);
  const board = getLeaderboard({ limit: 3 });
  const bullets: Bullet[] = board.rows.map((row, i) => ({
    label: String(i + 1).padStart(2, "0"),
    primary: row.name,
    trailing: formatUsdCompact(row.mrrCents) + " MRR",
  }));
  if (bullets.length === 0) {
    bullets.push({ label: "—", primary: "Leaderboard refreshing…" });
  }
  return {
    routePath: "/tools/revenue-estimate",
    title: "Revenue Estimate",
    tagline: "Verified MRR for OSS-adjacent startups · TrustMRR catalog",
    bullets,
  };
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_/]/)
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function buildCard(slug: Slug): Promise<ToolCard> {
  try {
    await refreshTrendingFromStore();
  } catch {
    // best-effort — fall through to whatever derived-repos has cached
  }
  const repos = getDerivedRepos();
  switch (slug) {
    case "tier-list":
      return tierListCard(repos);
    case "star-history":
      return starHistoryCard(repos);
    case "top-10":
      return top10Card();
    case "digest":
      return digestCard();
    case "treemap":
      return treemapCard(repos);
    case "compare":
      return compareCard(repos);
    case "watchlist":
      return watchlistCard();
    case "revenue-estimate":
      return revenueEstimateCard();
  }
}

// ---------------------------------------------------------------------------
// JSX template — single shared layout. Every tool renders into the same
// header / hero / bullets / footer grid so the cards read as a family.
// ---------------------------------------------------------------------------

function renderCard(card: ToolCard): ReactElement {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: OG_COLORS.bg,
        color: OG_COLORS.textPrimary,
        fontFamily: "sans-serif",
        padding: "44px 60px 60px 60px",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Wordmark fontSize={28} />
        <span
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: 18,
            color: OG_COLORS.textTertiary,
            letterSpacing: "0.06em",
          }}
        >
          {card.routePath}
        </span>
      </div>

      {/* Hero */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 36,
        }}
      >
        <span
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
          }}
        >
          {truncate(card.title, 36)}
        </span>
        <span
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 22,
            color: OG_COLORS.textSecondary,
            maxWidth: 980,
          }}
        >
          {truncate(card.tagline, 110)}
        </span>
      </div>

      {/* Bullets */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 32,
          gap: 10,
          flex: 1,
        }}
      >
        {card.bullets.slice(0, 3).map((b, i) => (
          <BulletRow key={i} bullet={b} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          fontFamily: "monospace",
          fontSize: 18,
          color: OG_COLORS.textTertiary,
          letterSpacing: "0.04em",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: OG_COLORS.brand,
            fontWeight: 700,
          }}
        >
          <StarMark size={18} color={OG_COLORS.brand} />
          <span>{domain}</span>
        </span>
        <span style={{ display: "flex" }}>share card</span>
      </div>

      <AccentStrip />
    </div>
  );
}

function BulletRow({ bullet }: { bullet: Bullet }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "12px 18px",
        borderLeft: `3px solid ${OG_COLORS.brand}`,
        backgroundColor: OG_COLORS.bgSecondary,
      }}
    >
      <span
        style={{
          display: "flex",
          width: 72,
          fontFamily: "monospace",
          fontSize: 16,
          color: OG_COLORS.brand,
          fontWeight: 700,
          letterSpacing: "0.06em",
        }}
      >
        {truncate(bullet.label, 8)}
      </span>
      <span
        style={{
          display: "flex",
          flex: 1,
          fontSize: 24,
          color: OG_COLORS.textPrimary,
          fontWeight: 500,
          overflow: "hidden",
        }}
      >
        {truncate(bullet.primary, 48)}
      </span>
      {bullet.trailing ? (
        <span
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: 18,
            color: OG_COLORS.up,
            fontWeight: 600,
          }}
        >
          {truncate(bullet.trailing, 18)}
        </span>
      ) : null}
    </div>
  );
}

function renderFallbackCard(slug: string): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: OG_COLORS.bg,
        color: OG_COLORS.textPrimary,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <Wordmark fontSize={40} />
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        Unknown tool
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 22,
          color: OG_COLORS.textTertiary,
          fontFamily: "monospace",
        }}
      >
        /tools/{truncate(slug, 32)}
      </div>
      <AccentStrip />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  if (!isSlug(slug)) {
    return new ImageResponse(renderFallbackCard(slug), {
      width: CARD_W,
      height: CARD_H,
      headers: { "Cache-Control": CACHE_HEADER },
    });
  }
  const card = await buildCard(slug);
  return new ImageResponse(renderCard(card), {
    width: CARD_W,
    height: CARD_H,
    headers: { "Cache-Control": CACHE_HEADER },
  });
}
