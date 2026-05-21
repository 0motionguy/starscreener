// GET /api/og/pricing — Pricing share card.
//
// Static composition reads from the same TIERS source of truth as the
// pricing page so the share card never drifts from the table. The card
// lists each tier's monthly headline price (or contact line for
// Enterprise) and the brand tagline — no live data, no clock.

import { ImageResponse } from "next/og";

import {
  AccentStrip,
  CardFrame,
  StarMark,
  Wordmark,
} from "@/lib/og-primitives";
import { TIERS, TIER_ORDER } from "@/lib/pricing/tiers";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";

function formatPrice(usd: number | null): string {
  if (usd === null) return "Custom";
  if (usd === 0) return "Free";
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
  return `$${usd}`;
}

export async function GET() {
  const tiers = TIER_ORDER.map((id) => TIERS[id]).filter(Boolean);

  return new ImageResponse(
    (
      <CardFrame>
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
            /pricing
          </span>
        </div>

        {/* Hero */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: OG_COLORS.textPrimary,
            }}
          >
            Pricing
          </span>
          <span
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 22,
              color: OG_COLORS.textSecondary,
              maxWidth: 980,
            }}
          >
            Free forever for casual use. Pro for serious operators. Team and
            Enterprise for orgs running real workflows.
          </span>
        </div>

        {/* Tier strip */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 32,
            width: "100%",
          }}
        >
          {tiers.map((tier) => {
            const isPro = tier.key === "pro";
            return (
              <div
                key={tier.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  padding: "18px 18px 22px 18px",
                  borderRadius: 4,
                  border: `1px solid ${isPro ? OG_COLORS.brand : OG_COLORS.border}`,
                  backgroundColor: isPro
                    ? OG_COLORS.brandDim
                    : OG_COLORS.bgSecondary,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "monospace",
                    fontSize: 13,
                    color: isPro ? OG_COLORS.brand : OG_COLORS.textTertiary,
                    letterSpacing: "0.14em",
                    fontWeight: 700,
                  }}
                >
                  {isPro ? <StarMark size={12} color={OG_COLORS.brand} /> : null}
                  <span>{tier.displayName.toUpperCase()}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    marginTop: 12,
                    fontSize: 36,
                    fontWeight: 800,
                    color: OG_COLORS.textPrimary,
                    letterSpacing: "-0.02em",
                  }}
                >
                  <span>{formatPrice(tier.priceMonthlyUsd)}</span>
                  {tier.priceMonthlyUsd !== null && tier.priceMonthlyUsd > 0 ? (
                    <span
                      style={{
                        display: "flex",
                        fontSize: 14,
                        fontWeight: 500,
                        color: OG_COLORS.textTertiary,
                        fontFamily: "monospace",
                      }}
                    >
                      / mo
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 10,
                    fontSize: 14,
                    color: OG_COLORS.textSecondary,
                    lineHeight: 1.35,
                  }}
                >
                  {tier.tagline}
                </div>
              </div>
            );
          })}
        </div>

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
          <span style={{ display: "flex", color: OG_COLORS.brand, fontWeight: 700 }}>
            trendingrepo.com/pricing
          </span>
          <span style={{ display: "flex" }}>start free</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
