// TrendingRepo — MindShare OG / share-card endpoint.
//
// Renders the cross-source attention map as a PNG (default) or SVG
// (?format=svg). Composition mirrors /mindshare but is tuned for thumbnail
// legibility — fewer bubbles (top 24 vs 60), larger min-radius, sparse
// labels. The Twitter card auto-unfurl uses this image when sharing
// trendingrepo.com/mindshare.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDerivedRepos } from "@/lib/derived-repos";
import {
  packBubbles,
  type PackInput,
  type PackResult,
} from "@/lib/bubble-pack";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASPECT_DIMENSIONS = {
  h: { width: 1200, height: 675 },
  v: { width: 1080, height: 1350 },
} as const;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=3600";

const PACK_LIMIT = 24;

// Same channel palette as /mindshare so the share card matches the on-page
// visual at a glance.
const CHANNEL_COLORS = {
  github: "#e5e7eb",
  reddit: "#ff4500",
  hn: "#f59e0b",
  bluesky: "#3b82f6",
  devto: "#22c55e",
} as const;
const CHANNELS = ["github", "reddit", "hn", "bluesky", "devto"] as const;
type Channel = (typeof CHANNELS)[number];

interface BubbleRow {
  id: string;
  shortName: string;
  score: number;
  channels: Record<Channel, boolean>;
  pack: PackResult;
}

function selectMindShareRepos(repos: Repo[]): Repo[] {
  const eligible = repos.filter(
    (r) =>
      typeof r.crossSignalScore === "number" &&
      typeof r.channelsFiring === "number" &&
      r.channelsFiring >= 2 &&
      r.channelStatus,
  );
  eligible.sort(
    (a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0),
  );
  return eligible.slice(0, PACK_LIMIT);
}

function packForRepos(
  repos: Repo[],
  width: number,
  height: number,
): BubbleRow[] {
  const inputs: PackInput[] = repos.map((r) => ({
    id: r.fullName,
    value: Math.max(0.1, (r.crossSignalScore ?? 0)) ** 2,
  }));
  const placed = packBubbles(inputs, {
    width,
    height,
    minRadius: 36,
    maxRadius: 110,
    padding: 6,
    fillRatio: 0.65,
    edgeMargin: 6,
  });
  const byId = new Map(placed.map((p) => [p.id, p]));
  const rows: BubbleRow[] = [];
  for (const r of repos) {
    const pack = byId.get(r.fullName);
    if (!pack) continue;
    const status = r.channelStatus ?? {
      github: false,
      reddit: false,
      hn: false,
      bluesky: false,
      devto: false,
      twitter: false,
    };
    rows.push({
      id: r.fullName,
      shortName: r.fullName.split("/")[1] ?? r.fullName,
      score: r.crossSignalScore ?? 0,
      channels: { ...status },
      pack,
    });
  }
  return rows;
}

interface ArcSegment {
  d: string;
  channel: Channel;
}

