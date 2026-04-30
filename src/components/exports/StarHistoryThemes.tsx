// V4 — StarHistoryThemes
//
// Three SSR-rendered SVG export themes for the multi-repo star-history
// chart, mirroring star-history-themes.html:
//
//   1. Blueprint — cream paper, dashed grid, Fraunces serif, 5 muted
//      print inks
//   2. Neon — synthwave dark, magenta + cyan glow, Space Grotesk display
//   3. Editorial — broadsheet white, italic Georgia headline, restrained
//      red dot accent, step-line chart in editorial inks
//
// Each theme is a named export. They share the same input shape so the
// caller can swap themes without restructuring data.
//
// Caller responsibility: pass exactly the series + window the chart
// should render. Themes do NOT compute series — they render. The /tools/
// star-history route owns data fetching and produces these <svg> trees,
// which the @vercel/og PNG pipeline can rasterize on the edge.

import type { ReactNode } from "react";

export interface StarHistorySeries {
  /** Repo full name e.g. "anthropic/claude-code". */
  name: string;
  /** Cumulative star totals over the window — N evenly-spaced points. */
  data: number[];
}

export interface StarHistoryThemeProps {
  /** Three to seven series; mockup-canonical is 5. */
  series: StarHistorySeries[];
  /** Headline rendered inside the theme card. */
  headline?: ReactNode;
  /** Optional sub-deck below the headline. */
  deck?: ReactNode;
  /** Optional eyebrow / kicker text. */
  eyebrow?: ReactNode;
  /** Window label e.g. "90-day window". */
  windowLabel?: string;
  /** Total cumulative stars across all series. */
  totalLabel?: string;
  /** Output viewBox dimensions (default 1080×700). */
  width?: number;
  height?: number;
}

const DEFAULT_W = 1080;
const DEFAULT_H = 700;

// ---------------------------------------------------------------------------
// Shared chart geometry helpers
// ---------------------------------------------------------------------------

interface SeriesPath {
  name: string;
  data: number[];
  /** Final-point cumulative value — used for end-of-line label. */
  end: number;
  /** Pre-computed SVG `d` for the line. */
  d: string;
  /** End-point x/y coordinates so callers can label the tip. */
  ex: number;
  ey: number;
}

function buildSeries(
  series: StarHistorySeries[],
  bounds: { x0: number; y0: number; w: number; h: number },
): { paths: SeriesPath[]; max: number; min: number } {
  const allValues = series.flatMap((s) => s.data);
  const max = allValues.length > 0 ? Math.max(...allValues) * 1.04 : 1;
  const min = allValues.length > 0 ? Math.min(...allValues) * 0.96 : 0;
  const span = max - min || 1;
  const N = series[0]?.data.length ?? 0;
  const paths: SeriesPath[] = series.map((s) => {
    let d = "";
    let ex = 0;
    let ey = 0;
    for (let i = 0; i < s.data.length; i++) {
      const x = bounds.x0 + (i / Math.max(1, N - 1)) * bounds.w;
      const y = bounds.y0 + bounds.h - ((s.data[i] - min) / span) * bounds.h;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
      ex = x;
      ey = y;
    }
    return {
      name: s.name,
      data: s.data,
      end: s.data[s.data.length - 1] ?? 0,
      d,
      ex,
      ey,
    };
  });
  return { paths, max, min };
}

// ---------------------------------------------------------------------------
// 1. Blueprint
// ---------------------------------------------------------------------------

const BLUEPRINT_INKS = [
  "#c1272d",
  "#1a4d8a",
  "#3a7d2b",
  "#7a4a1c",
  "#5a3a78",
  "#1a1612",
  "#5b4a30",
];

