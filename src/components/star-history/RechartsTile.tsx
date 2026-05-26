"use client";

// RechartsTile — production-grade React chart tiles for the star-history
// theme lab. Each `variant` is a hand-crafted Recharts composition with its
// own palette, gradient ramp, grid pattern, stroke treatment, and overlay —
// not the same chart tinted six different ways.
//
// Why Recharts (vs the previous ECharts setup):
//   - Declarative React composition — every <defs>, <linearGradient>,
//     <filter>, and overlay layer is just JSX, so we can give each tile a
//     genuinely distinct look (CRT scanlines, blueprint grid, riso offset,
//     etc.) without fighting an option-object API.
//   - First-class animation primitives (`isAnimationActive`,
//     `animationDuration`, `animationEasing`) feel reactive out of the box.
//   - Tooltip + responsive container handle SSR, resize, and hover for free.
//
// SketchArt (xkcd) keeps its bespoke SVG renderer; the seventh tile in the
// gallery still uses it because rough-line wobble needs feTurbulence, not a
// canvas chart library.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StarActivityPayload } from "@/lib/star-activity";

export type RechartsVariant =
  | "aurora"
  | "parchment"
  | "newsprint"
  | "phosphor"
  | "blueprint"
  | "riso"
  | "aiso";

interface ChartPoint {
  d: string;        // YYYY-MM-DD
  s: number;        // cumulative stars
  delta: number;    // daily gain
  label: string;    // "Apr 24" — pre-formatted for the axis
}

interface RechartsTileProps {
  variant: RechartsVariant;
  payload: StarActivityPayload;
  /** Used as a stable per-instance id so multiple tiles can co-exist on the
   *  same page without their SVG <defs> ids clashing. */
  uid: string;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTickDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const monthIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
  return `${MONTH_ABBR[monthIdx]} ${parseInt(m[3], 10)}`;
}

function fmtStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i += 1) {
    out.push(arr[Math.floor(i * step)]);
  }
  out.push(arr[arr.length - 1]);
  return out;
}

export function RechartsTile({ variant, payload, uid }: RechartsTileProps) {
  // Pre-shape the data once per payload so each variant can read identical
  // points (no skew between tiles).
  const data: ChartPoint[] = useMemo(() => {
    const raw = payload.points.map((p) => ({
      d: p.d,
      s: p.s,
      delta: Math.max(0, p.delta ?? 0),
      label: formatTickDate(p.d),
    }));
    return downsample(raw, 60);
  }, [payload]);

  switch (variant) {
    case "aurora":
      return <AuroraTile data={data} uid={uid} />;
    case "parchment":
      return <ParchmentTile data={data} uid={uid} />;
    case "newsprint":
      return <NewsprintTile data={data} uid={uid} />;
    case "phosphor":
      return <PhosphorTile data={data} uid={uid} />;
    case "blueprint":
      return <BlueprintTile data={data} uid={uid} />;
    case "riso":
      return <RisoTile data={data} uid={uid} />;
    case "aiso":
      return <AisoTile data={data} uid={uid} />;
  }
}

// ============================================================================
// Shared bits
// ============================================================================

interface TileProps {
  data: ChartPoint[];
  uid: string;
}

const COMMON_MARGIN = { top: 14, right: 18, bottom: 0, left: 0 };
const AXIS_LABEL = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 9.5,
};
// Soft-line stroke defaults — pair with `type="monotone"` (monotone cubic
// Hermite) so even the unrendered SVG <path> sub-segments cap and join
// without visible angularity at the start/end of the curve.
const SOFT_STROKE = {
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
} as const;

