// TrendingRepo — Idea OG share card.
//
// 1200×630 dynamic share card for /ideas/[id]. Rendered whenever a
// client unfurls an idea URL (X, LinkedIn, Slack, Discord). Mirrors
// the repo-detail card's chrome so a share from /ideas/<id> looks
// like part of the same brand surface.
//
// Layout:
//   - "BUILDER IDEA" eyebrow + build status chip (top)
//   - Title (massive, up to 2 lines)
//   - Pitch (truncated ~160 chars, 2-3 lines)
//   - Reaction counts strip (build/use/buy/invest) when any > 0
//   - Author handle + targets + STARSCREENER wordmark (bottom)

import { ImageResponse } from "next/og";

import { getIdeaById, toPublicIdea } from "@/lib/ideas";
import { countReactions, listReactionsForObject } from "@/lib/reactions";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Builder idea card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE_MAX = 120;
const PITCH_MAX = 170;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export default async function IdeaOGImage({ params }: RouteParams) {
  const { id } = await params;

  const record = ID_PATTERN.test(id) ? await getIdeaById(id) : null;
  const visible =
    !!record &&
    (record.status === "published" || record.status === "shipped");

  if (!visible) {
    return new ImageResponse(<NotFoundCard />, { ...size });
  }

  const idea = toPublicIdea(record);
  const reactions = await listReactionsForObject("idea", record.id);
  const counts = countReactions(reactions);
  const totalReactions =
    counts.build + counts.use + counts.buy + counts.invest;

  const title = truncate(idea.title, TITLE_MAX);
  const pitch = truncate(idea.pitch, PITCH_MAX);

  const buildStatusMeta = BUILD_STATUS_CHIP[idea.buildStatus];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG_COLORS.bg,
          padding: 64,
          fontFamily: "sans-serif",
          color: OG_COLORS.textPrimary,
        }}
      >
        {/* Eyebrow + build-status chip */}
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
          <span>Builder idea</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${buildStatusMeta.border}`,
              backgroundColor: buildStatusMeta.bg,
              color: buildStatusMeta.fg,
              fontSize: 18,
              letterSpacing: 1.5,
            }}
          >
            {buildStatusMeta.label}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            color: OG_COLORS.textPrimary,
          }}
        >
          {title}
        </div>

        {/* Pitch */}
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 28,
            lineHeight: 1.35,
            color: OG_COLORS.textSecondary,
          }}
        >
          {pitch}
        </div>

        {/* Reactions strip — only when any > 0, otherwise spacer */}
        {totalReactions > 0 ? (
          <div
            style={{
              display: "flex",
              marginTop: 40,
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <ReactionTile label="build" value={counts.build} />
            <ReactionTile label="use" value={counts.use} />
            <ReactionTile label="buy" value={counts.buy} />
            <ReactionTile label="invest" value={counts.invest} />
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1 }} />
        )}

        {/* Footer: author + targets + wordmark */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              color: OG_COLORS.textTertiary,
              fontSize: 22,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: OG_COLORS.textSecondary }}>
                @{idea.authorHandle}
              </span>
            </div>
            {idea.targetRepos.length > 0 ? (
              <div style={{ display: "flex", fontSize: 18 }}>
                targets: {idea.targetRepos.slice(0, 3).join(" · ")}
                {idea.targetRepos.length > 3
                  ? ` +${idea.targetRepos.length - 3}`
                  : ""}
              </div>
            ) : null}
          </div>
          <Wordmark />
        </div>
      </div>
    ),
    { ...size },
  );
}

function ReactionTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const muted = value === 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "12px 20px",
        borderRadius: 14,
        border: `1px solid ${muted ? OG_COLORS.border : OG_COLORS.brandDim}`,
        backgroundColor: muted ? OG_COLORS.bgSecondary : OG_COLORS.brandDim,
        color: muted ? OG_COLORS.textTertiary : OG_COLORS.brand,
      }}
    >
      <span
        style={{
          fontSize: 16,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: muted ? OG_COLORS.textSecondary : OG_COLORS.textPrimary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: OG_COLORS.brand,
        fontSize: 28,
        fontWeight: 800,
      }}
    >
      <StarMark size={30} color={OG_COLORS.brand} />
      <span>TrendingRepo</span>
    </div>
  );
}

function NotFoundCard() {
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
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 44,
          fontWeight: 800,
          color: OG_COLORS.brand,
        }}
      >
        <StarMark size={44} color={OG_COLORS.brand} />
        <span>TrendingRepo</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 56,
          fontWeight: 700,
          color: OG_COLORS.textPrimary,
        }}
      >
        Idea not found
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 24,
          color: OG_COLORS.textTertiary,
        }}
      >
        This idea may have been moderated or removed.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// The build-status chip styling. Stays in sync with the web card in
// src/components/ideas/IdeaCard.tsx — if those labels change, update
// here too or a shared X unfurl will disagree with the in-page badge.
const BUILD_STATUS_CHIP: Record<
  "exploring" | "scoping" | "building" | "shipped" | "abandoned",
  { label: string; bg: string; fg: string; border: string }
> = {
  exploring: {
    label: "EXPLORING",
    bg: OG_COLORS.bgSecondary,
    fg: OG_COLORS.textTertiary,
    border: OG_COLORS.border,
  },
  scoping: {
    label: "SCOPING",
    bg: OG_COLORS.bgSecondary,
    fg: OG_COLORS.textSecondary,
    border: OG_COLORS.border,
  },
  building: {
    label: "BUILDING",
    bg: OG_COLORS.brandDim,
    fg: OG_COLORS.brand,
    border: OG_COLORS.brand,
  },
  shipped: {
    label: "SHIPPED",
    bg: "rgba(34, 197, 94, 0.12)",
    fg: OG_COLORS.up,
    border: OG_COLORS.up,
  },
  abandoned: {
    label: "ABANDONED",
    bg: "rgba(239, 68, 68, 0.1)",
    fg: OG_COLORS.down,
    border: OG_COLORS.down,
  },
};

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return text.slice(0, maxChars - 1).trimEnd() + "…";
}