export function StarHistoryBlueprint({
  series,
  headline = "The five repos everyone is starring.",
  deck = "90-day window · cumulative stars · 5 repos",
  eyebrow = "FIG. 04 · STAR TRAJECTORY",
  totalLabel,
  width = DEFAULT_W,
  height = DEFAULT_H,
}: StarHistoryThemeProps) {
  const PAD = { l: 80, r: 130, t: 110, b: 70 };
  const x0 = PAD.l;
  const y0 = PAD.t;
  const w = width - PAD.l - PAD.r;
  const h = height - PAD.t - PAD.b;
  const { paths, max, min } = buildSeries(series, { x0, y0, w, h });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        background: "#f5f0e6",
        fontFamily: "'Fraunces', Georgia, serif",
        color: "#1a1612",
      }}
    >
      {/* Paper frame */}
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        fill="#f5f0e6"
        stroke="#c9b893"
        strokeWidth="1"
      />
      {/* Eyebrow */}
      <text
        x={PAD.l}
        y={50}
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="14"
        letterSpacing="0.22em"
        fill="#5b4a30"
      >
        {eyebrow}
      </text>
      {/* Headline */}
      <text
        x={PAD.l}
        y={88}
        fontFamily="'Fraunces', Georgia, serif"
        fontStyle="italic"
        fontSize="38"
        fill="#1a1612"
      >
        {headline}
      </text>
      {/* Total */}
      {totalLabel ? (
        <text
          x={width - PAD.r}
          y={50}
          textAnchor="start"
          fontFamily="'Fraunces', Georgia, serif"
          fontSize="22"
          fontWeight="700"
        >
          {totalLabel}
        </text>
      ) : null}
      {/* Dashed grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line
          key={i}
          x1={x0}
          x2={x0 + w}
          y1={y0 + t * h}
          y2={y0 + t * h}
          stroke="rgba(26,22,18,0.10)"
          strokeDasharray="2 4"
        />
      ))}
      {/* Series */}
      {paths.map((p, i) => {
        const ink = BLUEPRINT_INKS[i % BLUEPRINT_INKS.length];
        return (
          <g key={p.name}>
            <path d={p.d} fill="none" stroke={ink} strokeWidth="1.6" />
            <circle cx={p.ex} cy={p.ey} r="3" fill={ink} />
            <text
              x={p.ex + 8}
              y={p.ey + 4}
              fontFamily="'Space Grotesk', sans-serif"
              fontSize="11"
              fontWeight="700"
              fill={ink}
              letterSpacing="0.04em"
            >
              {p.name}
            </text>
          </g>
        );
      })}
      {/* Deck */}
      {deck ? (
        <text
          x={PAD.l}
          y={height - 24}
          fontFamily="'Space Grotesk', sans-serif"
          fontSize="11"
          letterSpacing="0.16em"
          fill="#5b4a30"
          >
          {deck}
        </text>
      ) : null}
      {/* Range tag */}
      <text x="0" y="0" fontSize="0" fill="transparent">
        {`${min.toFixed(0)}-${max.toFixed(0)}`}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Neon
// ---------------------------------------------------------------------------

const NEON_INKS = ["#ff3df8", "#00ebff", "#3aff8a", "#ffd24d", "#be50ff", "#7dd3fc", "#ff7a3d"];

