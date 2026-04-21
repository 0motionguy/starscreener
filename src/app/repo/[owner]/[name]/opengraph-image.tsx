// TrendingRepo — Repo detail OG image
//
// 1200×630 dynamic share card for a single repo. Pulls data via the pipeline
// facade, falls back to a "repo not found" card if the identifier is stale.
//
// Layout:
//   - owner/name at top (large, bold)
//   - description (truncated ~120 chars)
//   - 3 big stats: stars total, 24h delta (colored), momentum score
//   - sparkline (SVG polyline) when sparklineData has ≥7 points AND >1 unique
//     value — skipped when flat so we don't show a meaningless horizontal line
//   - STARSCREENER wordmark bottom-left, URL bottom-right

import { ImageResponse } from "next/og";
import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";

export const runtime = "nodejs";
export const alt = "TrendingRepo — Repo momentum card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DESCRIPTION_MAX = 120;
const SPARKLINE_MIN_POINTS = 7;
const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

interface RouteParams {
  params: Promise<{ owner: string; name: string }>;
}

export default async function RepoOGImage({ params }: RouteParams) {
  const { owner, name } = await params;
  const validSlug =
    SLUG_PART_PATTERN.test(owner) && SLUG_PART_PATTERN.test(name);

  const repo = validSlug ? getDerivedRepoByFullName(`${owner}/${name}`) : null;

  if (!repo) {
    return new ImageResponse(
      (
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
            }}
          >
            Repo not found
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 28,
              color: OG_COLORS.textTertiary,
              fontFamily: "monospace",
            }}
          >
            {owner}/{name}
          </div>
        </div>
      ),
      size,
    );
  }

  const category = CATEGORIES.find((c) => c.id === repo.categoryId);
  const deltaPositive = repo.starsDelta24h >= 0;
  const deltaColor = deltaPositive ? OG_COLORS.up : OG_COLORS.down;
  const deltaLabel = `${deltaPositive ? "+" : ""}${formatCount(
    repo.starsDelta24h,
  )}`;
  const description = truncate(repo.description ?? "", DESCRIPTION_MAX);

  // Sparkline gating: render only with enough points AND variance.
  const spark = repo.sparklineData ?? [];
  const uniqueValues = new Set(spark).size;
  const hasSparkline =
    spark.length >= SPARKLINE_MIN_POINTS && uniqueValues > 1;
  const sparkPath = hasSparkline
    ? buildSparklinePath(spark, 1056, 100)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG_COLORS.bg,
          color: OG_COLORS.textPrimary,
          padding: "48px 72px 56px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Top row: category pill right-aligned */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
          }}
        >
          {category && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 16px",
                borderRadius: 9999,
                border: `1px solid ${category.color}`,
                color: category.color,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              {category.shortName ?? category.name}
            </div>
          )}
        </div>

        {/* Repo fullName */}
        <div
          style={{
            display: "flex",
            marginTop: 8,
            fontSize: 64,
            fontWeight: 800,
            color: OG_COLORS.textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {repo.fullName}
        </div>

        {/* Description */}
        {description && (
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 24,
              color: OG_COLORS.textSecondary,
              lineHeight: 1.35,
              maxWidth: 1056,
            }}
          >
            {description}
          </div>
        )}

        {/* 3 big stats */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            gap: 24,
            width: "100%",
          }}
        >
          <BigStat
            label="Stars"
            value={formatStars(repo.stars)}
            color={OG_COLORS.textPrimary}
            icon={<StarMark size={28} color={OG_COLORS.brand} />}
          />
          <BigStat
            label="24h"
            value={deltaLabel}
            color={deltaColor}
          />
          <BigStat
            label="Momentum"
            value={repo.momentumScore.toFixed(1)}
            color={OG_COLORS.brand}
          />
        </div>

        {/* Sparkline — only when we have real signal */}
        {sparkPath && (
          <div
            style={{
              display: "flex",
              marginTop: 28,
              width: "100%",
              justifyContent: "center",
            }}
          >
            <svg
              width="1056"
              height="100"
              viewBox="0 0 1056 100"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d={sparkPath.area}
                fill={OG_COLORS.brandDim}
                stroke="none"
              />
              <path
                d={sparkPath.line}
                fill="none"
                stroke={OG_COLORS.brand}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Footer: wordmark left, URL right */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 24,
              fontWeight: 700,
              color: OG_COLORS.textPrimary,
            }}
          >
            <StarMark size={24} color={OG_COLORS.brand} />
            <span>STARSCREENER</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 0.5,
            }}
          >
            trendingrepo.com/repo/{repo.owner}/{repo.name}
          </div>
        </div>

        {/* Accent strip */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: OG_COLORS.brand,
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}

// ---------------------------------------------------------------------------
// Stat block
// ---------------------------------------------------------------------------

function BigStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "18px 22px",
        borderRadius: 14,
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
          alignItems: "center",
          gap: 10,
          fontSize: 52,
          fontFamily: "monospace",
          fontWeight: 800,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {icon}
        <span>{value}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function formatStars(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `${Math.round(n / 1_000).toLocaleString("en-US")}k`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toLocaleString("en-US");
}

function buildSparklinePath(
  data: number[],
  width: number,
  height: number,
): { line: string; area: string } {
  const padY = 6;
  const usableH = height - padY * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padY + (1 - (v - min) / range) * usableH;
    return { x, y };
  });

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${height} L${first.x.toFixed(
    2,
  )} ${height} Z`;

  return { line, area };
}
