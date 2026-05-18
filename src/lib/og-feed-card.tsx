// Shared OG card for trending-feed routes (S5.C.3).
//
// Each of /twitter, /reddit, /hackernews, /bluesky, /funding, /digest,
// and /consensus uses this helper to render a brand-consistent share
// card. The variation between feeds is small enough that the same
// component handles all of them via a single config object.
//
// Layout: 1200×630.
//   - Eyebrow:  "TRENDINGREPO · <FEED>"
//   - Headline: feed-specific tagline
//   - Body:     up to 3 supporting lines (numbers, names, freshness)
//   - Footer:   route URL + brand wordmark

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export interface FeedCardConfig {
  /** Used as the OG image `alt` text — should match the `TrendingRepo — X` pattern. */
  alt: string;
  /** Top eyebrow string after the brand mark. */
  eyebrow: string;
  /** Hero headline. Kept under ~40 chars to stay one line. */
  headline: string;
  /** Sub-headline. */
  sub: string;
  /** Up to 3 supporting rows (e.g. "1.2k tweets · 24h"). */
  rows?: ReadonlyArray<{ label: string; value?: string }>;
  /** Route path for the footer URL (no trailing slash). */
  routePath: string;
  /** Optional accent color override (defaults to brand). */
  accent?: string;
}

export const FEED_OG_SIZE = { width: 1200, height: 630 };

export function renderFeedOGImage(config: FeedCardConfig): ImageResponse {
  const accent = config.accent ?? OG_COLORS.brand;

  return new ImageResponse(
    (
      <CardFrame>
        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: OG_COLORS.textTertiary,
            textTransform: "uppercase",
          }}
        >
          <span>TrendingRepo</span>
          <span style={{ color: accent }}>·</span>
          <span style={{ color: accent }}>{config.eyebrow}</span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
          }}
        >
          {config.headline}
        </div>

        {/* Sub */}
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            color: OG_COLORS.textSecondary,
            maxWidth: 1000,
            lineHeight: 1.25,
          }}
        >
          {config.sub}
        </div>

        {/* Optional supporting rows */}
        {config.rows && config.rows.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 40,
              gap: 12,
              width: "100%",
            }}
          >
            {config.rows.slice(0, 3).map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 24px",
                  borderRadius: 12,
                  backgroundColor: OG_COLORS.bgSecondary,
                  border: `1px solid ${OG_COLORS.border}`,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    fontSize: 24,
                    color: OG_COLORS.textPrimary,
                    fontWeight: 600,
                  }}
                >
                  {row.label}
                </span>
                {row.value ? (
                  <span
                    style={{
                      display: "flex",
                      fontSize: 24,
                      color: accent,
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {row.value}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 0.5,
            }}
          >
            trendingrepo.com{config.routePath}
          </div>
          <Wordmark />
        </div>
      </CardFrame>
    ),
    { ...FEED_OG_SIZE, headers: OG_CACHE_HEADERS },
  );
}

/** Convenience export so route files don't have to import ReactElement. */
export type FeedOGImage = ReactElement;