export function StarHistoryNeon({
  series,
  headline,
  eyebrow = "// STAR TRAJECTORY · 90D",
  totalLabel,
  width = DEFAULT_W,
  height = DEFAULT_H,
}: StarHistoryThemeProps) {
  const PAD = { l: 70, r: 130, t: 130, b: 70 };
  const x0 = PAD.l;
  const y0 = PAD.t;
  const w = width - PAD.l - PAD.r;
  const h = height - PAD.t - PAD.b;
  const { paths } = buildSeries(series, { x0, y0, w, h });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: "#06030c" }}
    >
      <defs>
        <radialGradient id="neon-glow-magenta" cx="80%" cy="20%" r="60%">
          <stop offset="0%" stopColor="rgba(190,80,255,0.18)" />
          <stop offset="100%" stopColor="rgba(190,80,255,0)" />
        </radialGradient>
        <radialGradient id="neon-glow-cyan" cx="10%" cy="90%" r="50%">
          <stop offset="0%" stopColor="rgba(0,235,255,0.14)" />
          <stop offset="100%" stopColor="rgba(0,235,255,0)" />
        </radialGradient>
        <pattern id="neon-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path
            d="M 36 0 L 0 0 0 36"
            fill="none"
            stroke="rgba(190,80,255,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width={width} height={height} fill="url(#neon-grid)" />
      <rect width={width} height={height} fill="url(#neon-glow-magenta)" />
      <rect width={width} height={height} fill="url(#neon-glow-cyan)" />

      {/* Eyebrow */}
      <text
        x={PAD.l}
        y={70}
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="13"
        letterSpacing="0.30em"
        fill="#be50ff"
      >
        {eyebrow}
      </text>
      {/* Headline */}
      {headline ? (
        <text
          x={PAD.l}
          y={108}
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="700"
          fontSize="42"
          fill="#fff"
          letterSpacing="-0.022em"
        >
          {headline}
        </text>
      ) : null}
      {/* Total */}
      {totalLabel ? (
        <text
          x={width - PAD.r + 100}
          y={108}
          textAnchor="end"
          fontFamily="'JetBrains Mono', monospace"
          fontSize="24"
          fontWeight="700"
          fill="#00ebff"
          letterSpacing="0.02em"
        >
          {totalLabel}
        </text>
      ) : null}

      {/* Series with halo */}
      {paths.map((p, i) => {
        const ink = NEON_INKS[i % NEON_INKS.length];
        return (
          <g key={p.name}>
            <path d={p.d} fill="none" stroke={ink} strokeWidth="6" opacity="0.20" />
            <path d={p.d} fill="none" stroke={ink} strokeWidth="2" opacity="0.95" />
            <circle cx={p.ex} cy={p.ey} r="6" fill={ink} opacity="0.25" />
            <circle cx={p.ex} cy={p.ey} r="3" fill={ink} />
            <text
              x={p.ex + 10}
              y={p.ey + 4}
              fontFamily="'Space Grotesk', sans-serif"
              fontSize="11"
              fontWeight="700"
              fill={ink}
              letterSpacing="0.04em"
            >
              {p.name.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Foot */}
      <text
        x={PAD.l}
        y={height - 36}
        fontFamily="'JetBrains Mono', monospace"
        fontSize="10"
        letterSpacing="0.20em"
        fill="#7a6db5"
      >
        {`// TRENDINGREPO.COM/STAR-HISTORY`}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 3. Editorial
// ---------------------------------------------------------------------------

const EDITORIAL_INKS = [
  { ink: "#1a1a1a", width: 2.4, dash: "" },
  { ink: "#c1272d", width: 2.0, dash: "" },
  { ink: "#3a3a3a", width: 1.5, dash: "4 3" },
  { ink: "#7a4a1c", width: 1.5, dash: "2 2" },
  { ink: "#5a5a55", width: 1.2, dash: "6 4" },
];

export function StarHistoryEditorial({
  series,
  headline,
  deck,
  eyebrow = "THE CORPUS",
  totalLabel,
  width = DEFAULT_W,
  height = DEFAULT_H,
}: StarHistoryThemeProps) {
  const PAD = { l: 80, r: 160, t: 180, b: 80 };
  const x0 = PAD.l;
  const y0 = PAD.t;
  const w = width - PAD.l - PAD.r;
  const h = height - PAD.t - PAD.b;
  const { paths } = buildSeries(series, { x0, y0, w, h });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        background: "#fafaf7",
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: "#1a1a1a",
      }}
    >
      {/* Triple-rule kicker */}
      <line x1={PAD.l} x2={width - PAD.r} y1={56} y2={56} stroke="#1a1a1a" strokeWidth="6" />
      <line x1={PAD.l} x2={width - PAD.r} y1={50} y2={50} stroke="#1a1a1a" strokeWidth="1" />
      <line x1={PAD.l} x2={width - PAD.r} y1={66} y2={66} stroke="#1a1a1a" strokeWidth="1" />

      {/* Kicker */}
      <text
        x={PAD.l}
        y={92}
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="11"
        letterSpacing="0.30em"
        fontWeight="700"
        fill="#1a1a1a"
      >
        {eyebrow}
      </text>
      <circle cx={PAD.l + 110} cy={88} r="3" fill="#c1272d" />
      <text x={PAD.l + 124} y={92} fontFamily="'Space Grotesk', sans-serif" fontSize="11" letterSpacing="0.18em" fill="#1a1a1a">
        VOL. 04 · ISSUE 12
      </text>

      {/* Headline */}
      {headline ? (
        <text
          x={PAD.l}
          y={140}
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="38"
          fill="#1a1a1a"
        >
          {headline}
        </text>
      ) : null}

      {/* Deck */}
      {deck ? (
        <text
          x={PAD.l}
          y={170}
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="13"
          fill="#5a5a55"
        >
          {deck}
        </text>
      ) : null}

      {/* Total — top right */}
      {totalLabel ? (
        <text
          x={width - PAD.r + 100}
          y={140}
          textAnchor="end"
          fontFamily="Georgia, serif"
          fontWeight="700"
          fontSize="22"
          fill="#1a1a1a"
        >
          {totalLabel}
        </text>
      ) : null}

      {/* Baseline */}
      <line x1={x0} x2={x0 + w} y1={y0 + h} y2={y0 + h} stroke="#1a1a1a" strokeWidth="1" />

      {/* Series — restrained editorial inks */}
      {paths.map((p, i) => {
        const style = EDITORIAL_INKS[i % EDITORIAL_INKS.length];
        return (
          <g key={p.name}>
            <path
              d={p.d}
              fill="none"
              stroke={style.ink}
              strokeWidth={style.width}
              {...(style.dash ? { strokeDasharray: style.dash } : {})}
            />
            <circle cx={p.ex} cy={p.ey} r="3" fill={style.ink} />
            <text
              x={p.ex + 10}
              y={p.ey - 2}
              fontFamily="Georgia, serif"
              fontStyle="italic"
              fontSize="12"
              fill={style.ink}
            >
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Convenience: theme map for callers that pick at runtime.
// ---------------------------------------------------------------------------

export const STAR_HISTORY_THEMES = {
  blueprint: StarHistoryBlueprint,
  neon: StarHistoryNeon,
  editorial: StarHistoryEditorial,
} as const;

export type StarHistoryThemeKey = keyof typeof STAR_HISTORY_THEMES;
