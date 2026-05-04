// TrendingRepo — /mindshare
//
// Cross-source attention map. Each bubble is one repo; size = crossSignalScore
// (sum of GitHub + Reddit + HN + Bluesky + dev.to firing components, range
// 0-5); the bubble's circumference is split into 5 arc segments — one per
// channel — lit when that channel is currently firing. Reads at a glance as
// "who is getting talked about, and where."
//
// Distinct from the homepage BubbleMap: that map sizes by raw star delta and
// colors by category. This map sizes by attention spread and colors by source.
//
// v1 scope: server-rendered SVG only — no physics, no time-window cycle, no
// hover tooltip beyond <title>. Add interactivity once we see signal.

import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
import { packBubbles, type PackInput, type PackResult } from "@/lib/bubble-pack";
import {
  SITE_NAME,
  absoluteUrl,
  OG_COLORS,
} from "@/lib/seo";
import { ShareBar } from "@/components/share/ShareBar";
import type { Repo } from "@/lib/types";

// 30-min ISR — same cadence as homepage; underlying derived-repos changes
// only when the cron commits fresh data, so a tighter cache wastes bandwidth.
export const revalidate = 1800;

const TITLE = `MindShare — ${SITE_NAME}`;
const DESCRIPTION =
  "Who's getting talked about, and where. Cross-source attention map across GitHub, Reddit, Hacker News, Bluesky, and dev.to.";

const OG_IMAGE = absoluteUrl("/api/og/mindshare");

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/mindshare") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/mindshare"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: "TrendingRepo MindShare — cross-source attention map",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 600;
const MIN_RADIUS = 20;
const MAX_RADIUS = 80;
const PACK_LIMIT = 60;

// Per-channel color tokens. Operator-terminal palette — high contrast on
// the dark background, deliberately distinct from CATEGORIES so a viewer
// flipping between BubbleMap and MindShare sees a different visual logic.
const CHANNEL_COLORS = {
  github: "#e5e7eb",   // bone white
  reddit: "#ff4500",   // canonical Reddit orange
  hn: "#f59e0b",       // canonical HN amber
  bluesky: "#3b82f6",  // canonical Bluesky blue
  devto: "#22c55e",    // dev.to green-mark
} as const;

const CHANNELS = ["github", "reddit", "hn", "bluesky", "devto"] as const;
type Channel = (typeof CHANNELS)[number];

interface BubbleRow {
  id: string;
  fullName: string;
  shortName: string;
  score: number;
  channels: Record<Channel, boolean>;
  pack: PackResult;
}

