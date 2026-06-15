// TierCMonetizationBand — homepage value-prop band positioning TrendingRepo's
// monetization-angle differentiation (revenue estimates, funding/MRR radar,
// star-history SVG + treemap) directly above the LiveTopTable rankings card.
//
// SERVER component. No client deps. Reuses the V4 design-system primitives
// (Card variant="tool", SectionHead, FreshnessBadge, --v4-money accent token)
// so the band inherits the terminal-corpus aesthetic without introducing any
// new shell CSS.
//
// Sequence on /:
//   page-head        (hero + newsletter)
//   MetricGrid       (six KPI cells)
//   SectionHead 01   "Trending now / top 5 by category"  + 3 HeroPanels
//   SectionHead 02   "What multiple feeds agree on"      + 2 consensus cards
//   SectionHead 03   "Signal map / momentum vs scale"    + BubbleMap
//   SectionHead 04   "Featured / curated this week"      + 5 feat cards
//   ─► TierCMonetizationBand  (this — positions the angle)
//   SectionHead 05   "Live / top 50"                     + LiveTopTable
//   SectionHead 06   "TrendingRepo Index / last 30 days" + chart
//
// Strategic framing: combined deep-crawl deltas (toolbox PR #241, L1 #3172,
// F4 #3173, C-CAT #3174) flagged monetization (revenue calculator 4.0, MRR
// radar 4.0, star-history SVG 3.0, embed virality wedge) as our defensible
// differentiation vs OSSInsight + TrendShift. This band names that angle on
// the home page without displacing rankings as the entry point.
//
// Honest staleness: each card derives an "is-live" boolean from
// classifyFreshness. A cold source flips the right-aligned chip from a green
// "live" indicator to an amber "updating" one — never publishes a stale
// figure as if it were current.

import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { classifyFreshness, type NewsSource } from "@/lib/news/freshness";

export interface TierCMonetizationBandProps {
  /**
   * ISO of the most recent verified-revenue-overlay snapshot. When stale or
   * absent, the Revenue Estimate card flips its corner badge from "DAILY"
   * to "UPDATING" so we never imply a fresh ARR figure when the underlying
   * snapshot is cold.
   */
  revenueOverlaysGeneratedAt: string | null | undefined;
  /**
   * ISO of the most recent funding-news fetch. Same treatment for the
   * Funding & MRR Radar card.
   */
  fundingFetchedAt: string | null | undefined;
}

interface TierCCard {
  num: string;
  href: string;
  routeLabel: string;
  /** Title rendered in the .ds-card-head .key slot. */
  title: string;
  /** One-line value prop. */
  blurb: ReactNode;
  /** Mono CTA in the foot — terminal-corpus style. */
  cta: string;
  /** NewsSource ladder slot for the FreshnessBadge in the head-right. */
  source: NewsSource;
  /** ISO of the last underlying write — drives FreshnessBadge + isLive. */
  lastUpdatedAt: string | null | undefined;
  /**
   * When false, the card swaps its "live" foot chip for an "updating" one.
   * Strict no-publicly-stale-batches: visible state never lies about
   * source health.
   */
  isLive: boolean;
  /** Foot-chip copy for live vs. updating states. */
  liveLabel: string;
  staleLabel: string;
}

