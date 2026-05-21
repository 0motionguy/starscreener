// GET /api/og/funding — Funding Radar share card.
//
// Pulls live KPIs from the funding data spine (this-week count + biggest
// round headline) and renders them text-first inside the standard
// CardFrame. Falls back to a static teaser if either getter throws —
// the card never blocks an unfurl.

import { ImageResponse } from "next/og";

import {
  refreshFundingNewsFromStore,
  getFundingStats,
  getFundingSignalsThisWeek,
} from "@/lib/funding-news";
import {
  AccentStrip,
  CardFrame,
  StarMark,
  Wordmark,
  truncate,
} from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatUsdCompact(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

interface FundingKpis {
  thisWeekCount: number;
  totalCount: number;
  totalUsd: number | null;
  topHeadline: string | null;
  topAmount: string | null;
}

async function loadKpis(): Promise<FundingKpis> {
  try {
    await refreshFundingNewsFromStore();
  } catch {
    /* graceful — sync getters below fall back to bundled JSON. */
  }
  let stats;
  try {
    stats = getFundingStats();
  } catch {
    return {
      thisWeekCount: 0,
      totalCount: 0,
      totalUsd: null,
      topHeadline: null,
      topAmount: null,
    };
  }
  let weekRows: ReturnType<typeof getFundingSignalsThisWeek> = [];
  try {
    weekRows = getFundingSignalsThisWeek();
  } catch {
    weekRows = [];
  }
  const top = stats.topRound;
  const topExtracted = top?.extracted ?? null;
  return {
    thisWeekCount: stats.thisWeekCount,
    totalCount: stats.totalSignals,
    totalUsd: stats.totalAmountUsd,
    topHeadline:
      topExtracted?.companyName?.trim() ||
      top?.headline?.trim() ||
      (weekRows[0]?.extracted?.companyName ?? weekRows[0]?.headline ?? null),
    topAmount: topExtracted?.amountDisplay ?? null,
  };
}

export async function GET(): Promise<Response> {
  const kpis = await loadKpis();

  return new ImageResponse(
    (
      <CardFrame>
        {/* Header strip */}
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
            /funding
          </span>
        </div>

        {/* Hero */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: OG_COLORS.textPrimary,
            }}
          >
            Funding Radar
          </span>
          <span
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 24,
              color: OG_COLORS.textSecondary,
              maxWidth: 980,
              lineHeight: 1.35,
            }}
          >
            Capital flows for AI + tech. 35+ sources — TechCrunch,
            VentureBeat, Sifted, Crunchbase, SEC Form D, Newcomer.
          </span>
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <KpiTile
            label="THIS WEEK"
            value={String(kpis.thisWeekCount)}
            suffix="rounds"
          />
          <KpiTile
            label="TRACKED"
            value={String(kpis.totalCount)}
            suffix="signals"
          />
          <KpiTile
            label="CAPITAL"
            value={formatUsdCompact(kpis.totalUsd)}
            suffix="all-time"
          />
        </div>

        {kpis.topHeadline ? (
          <div
            style={{
              display: "flex",
              marginTop: 24,
              padding: "14px 18px",
              borderLeft: `3px solid ${OG_COLORS.brand}`,
              backgroundColor: OG_COLORS.bgSecondary,
              alignItems: "center",
              gap: 18,
            }}
          >
            <span
              style={{
                display: "flex",
                fontFamily: "monospace",
                fontSize: 14,
                color: OG_COLORS.brand,
                letterSpacing: "0.08em",
                fontWeight: 700,
                width: 78,
              }}
            >
              TOP ROUND
            </span>
            <span
              style={{
                display: "flex",
                flex: 1,
                fontSize: 22,
                color: OG_COLORS.textPrimary,
                fontWeight: 500,
              }}
            >
              {truncate(kpis.topHeadline, 56)}
            </span>
            {kpis.topAmount ? (
              <span
                style={{
                  display: "flex",
                  fontFamily: "monospace",
                  fontSize: 20,
                  color: OG_COLORS.up,
                  fontWeight: 700,
                }}
              >
                {truncate(kpis.topAmount, 14)}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginTop: "auto",
            fontFamily: "monospace",
            fontSize: 20,
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
            <span>trendingrepo.com</span>
          </span>
          <span style={{ display: "flex" }}>share card</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}

function KpiTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 22px",
        borderRadius: 4,
        border: `1px solid ${OG_COLORS.border}`,
        backgroundColor: OG_COLORS.bgSecondary,
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 13,
          fontFamily: "monospace",
          color: OG_COLORS.textTertiary,
          letterSpacing: "0.14em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 44,
          fontWeight: 800,
          color: OG_COLORS.textPrimary,
          letterSpacing: "-0.02em",
        }}
      >
        <span>{value}</span>
        <span
          style={{
            display: "flex",
            fontSize: 16,
            fontWeight: 500,
            color: OG_COLORS.textTertiary,
            fontFamily: "monospace",
          }}
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}