function buildChannelArcs(cx: number, cy: number, r: number): ArcSegment[] {
  const GAP = 0.07;
  const STEP = (Math.PI * 2) / CHANNELS.length;
  const START = -Math.PI / 2;
  const out: ArcSegment[] = [];
  for (let i = 0; i < CHANNELS.length; i++) {
    const a0 = START + STEP * i + GAP / 2;
    const a1 = START + STEP * (i + 1) - GAP / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    out.push({ d, channel: CHANNELS[i] });
  }
  return out;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SVG variant — chart-only document, suitable for README embeds.
// ---------------------------------------------------------------------------

function buildSvgDocument(rows: BubbleRow[], width: number, height: number): string {
  const bubbles = rows
    .map((row) => {
      const arcs = buildChannelArcs(row.pack.cx, row.pack.cy, row.pack.r);
      const arcPaths = arcs
        .map((a) => {
          const lit = row.channels[a.channel];
          return `<path d="${a.d}" fill="none" stroke="${
            lit ? CHANNEL_COLORS[a.channel] : OG_COLORS.border
          }" stroke-width="${lit ? 5 : 2}" stroke-linecap="round" opacity="${
            lit ? 1 : 0.5
          }"/>`;
        })
        .join("");
      return `<g><circle cx="${row.pack.cx}" cy="${row.pack.cy}" r="${row.pack.r - 6}" fill="${OG_COLORS.bgTertiary}" stroke="${OG_COLORS.border}" stroke-width="1"/>${arcPaths}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${OG_COLORS.bg}"/>${bubbles}</svg>`;
}

// ---------------------------------------------------------------------------
// PNG variant — full operator-terminal card via ImageResponse.
// ---------------------------------------------------------------------------

function MindShareCard({
  rows,
  width,
  height,
  isVertical,
}: {
  rows: BubbleRow[];
  width: number;
  height: number;
  isVertical: boolean;
}) {
  const padding = isVertical ? "56px 64px 64px 64px" : "48px 72px 56px 72px";
  const chartW = width - (isVertical ? 128 : 144);
  const chartH = isVertical ? 880 : 460;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: OG_COLORS.bg,
        color: OG_COLORS.textPrimary,
        padding,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          fontFamily: "monospace",
          fontSize: 22,
          letterSpacing: 1.4,
          color: OG_COLORS.textTertiary,
        }}
      >
        <span>{"// MINDSHARE · CROSS-SOURCE ATTENTION"}</span>
        <span>{todayStamp()}</span>
      </div>

      {/* Channel legend — placed right under the header strip so the
          viewer decodes the colour key before scanning the bubbles, and so
          the footer wordmark has the bottom band to itself. The thumbnail-
          readable header already says what this card is, so the wordy
          subhead would only fight for space here. */}
      <div
        style={{
          display: "flex",
          marginTop: 14,
          gap: 24,
          fontFamily: "monospace",
          fontSize: 18,
          color: OG_COLORS.textTertiary,
          letterSpacing: 0.6,
        }}
      >
        {CHANNELS.map((c) => (
          <span
            key={c}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                display: "flex",
                width: 12,
                height: 12,
                borderRadius: 999,
                backgroundColor: CHANNEL_COLORS[c],
              }}
            />
            <span style={{ display: "flex" }}>
              {c === "hn" ? "HN" : c === "devto" ? "dev.to" : c}
            </span>
          </span>
        ))}
      </div>

      {/* Bubble field. Satori doesn't render SVG <text> nodes, so labels
          live as absolutely-positioned divs in the same wrapper rather than
          inside the SVG. The SVG owns geometry (circles + arcs); the JSX
          owns typography. */}
      <div
        style={{
          display: "flex",
          position: "relative",
          marginTop: 24,
          width: chartW,
          height: chartH,
          alignSelf: "center",
        }}
      >
        <svg
          width={chartW}
          height={chartH}
          viewBox={`0 0 ${chartW} ${chartH}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          {rows.map((row) => {
            const arcs = buildChannelArcs(row.pack.cx, row.pack.cy, row.pack.r);
            return (
              <g key={row.id}>
                <circle
                  cx={row.pack.cx}
                  cy={row.pack.cy}
                  r={row.pack.r - 6}
                  fill={OG_COLORS.bgTertiary}
                  stroke={OG_COLORS.border}
                  strokeWidth={1}
                />
                {arcs.map((arc) => (
                  <path
                    key={arc.channel}
                    d={arc.d}
                    fill="none"
                    stroke={
                      row.channels[arc.channel]
                        ? CHANNEL_COLORS[arc.channel]
                        : OG_COLORS.border
                    }
                    strokeWidth={row.channels[arc.channel] ? 6 : 2}
                    strokeLinecap="round"
                    opacity={row.channels[arc.channel] ? 1 : 0.5}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {rows.map((row) => {
          const labelFontSize = Math.max(13, Math.min(22, row.pack.r * 0.32));
          const labelMaxChars = Math.max(
            6,
            Math.floor((row.pack.r * 2) / (labelFontSize * 0.55)),
          );
          // Centre the label box at (cx, cy). Width = full bubble diameter so
          // long names that fit get full bubble width to breathe; truncation
          // handles the overflow case.
          const boxW = row.pack.r * 2;
          const boxH = labelFontSize * 2.5;
          return (
            <div
              key={`label-${row.id}`}
              style={{
                position: "absolute",
                left: row.pack.cx - boxW / 2,
                top: row.pack.cy - boxH / 2,
                width: boxW,
                height: boxH,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: labelFontSize,
                  fontWeight: 600,
                  color: OG_COLORS.textPrimary,
                  textAlign: "center",
                  lineHeight: 1,
                }}
              >
                {truncate(row.shortName, labelMaxChars)}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: Math.max(10, labelFontSize * 0.7),
                  color: OG_COLORS.textTertiary,
                  lineHeight: 1,
                }}
              >
                {row.score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer wordmark + URL */}
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
          <span>TRENDINGREPO</span>
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
          trendingrepo.com/mindshare
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
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const aspect: "h" | "v" =
    searchParams.get("aspect") === "v" ? "v" : "h";
  const format: "png" | "svg" =
    searchParams.get("format") === "svg" ? "svg" : "png";
  const dim = ASPECT_DIMENSIONS[aspect];

  // Reserve room for header + legend + footer when packing — same logic as
  // the on-page render, just with this card's specific chrome height.
  const isVertical = aspect === "v";
  const chartW = dim.width - (isVertical ? 128 : 144);
  const chartH = isVertical ? 880 : 460;

  const repos = getDerivedRepos();
  const selected = selectMindShareRepos(repos);
  const rows = packForRepos(selected, chartW, chartH);

  if (format === "svg") {
    const body = buildSvgDocument(rows, chartW, chartH);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": CACHE_HEADER,
        ...(searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="mindshare-${todayStamp()}.svg"`,
            }
          : {}),
      },
    });
  }

  return new ImageResponse(
    (
      <MindShareCard
        rows={rows}
        width={dim.width}
        height={dim.height}
        isVertical={isVertical}
      />
    ),
    {
      ...dim,
      headers: { "Cache-Control": CACHE_HEADER },
    },
  );
}