function ChartTooltip({ active, payload, label, accent, dark = true }: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string;
  accent: string;
  dark?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div
      style={{
        padding: "5px 8px",
        background: dark ? "rgba(8,9,10,0.92)" : "rgba(255,255,255,0.96)",
        border: `1px solid ${accent}`,
        borderRadius: 3,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10.5,
        color: dark ? "#e6e6e6" : "#1a1a1a",
        boxShadow: dark
          ? "0 6px 16px -4px rgba(0,0,0,0.6)"
          : "0 6px 16px -4px rgba(0,0,0,0.15)",
        pointerEvents: "none",
      }}
    >
      <div style={{ color: accent, fontWeight: 600 }}>{label}</div>
      <div>{fmtStars(value)} stars</div>
    </div>
  );
}

// ============================================================================
// AURORA — brand default. Lava orange + cyan accent, gradient area + glow,
// dashed grid, glowing endpoint dot.
// ============================================================================

function AuroraTile({ data, uid }: TileProps) {
  const accent = "#ff6b35";
  const ramp = "#3ad6c5";
  const last = data[data.length - 1];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={COMMON_MARGIN}>
        <defs>
          <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
            <stop offset="60%" stopColor={accent} stopOpacity={0.12} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid stroke="#1a2026" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_LABEL, fill: "#909caa" }}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ ...AXIS_LABEL, fill: "#909caa" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtStars}
          width={42}
        />
        <Tooltip content={<ChartTooltip accent={accent} />} cursor={{ stroke: ramp, strokeWidth: 1, strokeDasharray: "2 4" }} />
        <Area
          type="monotone"
          dataKey="s"
          stroke={accent}
          strokeWidth={2.4}
          {...SOFT_STROKE}
          fill={`url(#${uid}-grad)`}
          fillOpacity={1}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
          filter={`url(#${uid}-glow)`}
          activeDot={{ r: 5, fill: accent, stroke: "#08090a", strokeWidth: 2 }}
        />
        {last ? (
          <Area
            type="monotone"
            dataKey={() => null}
            stroke="none"
            fill="none"
            isAnimationActive={false}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// PARCHMENT — cream paper, single warm ink stroke, soft area wash.
// ============================================================================

function ParchmentTile({ data, uid }: TileProps) {
  const accent = "#c8553d";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={COMMON_MARGIN}>
        <defs>
          <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.32} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#d6d1c4" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_LABEL, fill: "#5a5448" }}
          axisLine={{ stroke: "#a8a293" }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ ...AXIS_LABEL, fill: "#5a5448" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtStars}
          width={42}
        />
        <Tooltip content={<ChartTooltip accent={accent} dark={false} />} cursor={{ stroke: accent, strokeWidth: 1, strokeOpacity: 0.5 }} />
        <Area
          type="monotone"
          dataKey="s"
          stroke={accent}
          strokeWidth={2}
          {...SOFT_STROKE}
          fill={`url(#${uid}-grad)`}
          fillOpacity={1}
          isAnimationActive
          animationDuration={1000}
          animationEasing="ease-out"
          activeDot={{ r: 5, fill: accent, stroke: "#fbf9f4", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// NEWSPRINT — FT.com editorial. Salmon line + dark-teal velocity bars on
// the same chart so the tile reads as "two views, one repo".
// ============================================================================

function NewsprintTile({ data, uid }: TileProps) {
  const accent = "#fa8174"; // FT salmon
  const teal = "#0c3b4c";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={COMMON_MARGIN}>
        <defs>
          <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={teal} stopOpacity={0.55} />
            <stop offset="100%" stopColor={teal} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#d8cfb6" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_LABEL, fill: "#3a3528" }}
          axisLine={{ stroke: "#3a3528", strokeWidth: 0.5 }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          yAxisId="left"
          tick={{ ...AXIS_LABEL, fill: "#3a3528" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtStars}
          width={42}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={false}
          axisLine={false}
          tickLine={false}
          width={0}
        />
        <Tooltip content={<ChartTooltip accent={accent} dark={false} />} cursor={{ stroke: teal, strokeWidth: 1, strokeOpacity: 0.4 }} />
        <Bar
          yAxisId="right"
          dataKey="delta"
          fill={`url(#${uid}-bar)`}
          isAnimationActive
          animationDuration={800}
          radius={[2, 2, 0, 0]}
          barSize={4}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="s"
          stroke={accent}
          strokeWidth={2.4}
          {...SOFT_STROKE}
          dot={false}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease-out"
          activeDot={{ r: 5, fill: accent, stroke: "#f4ecdc", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// PHOSPHOR — CRT green phosphor, scanline overlay, glowing stroke.
// ============================================================================

function PhosphorTile({ data, uid }: TileProps) {
  const accent = "#3aff8a";
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={COMMON_MARGIN}>
          <defs>
            <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b1" />
              <feMerge>
                <feMergeNode in="b1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid stroke="#0c3a1f" strokeDasharray="1 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ ...AXIS_LABEL, fill: "#5fe09a" }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ ...AXIS_LABEL, fill: "#5fe09a" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtStars}
            width={42}
          />
          <Tooltip content={<ChartTooltip accent={accent} />} cursor={{ stroke: accent, strokeWidth: 1, strokeOpacity: 0.5 }} />
          <Area
            type="monotone"
            dataKey="s"
            stroke={accent}
            strokeWidth={2}
            {...SOFT_STROKE}
            fill={`url(#${uid}-grad)`}
            fillOpacity={1}
            isAnimationActive
            animationDuration={1000}
            animationEasing="ease-in-out"
            filter={`url(#${uid}-glow)`}
            activeDot={{ r: 5, fill: accent, stroke: "#021b0e", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Pure-CSS scanline overlay — sits above the chart but stays
       *  click-through so the tooltip still triggers. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "repeating-linear-gradient(to bottom, rgba(58,255,138,0.05) 0 1px, transparent 1px 2px)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

// ============================================================================
// BLUEPRINT — drafting paper grid (both axes), cyan stroke, technical feel.
// ============================================================================

function BlueprintTile({ data, uid }: TileProps) {
  const accent = "#4a9eff";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={COMMON_MARGIN}>
        <defs>
          <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
          <pattern
            id={`${uid}-bp`}
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#1a3a78"
              strokeWidth="0.5"
              opacity="0.7"
            />
          </pattern>
        </defs>
        {/* Full-bleed blueprint grid via a pattern fill rectangle */}
        <rect width="100%" height="100%" fill={`url(#${uid}-bp)`} />
        <CartesianGrid stroke="#2a5dab" strokeDasharray="0" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_LABEL, fill: "#8ec0ff" }}
          axisLine={{ stroke: "#4a9eff", strokeOpacity: 0.5 }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ ...AXIS_LABEL, fill: "#8ec0ff" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtStars}
          width={42}
        />
        <Tooltip content={<ChartTooltip accent={accent} />} cursor={{ stroke: accent, strokeWidth: 1, strokeDasharray: "3 3" }} />
        <Area
          type="monotone"
          dataKey="s"
          stroke={accent}
          strokeWidth={2.4}
          {...SOFT_STROKE}
          fill={`url(#${uid}-grad)`}
          fillOpacity={1}
          isAnimationActive
          animationDuration={900}
          dot={{ r: 0 }}
          activeDot={{ r: 6, fill: "#0b1638", stroke: accent, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// RISO — risograph print. Two-tone: an offset background stroke (indigo) +
// the lead orange filled line. Reads like a screen-printed poster.
// ============================================================================

function RisoTile({ data, uid }: TileProps) {
  const accent = "#ff4d17";
  const indigo = "#2d3782";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={COMMON_MARGIN}>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.12} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#d4c4a8" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ ...AXIS_LABEL, fill: "#2d3782" }}
          axisLine={{ stroke: "#2d3782", strokeWidth: 0.6 }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ ...AXIS_LABEL, fill: "#2d3782" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtStars}
          width={42}
        />
        <Tooltip content={<ChartTooltip accent={accent} dark={false} />} cursor={{ stroke: indigo, strokeWidth: 1, strokeOpacity: 0.4 }} />
        {/* Offset background line — gives the risograph "second pass" feel */}
        <Line
          type="monotone"
          dataKey="s"
          stroke={indigo}
          strokeWidth={3}
          strokeOpacity={0.7}
          {...SOFT_STROKE}
          dot={false}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="s"
          stroke={accent}
          strokeWidth={2.4}
          {...SOFT_STROKE}
          fill={`url(#${uid}-fill)`}
          fillOpacity={1}
          isAnimationActive
          animationDuration={1000}
          animationEasing="ease-out"
          activeDot={{ r: 6, fill: accent, stroke: "#f1e6d5", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// AISO — sister-product theme from aiso.tools. Bold purple void + emerald
// chart line + white type, modeled on the "CONSENSUS PICKS" / "STARS TODAY"
// KPI cards on the aiso.tools dashboard. No orange — the brand identity for
// AISO leans on the purple/green pair so the chart reads as an AISO embed.
// ============================================================================

function AisoTile({ data, uid }: TileProps) {
  // Purple LINE on dark void — emerald kept only as the endpoint ring so
  // the "up" status colour from the AISO hero card still has a home.
  const line = "#a78bfa";          // royal violet — the chart stroke
  const lineSoft = "#c4b5fd";      // lighter violet — area-fill top stop
  const purpleDeep = "#7c3aed";    // deeper purple — area mid-stop
  const emeraldDot = "#34d399";    // emerald — endpoint dot ring only
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // Dark void canvas with a soft purple glow at the top-left + an
        // emerald wash at the bottom-right — the purple stays an ACCENT,
        // not the entire panel (operator decree: "elements supposed to be
        // purple, not the WHOLE background"). Same dark-card feel as the
        // other dark themes.
        background:
          "radial-gradient(110% 70% at 0% 0%, rgba(167,139,250,0.22), transparent 55%), radial-gradient(100% 80% at 100% 100%, rgba(124,58,237,0.18), transparent 60%), #0c0b18",
      }}
    >
      {/* Starfield dot grid — pure SVG <pattern>, sits behind the chart and
       *  stays click-through. Same vibe as the dotted page background on
       *  aiso.tools. */}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={COMMON_MARGIN}>
          <defs>
            {/* Violet gradient under the line — lighter at the top, deeper
             *  mid, fading to transparent at the baseline. Single-hue ramp
             *  in the purple family so the area reads as one wash, not a
             *  two-colour stack. */}
            <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineSoft} stopOpacity={0.45} />
              <stop offset="55%" stopColor={purpleDeep} stopOpacity={0.20} />
              <stop offset="100%" stopColor={line} stopOpacity={0.0} />
            </linearGradient>
            <filter
              id={`${uid}-glow`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid
            stroke={line}
            strokeOpacity={0.18}
            strokeDasharray="2 6"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ ...AXIS_LABEL, fill: "#c4b5fd" }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ ...AXIS_LABEL, fill: "#c4b5fd" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtStars}
            width={42}
          />
          <Tooltip
            content={<ChartTooltip accent={line} />}
            cursor={{
              stroke: lineSoft,
              strokeWidth: 1,
              strokeDasharray: "2 4",
              opacity: 0.7,
            }}
          />
          <Area
            type="monotone"
            dataKey="s"
            stroke={line}
            strokeWidth={2.6}
            {...SOFT_STROKE}
            fill={`url(#${uid}-grad)`}
            fillOpacity={1}
            isAnimationActive
            animationDuration={1000}
            animationEasing="ease-out"
            filter={`url(#${uid}-glow)`}
            // Emerald ring on the endpoint dot — the only remaining green
            // touch, ties back to the "up trend" pip from the AISO hero
            // card without flooding the chart with green.
            activeDot={{
              r: 6,
              fill: line,
              stroke: emeraldDot,
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