function selectMindShareRepos(repos: Repo[]): Repo[] {
  // Need at least 2 channels firing to count as cross-source attention —
  // a single channel is just that channel's noise, not mindshare.
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

function packForRepos(repos: Repo[]): BubbleRow[] {
  const inputs: PackInput[] = repos.map((r) => ({
    id: r.fullName,
    // Pack weight is non-linear in score — squaring spreads the top-of-list
    // visually so a 4.5 score reads ~2.5× a 2.0 score, instead of a flat
    // proportional pack where a 4.5 vs 2.0 is barely noticeable on screen.
    value: Math.max(0.1, (r.crossSignalScore ?? 0)) ** 2,
  }));
  const placed = packBubbles(inputs, {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    minRadius: MIN_RADIUS,
    maxRadius: MAX_RADIUS,
    padding: 4,
    fillRatio: 0.7,
    edgeMargin: 4,
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
    };
    rows.push({
      id: r.fullName,
      fullName: r.fullName,
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

/**
 * Build 5 arc-segment paths along the bubble perimeter. Each arc spans
 * 72° with a 4° gap between neighbours so the segments read as five
 * distinct lights rather than one continuous ring. Returned in render
 * order (top → clockwise).
 */
function buildChannelArcs(cx: number, cy: number, r: number): ArcSegment[] {
  const GAP = 0.07; // radians (~4°)
  const STEP = (Math.PI * 2) / CHANNELS.length;
  // Start at 12 o'clock so the bubble feels "balanced" rather than tilted.
  const START = -Math.PI / 2;
  const out: ArcSegment[] = [];
  for (let i = 0; i < CHANNELS.length; i++) {
    const a0 = START + STEP * i + GAP / 2;
    const a1 = START + STEP * (i + 1) - GAP / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    // largeArcFlag=0 because each arc is < 180°; sweepFlag=1 for clockwise.
    const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    out.push({ d, channel: CHANNELS[i] });
  }
  return out;
}

function fmtScore(s: number): string {
  return s.toFixed(2);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + "…";
}

export default function MindSharePage() {
  const repos = getDerivedRepos();
  const selected = selectMindShareRepos(repos);
  const rows = packForRepos(selected);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-4">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {"// MINDSHARE · CROSS-SOURCE ATTENTION"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-3xl">
          Who&rsquo;s getting talked about, and where. Bubble size = total
          channels firing × strength. Each bubble splits into five arcs:
          GitHub · Reddit · Hacker News · Bluesky · dev.to. Lit arcs = active
          chatter on that channel right now.
        </p>
      </header>

      <ChannelLegend />

      <div className="rounded-card border border-border-primary bg-bg-secondary p-2 sm:p-3">
        <div className="overflow-hidden">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            className="block w-full h-auto"
            aria-label="MindShare cross-source attention map"
          >
            <rect
              x={0}
              y={0}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              fill={OG_COLORS.bg}
            />
            {rows.map((row) => (
              <BubbleSvg key={row.id} row={row} />
            ))}
          </svg>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="mt-6 rounded-card border border-border-primary bg-bg-secondary px-4 py-6 text-sm text-text-tertiary text-center font-mono">
          {"// no repos firing on 2+ channels right now — check back after the next scrape"}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          {/* ShareBar wired with the top repo IDs so Copy Link / Share-on-X
              carry the exact set captured in the bubble field. CSV omitted
              for the v1 — there's no per-day series here, just current
              snapshot scores; the markdown / iframe / PNG / SVG embeds
              are the meaningful share surfaces. */}
          <ShareBar
            state={{
              repos: rows.slice(0, 4).map((r) => r.fullName),
              mode: "date",
              scale: "lin",
              legend: "tr",
            }}
            pagePath="/mindshare"
            imageEndpoint="/api/og/mindshare"
            hideCsv
          />
        </div>
      )}
    </main>
  );
}

function ChannelLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
      {CHANNELS.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHANNEL_COLORS[c] }}
          />
          <span>{c === "hn" ? "Hacker News" : c === "devto" ? "dev.to" : c}</span>
        </span>
      ))}
    </div>
  );
}

function BubbleSvg({ row }: { row: BubbleRow }) {
  const { pack, channels, fullName, shortName, score } = row;
  const arcs = buildChannelArcs(pack.cx, pack.cy, pack.r);
  const labelFontSize = Math.max(11, Math.min(18, pack.r * 0.32));
  const scoreFontSize = Math.max(10, Math.min(14, pack.r * 0.22));
  const labelMaxChars = Math.max(6, Math.floor((pack.r * 2) / (labelFontSize * 0.55)));

  return (
    <g>
      <title>{`${fullName}\nscore ${fmtScore(score)} · ${
        Object.values(channels).filter(Boolean).length
      }/5 channels firing`}</title>
      {/* Inner disk — neutral so arc colors carry the channel identity */}
      <circle
        cx={pack.cx}
        cy={pack.cy}
        r={pack.r - 6}
        fill={OG_COLORS.bgTertiary}
        stroke={OG_COLORS.border}
        strokeWidth={1}
      />
      {/* Five arc segments. Strokes only — the inner fill is the neutral disk above */}
      {arcs.map((arc) => (
        <path
          key={arc.channel}
          d={arc.d}
          fill="none"
          stroke={
            channels[arc.channel] ? CHANNEL_COLORS[arc.channel] : OG_COLORS.border
          }
          strokeWidth={channels[arc.channel] ? 5 : 2}
          strokeLinecap="round"
          opacity={channels[arc.channel] ? 1 : 0.5}
        />
      ))}
      {/* Label */}
      <text
        x={pack.cx}
        y={pack.cy - labelFontSize * 0.15}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={labelFontSize}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fill={OG_COLORS.textPrimary}
        style={{ fontWeight: 600 }}
      >
        {truncate(shortName, labelMaxChars)}
      </text>
      <text
        x={pack.cx}
        y={pack.cy + labelFontSize * 1.05}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={scoreFontSize}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fill={OG_COLORS.textTertiary}
      >
        {fmtScore(score)}
      </text>
    </g>
  );
}

