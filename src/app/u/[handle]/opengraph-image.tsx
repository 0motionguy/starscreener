// TrendingRepo — Public user profile OG share card.
//
// 1200×630 dynamic share card for /u/[handle]. Fetches the aggregated
// profile, then renders handle + builder tagline + idea/shipped/reactions
// summary + top 2 idea titles. Falls back to a generic "builder" card when
// the handle has no activity so unfurls of empty profiles still look
// branded instead of failing.

import { ImageResponse } from "next/og";

import { getProfile } from "@/lib/profile";
import { OG_COLORS } from "@/lib/seo";
import {
  CardFrame,
  NotFoundCard,
  Wordmark,
  compactNumber,
  truncate,
} from "@/lib/og-primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Builder profile card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const IDEA_TITLE_MAX = 72;

interface RouteParams {
  params: Promise<{ handle: string }>;
}

export default async function UserProfileOGImage({ params }: RouteParams) {
  const { handle } = await params;

  if (!HANDLE_PATTERN.test(handle)) {
    return new ImageResponse(
      (
        <NotFoundCard
          headline="Profile not available"
          subline="This handle isn't valid on TrendingRepo."
          hint={`/u/${handle}`}
        />
      ),
      size,
    );
  }

  const profile = await getProfile(handle);
  const ideaCount = profile.ideas.length;
  const shippedCount = profile.shippedRepos.length;
  const reactionsTotal = profile.reactionsGiven.total;

  // Empty profile — still render a branded card, don't 404 the crawler.
  if (!profile.exists) {
    return new ImageResponse(
      (
        <CardFrame>
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
            Builder profile
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: OG_COLORS.textPrimary,
            }}
          >
            @{handle}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 28,
              color: OG_COLORS.textSecondary,
            }}
          >
            Not shipping yet — follow along for when they do.
          </div>
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
              trendingrepo.com/u/{handle}
            </div>
            <Wordmark />
          </div>
        </CardFrame>
      ),
      size,
    );
  }

  const topIdeas = profile.ideas.slice(0, 2);
  const tagline =
    shippedCount > 0
      ? `Shipping builder · ${shippedCount} ${pluralize(shippedCount, "repo")} live`
      : ideaCount > 0
        ? `${ideaCount} ${pluralize(ideaCount, "idea")} · scouting what to build next`
        : "Builder on TrendingRepo";

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
          Builder profile
        </div>

        {/* Handle */}
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          @{handle}
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 28,
            color: OG_COLORS.textSecondary,
          }}
        >
          {tagline}
        </div>

        {/* Stat tiles */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            gap: 20,
            width: "100%",
          }}
        >
          <ProfileStat label="Ideas" value={compactNumber(ideaCount)} />
          <ProfileStat
            label="Shipped"
            value={compactNumber(shippedCount)}
            color={shippedCount > 0 ? OG_COLORS.up : OG_COLORS.textPrimary}
          />
          <ProfileStat
            label="Reactions"
            value={compactNumber(reactionsTotal)}
            color={OG_COLORS.brand}
          />
        </div>

        {/* Top 2 ideas — collapse gracefully when absent */}
        {topIdeas.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 28,
              gap: 12,
              width: "100%",
            }}
          >
            {topIdeas.map((idea) => (
              <div
                key={idea.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  borderRadius: 1,
                  backgroundColor: OG_COLORS.bgSecondary,
                  border: `1px solid ${OG_COLORS.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 14,
                    fontFamily: "monospace",
                    color: OG_COLORS.brand,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    minWidth: 92,
                  }}
                >
                  {idea.buildStatus}
                </div>
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    fontSize: 22,
                    fontWeight: 600,
                    color: OG_COLORS.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncate(idea.title, IDEA_TITLE_MAX)}
                </div>
              </div>
            ))}
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
            trendingrepo.com/u/{handle}
          </div>
          <Wordmark />
        </div>
      </CardFrame>
    ),
    size,
  );
}

function ProfileStat({
  label,
  value,
  color = OG_COLORS.textPrimary,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "18px 22px",
        borderRadius: 1,
        backgroundColor: OG_COLORS.bgSecondary,
        border: `1px solid ${OG_COLORS.border}`,
      }}
    >
      <span
        style={{
          display: "flex",
          fontSize: 16,
          fontFamily: "monospace",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: OG_COLORS.textTertiary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          fontSize: 56,
          fontFamily: "monospace",
          fontWeight: 800,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function pluralize(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
