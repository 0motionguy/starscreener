// /api/og/referral/[handle] — Referral share card (Chunk G).
//
// Public, anonymous OG card rendered when someone shares a referral link
// like `https://trendingrepo.com?ref=mirko`. The X / LinkedIn / Slack
// crawler hits this endpoint to populate the unfurl thumbnail.
//
// Composition:
//   - Top:    "<handle> invited you to TrendingRepo"
//   - Middle: qualified-referral count + the highest milestone badge
//             reached so far (connector / operator / founder)
//   - Bottom: ref URL + tagline
//
// Reuses the OgFrame / OgHeader / OgFooter shells from
// `@/lib/og-primitives` so future cards adopt the same vocabulary.
//
// Cache-Control: 24h hard cache + 24h SWR. Counts are cumulative and
// only ever go up; a 24h refresh is plenty for unfurl freshness.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { and, count, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema/profiles";
import {
  referralCodes,
  referralMilestones,
  REFERRAL_MILESTONE_THRESHOLDS,
  type ReferralMilestoneKey,
} from "@/lib/db/schema/referrals";
import { referrals } from "@/lib/db/schema/referrals";
import {
  AccentStrip,
  CardFrame,
  NotFoundCard,
  OgFooter,
  OgHeader,
  StarMark,
  truncate,
} from "@/lib/og-primitives";
import { OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twitter `summary_large_image` symmetric size — also what LinkedIn/Slack
// prefer for link unfurls. We deliberately do NOT support multiple aspects
// here; the card is always 1200×630 so callers can hard-link it from a
// `<meta property="og:image">` tag.
const WIDTH = 1200;
const HEIGHT = 630;

// 24h hard cache + 24h SWR. Counts move monotonically upward and the
// composition is purely a function of (handle, milestoneCount), so it's
// safe to serve a stale image while we revalidate in the background.
const CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=86400";

const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

interface ReferralOgData {
  profile: Profile;
  code: string;
  qualifiedCount: number;
  highestMilestone: ReferralMilestoneKey | null;
}

/**
 * Resolve a `@handle` URL segment into a profile + referral code +
 * milestone summary. Returns `null` when the handle is unknown so the
 * caller can render NotFoundCard rather than 500.
 */
async function loadReferralData(
  handle: string,
): Promise<ReferralOgData | null> {
  // Profile lookup — case-insensitive for share-link resilience.
  const matches = await db
    .select()
    .from(profiles)
    .where(eq(profiles.handle, handle))
    .limit(1);
  const profile = matches[0] ?? null;
  if (!profile) return null;

  // Code lookup. Click-only links may pre-date the code row, so a missing
  // row falls back to the handle (the URL the user is likely sharing).
  const codeRow = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.profileId, profile.id))
    .limit(1);
  const code = codeRow[0]?.code ?? profile.handle.toLowerCase();

  // Qualified count + highest milestone — both reads in parallel.
  const [qualifiedRow, milestoneRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, profile.id),
          isNotNull(referrals.qualifiedAt),
        ),
      ),
    db
      .select({ key: referralMilestones.milestoneKey })
      .from(referralMilestones)
      .where(eq(referralMilestones.profileId, profile.id)),
  ]);

  const earned = new Set(milestoneRows.map((r) => r.key));
  // Walk thresholds high→low so we pick the headline tier (founder > operator > connector).
  const highestMilestone =
    [...REFERRAL_MILESTONE_THRESHOLDS]
      .reverse()
      .find((m) => earned.has(m.key))?.key ?? null;

  return {
    profile,
    code,
    qualifiedCount: Number(qualifiedRow[0]?.n ?? 0),
    highestMilestone,
  };
}

// ---------------------------------------------------------------------------
// Visual building blocks
// ---------------------------------------------------------------------------

const MILESTONE_LABELS: Record<ReferralMilestoneKey, string> = {
  connector: "Connector",
  operator: "Operator",
  founder: "Founder",
};

const MILESTONE_BLURB: Record<ReferralMilestoneKey, string> = {
  connector: "Active referrer · 1+ qualified",
  operator: "Operator badge · 5+ qualified",
  founder: "Founder circle · 25+ qualified",
};

