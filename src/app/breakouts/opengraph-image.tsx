// TrendingRepo — Cross-Signal Breakouts OG share card.
//
// 1200×630 static-ish share card for /breakouts. Resolves the current
// breakout list from the committed derived-repos JSON, surfaces the
// "N repos breaking out today" headline and the top 3 names. Revalidated
// whenever the underlying derived-repos snapshot changes — the helper is
// process-cached and invalidates on upstream data version.

import { ImageResponse } from "next/og";

import { getDerivedRepos } from "@/lib/derived-repos";
import { getChannelStatus } from "@/lib/pipeline/cross-signal";
import type { Repo } from "@/lib/types";
import { OG_COLORS } from "@/lib/seo";
import {
  CardFrame,
  StarMark,
  Wordmark,
  compactNumber,
  truncate,
} from "@/lib/og-primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Cross-Signal Breakouts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAME_MAX = 36;

/**
 * Same visible-firing definition as the page: count GitHub movement +
 * Reddit velocity + HN presence (exclude Bluesky so the number matches
 * the 3-dot indicator shown in-page).
 */
function visibleFiring(repo: Repo, nowMs: number): number {
  const s = getChannelStatus(repo, nowMs);
  return (s.github ? 1 : 0) + (s.reddit ? 1 : 0) + (s.hn ? 1 : 0);
}

export default async function BreakoutsOGImage() {
  const allRepos = getDerivedRepos();
  const nowMs = Date.now();

  const annotated = allRepos
    .map((r) => ({ repo: r, firing: visibleFiring(r, nowMs) }))
    .filter((x) => x.firing >= 2)
    .sort(
      (a, b) =>
        (b.repo.crossSignalScore ?? 0) - (a.repo.crossSignalScore ?? 0),
    );

  const multiChannel = annotated.length;
  const allThree = annotated.filter((x) => x.firing === 3).length;
  const top3 = annotated.slice(0, 3);

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
          <span>Cross-Signal</span>
          <span style={{ color: OG_COLORS.brand }}>·</span>
          <span>Breakouts</span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
          }}
        >
          <span style={{ color: OG_COLORS.brand }}>{multiChannel}</span>
          <span style={{ marginLeft: 20 }}>repos breaking out</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 26,
            color: OG_COLORS.textSecondary,
          }}
        >
          Where GitHub momentum, Reddit velocity, and Hacker News agree
          {allThree > 0 ? ` · ${allThree} on all three` : ""}
        </div>

        {/* Top 3 */}
        {top3.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 40,
              gap: 14,
              width: "100%",
            }}
          >
            {top3.map(({ repo, firing }) => (
              <div
                key={repo.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 24px",
                  borderRadius: 14,
                  backgroundColor: OG_COLORS.bgSecondary,
                  border: `1px solid ${
                    firing === 3 ? OG_COLORS.brand : OG_COLORS.border
                  }`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      border: `1px solid ${OG_COLORS.border}`,
                      backgroundColor: OG_COLORS.bg,
                      fontSize: 24,
                      fontWeight: 800,
                      fontFamily: "monospace",
                      color: OG_COLORS.brand,
                    }}
                  >
                    {firing}/3
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      maxWidth: 680,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        fontSize: 28,
                        fontWeight: 700,
                        color: OG_COLORS.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {truncate(repo.fullName, NAME_MAX)}
                    </div>
                    {repo.language && (
                      <div
                        style={{
                          display: "flex",
                          fontSize: 18,
                          color: OG_COLORS.textTertiary,
                          marginTop: 4,
                          fontFamily: "monospace",
                        }}
                      >
                        {repo.language}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 28,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: OG_COLORS.brand,
                  }}
                >
                  <span>{compactNumber(repo.stars)}</span>
                  <StarMark size={24} color={OG_COLORS.brand} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              marginTop: 48,
              fontSize: 28,
              color: OG_COLORS.textSecondary,
            }}
          >
            Nothing breaking out right now — check back after the next sweep.
          </div>
        )}

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
            trendingrepo.com/breakouts
          </div>
          <Wordmark />
        </div>
      </CardFrame>
    ),
    size,
  );
}