export function TierCMonetizationBand({
  revenueOverlaysGeneratedAt,
  fundingFetchedAt,
}: TierCMonetizationBandProps) {
  // Revenue overlays ride the same daily-rebuild cadence as the trending
  // pipeline. classifyFreshness("repos", …) is the closest source-health
  // contract that already gates the home page — anything past its STALE
  // threshold flips to "updating" honestly.
  const revenueFresh = classifyFreshness("repos", revenueOverlaysGeneratedAt ?? null);
  const revenueIsLive = revenueFresh.status === "live";

  // Funding signals are event-driven — they can sit quiet for days between
  // rounds without being meaningfully stale, so we treat anything that's
  // not flat-out cold as live. The "cold" tier (past the configured stale
  // threshold) still trips the updating pill. We piggyback on the "npm"
  // source slot — it shares the 50h slow-cron Redis-published threshold
  // that funding-news rides on, and reusing an existing NewsSource slot
  // keeps a future per-source freshness contract auto-applied here too.
  const fundingFresh = classifyFreshness("npm", fundingFetchedAt ?? null);
  const fundingIsLive = fundingFresh.status !== "cold";

  const cards: TierCCard[] = [
    {
      num: "01",
      href: "/tools/revenue-estimate",
      routeLabel: "/tools/revenue-estimate",
      title: "Revenue Estimate",
      blurb: (
        <>
          <b>ARR calculator</b> with verified overlays and a comp set — point
          at a repo, get a defensible ARR band, ship the share card.
        </>
      ),
      cta: "OPEN ESTIMATOR →",
      source: "repos",
      lastUpdatedAt: revenueOverlaysGeneratedAt ?? null,
      isLive: revenueIsLive,
      liveLabel: "DAILY BUILD",
      staleLabel: "UPDATING",
    },
    {
      num: "02",
      href: "/funding",
      routeLabel: "/funding",
      title: "Funding & MRR Radar",
      blurb: (
        <>
          <b>Live tape</b> of OSS-adjacent rounds, founder-led MRR signals,
          and pre-IPO movers — none of which OSSInsight or TrendShift ship.
        </>
      ),
      cta: "OPEN RADAR →",
      source: "npm",
      lastUpdatedAt: fundingFetchedAt ?? null,
      isLive: fundingIsLive,
      liveLabel: "EVENT-DRIVEN",
      staleLabel: "REFRESHING",
    },
    {
      num: "03",
      href: "/tools/star-history",
      routeLabel: "/tools/star-history · /tools/treemap",
      title: "Star-history & Treemap",
      blurb: (
        <>
          <b>Embed-ready SVGs</b> — 30-day cumulative curves and a category
          treemap you can drop into a README or a screenshot thread.
        </>
      ),
      cta: "PLOT REPOS →",
      // Star-history is computed from snapshots that ship with every build,
      // so it inherits the build cadence — same source slot as revenue.
      source: "repos",
      lastUpdatedAt: revenueOverlaysGeneratedAt ?? null,
      // Visual exports degrade gracefully even when the input snapshot is
      // mid-rotation (they fall back to whatever sparkline data is on hand),
      // so we keep this lane on regardless of revenue's freshness.
      isLive: true,
      liveLabel: "SVG · EMBED",
      staleLabel: "WARMING",
    },
  ];

  return (
    <>
      <SectionHead
        num="// 04.5"
        title="Monetization signals / what OSSInsight + TrendShift don't ship"
        meta={
          <>
            <b>3 surfaces</b> · revenue · funding · embeds
          </>
        }
      />
      <div className="grid">
        {cards.map((card) => (
          <Link
            key={card.num}
            href={card.href}
            prefetch={false}
            className="col-4"
            style={{ textDecoration: "none", color: "inherit" }}
            aria-label={`${card.title} — ${card.routeLabel}`}
          >
            <Card variant="tool" className="tier-c-card">
              <CardHeader
                right={
                  <FreshnessBadge
                    source={card.source}
                    lastUpdatedAt={card.lastUpdatedAt}
                  />
                }
                showCorner
              >
                <span
                  className="cat-pip"
                  style={{ background: "var(--v4-money)" }}
                  aria-hidden="true"
                />
                {`// ${card.num} `}
                <b style={{ color: "var(--v4-money)" }}>{card.title}</b>
              </CardHeader>
              <div
                className="panel-body"
                style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--v4-ink-200, var(--ink-200, #d6d6d6))",
                  }}
                >
                  {card.blurb}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace)",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      color: "var(--v4-money)",
                      fontWeight: 600,
                    }}
                  >
                    {card.cta}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace)",
                      fontSize: 9.5,
                      letterSpacing: "0.12em",
                      padding: "2px 6px",
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: card.isLive
                        ? "color-mix(in srgb, var(--v4-money) 32%, transparent)"
                        : "color-mix(in srgb, var(--v4-amber, #f5a623) 36%, transparent)",
                      color: card.isLive ? "var(--v4-money)" : "var(--v4-amber, #f5a623)",
                      background: card.isLive
                        ? "color-mix(in srgb, var(--v4-money) 10%, transparent)"
                        : "color-mix(in srgb, var(--v4-amber, #f5a623) 12%, transparent)",
                      textTransform: "uppercase",
                    }}
                  >
                    {card.isLive ? card.liveLabel : card.staleLabel}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono, ui-monospace)",
                    fontSize: 9.5,
                    letterSpacing: "0.10em",
                    color: "var(--v4-ink-500, var(--ink-500, #8a8a8a))",
                  }}
                >
                  {card.routeLabel}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