function MilestoneBadge({ kind }: { kind: ReferralMilestoneKey }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        padding: "12px 18px",
        borderRadius: 4,
        border: `1px solid ${OG_COLORS.brand}`,
        backgroundColor: "rgba(245, 110, 15, 0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 22,
          fontFamily: "monospace",
          color: OG_COLORS.brand,
          letterSpacing: 1.6,
          textTransform: "uppercase",
        }}
      >
        <StarMark size={18} color={OG_COLORS.brand} />
        <span>{MILESTONE_LABELS[kind]}</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 18,
          color: OG_COLORS.textTertiary,
          fontFamily: "monospace",
          letterSpacing: 0.4,
        }}
      >
        {MILESTONE_BLURB[kind]}
      </div>
    </div>
  );
}

function ReferralCard({ data }: { data: ReferralOgData }) {
  const { profile, code, qualifiedCount, highestMilestone } = data;
  const inviterName =
    profile.displayName?.trim() ||
    `@${profile.handle}`;

  // Single-line headline. Truncate over 36 chars so the largest font size
  // never wraps awkwardly on long display names.
  const headline = `${truncate(inviterName, 36)} invited you to TrendingRepo`;
  const refUrl = `trendingrepo.com?ref=${code}`;

  return (
    <CardFrame padding="56px 72px 64px 72px">
      <OgHeader handle={profile.handle} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 56,
          gap: 24,
          maxWidth: 1056,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 14,
            fontFamily: "monospace",
            color: OG_COLORS.textTertiary,
            letterSpacing: 1.6,
            textTransform: "uppercase",
          }}
        >
          {"// REFERRAL · INVITE"}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: OG_COLORS.textSecondary,
            lineHeight: 1.4,
            maxWidth: 980,
          }}
        >
          See what's breaking out on GitHub, Hacker News, Bluesky, Product
          Hunt, dev.to, and more — one live terminal for every signal.
        </div>
      </div>

      {/* Stats + milestone band */}
      <div
        style={{
          display: "flex",
          marginTop: 40,
          gap: 24,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "14px 22px",
            borderRadius: 4,
            border: `1px solid ${OG_COLORS.border}`,
            backgroundColor: OG_COLORS.bgSecondary,
            minWidth: 200,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 14,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            QUALIFIED
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
            <span>{qualifiedCount}</span>
            <span
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 500,
                color: OG_COLORS.textTertiary,
                fontFamily: "monospace",
              }}
            >
              referrals
            </span>
          </div>
        </div>

        {highestMilestone ? (
          <MilestoneBadge kind={highestMilestone} />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: "monospace",
              fontSize: 18,
              color: OG_COLORS.textTertiary,
              letterSpacing: 0.6,
              padding: "0 8px",
            }}
          >
            {"// EARN BADGES BY INVITING FRIENDS"}
          </div>
        )}
      </div>

      <OgFooter url={refUrl} />
    </CardFrame>
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ handle: string }>;
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  const { handle } = await ctx.params;
  Sentry.setTag("route", "api/og/referral");
  Sentry.setTag("og.handle", handle);

  if (!HANDLE_PATTERN.test(handle)) {
    return new ImageResponse(
      <NotFoundCardShell headline="Invalid handle" hint={handle} />,
      { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }

  try {
    const data = await loadReferralData(handle);
    if (!data) {
      return new ImageResponse(
        <NotFoundCardShell
          headline="Referral not found"
          subline="This invite link is no longer active."
          hint={`@${handle}`}
        />,
        {
          width: WIDTH,
          height: HEIGHT,
          headers: { "Cache-Control": "public, s-maxage=300" },
        },
      );
    }

    return new ImageResponse(<ReferralCard data={data} />, {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": CACHE_HEADER },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api/og/referral", handle },
    });
    // Last-resort friendly fallback so the X crawler never gets a broken
    // image even on DB outages — return the not-found card with a 1-minute
    // cache so a transient error doesn't poison long-cache responses.
    return new ImageResponse(
      <NotFoundCardShell
        headline="Referral unavailable"
        subline="We couldn't load this referral right now. Try again later."
      />,
      { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}

// Wrap NotFoundCard in a 1200×630 div so ImageResponse renders at the
// share-card aspect rather than the smaller default. NotFoundCard expects
// to fill its parent, which is fine when we pass `{ width, height }` to
// ImageResponse — but we add an explicit accent strip to stay visually
// consistent with the success card (CardFrame normally provides it).
function NotFoundCardShell({
  headline,
  subline,
  hint,
}: {
  headline: string;
  subline?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <NotFoundCard headline={headline} subline={subline} hint={hint} />
      <AccentStrip />
    </div>
  );
}
