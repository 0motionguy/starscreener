"use client";

// CandlestickChart — OHLC candles in the Aurora look.
//
// bklit-ui's candlestick recipe (github.com/bklit/bklit-ui — shadcn-style
// copy-paste Recharts charts) adopted into the codebase per operator decree
// and re-themed to the AURORA tokens instead of its stock Tailwind palette.
// Same construction as upstream: a recharts ComposedChart where each candle
// is a range Bar spanning [low, high], drawn by a custom shape that paints
// the wick + body from the row's open/close.
//
// Honest-data contract: the caller passes real OHLC rows; nothing here
// interpolates or synthesizes. Empty data renders nothing.
//
// Server-component friendly: every prop is serializable (no function props
// required), so async RSC panels can embed it directly.
//
// Role note (operator steer 2026-07-06): *stock* surfaces render via
// TradingViewCandles (lightweight-charts) instead — keep this recharts
// primitive for static/OG output and non-stock OHLC series.

import { memo, useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AURORA, compactNumber, shortDate } from "./AuroraChart";

export interface CandlePoint {
  /** ISO day "YYYY-MM-DD" (or any short x label). */
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlestickChartProps {
  data: CandlePoint[];
  height?: number | string;
  /** Prepended to y-axis ticks + tooltip values, e.g. "$". Serializable
   *  alternative to a formatter fn so RSC parents can pass it. */
  yPrefix?: string;
  /** Skip animation entirely — static print/OG renders. */
  freeze?: boolean;
  /** Accessibility label on the wrapping div. */
  ariaLabel?: string;
}

const AXIS_TICK = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 10,
  fill: AURORA.inkMuted,
};

function formatTick(v: number, prefix: string): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000) return `${prefix}${compactNumber(v)}`;
  if (Math.abs(v) >= 100) return `${prefix}${Math.round(v)}`;
  return `${prefix}${v.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Candle shape — recharts hands us the pixel box of the [low, high] range
// bar; we re-derive px positions for the body from the row's open/close.
// ---------------------------------------------------------------------------

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandlePoint;
}

// recharts v3 types the functional `shape` as `(props: unknown) => Element`,
// so accept unknown and narrow to the fields Bar actually passes.
function CandleShape(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } =
    (props ?? {}) as CandleShapeProps;
  if (!payload || width <= 0) return <g />;
  const { open, close, high, low } = payload;
  const up = close >= open;
  const color = up ? AURORA.up : AURORA.down;
  const cx = x + width / 2;
  const span = high - low;

  // Flat session (high === low) — a single tick mark, no fabricated body.
  if (!Number.isFinite(span) || span <= 0 || height <= 0) {
    return (
      <line
        x1={x + width * 0.15}
        x2={x + width * 0.85}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={1.2}
      />
    );
  }

  const pxPerUnit = height / span;
  const bodyTopVal = Math.max(open, close);
  const bodyBotVal = Math.min(open, close);
  const bodyY = y + (high - bodyTopVal) * pxPerUnit;
  const bodyH = Math.max(1, (bodyTopVal - bodyBotVal) * pxPerUnit);
  const bodyW = Math.max(2, Math.min(9, width * 0.62));

  return (
    <g>
      {/* wick: full low→high extent */}
      <line
        x1={cx}
        x2={cx}
        y1={y}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
        strokeLinecap="round"
      />
      {/* body: open↔close */}
      <rect
        x={cx - bodyW / 2}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        fill={color}
        fillOpacity={up ? 0.85 : 0.95}
        rx={1}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Tooltip — same visual DNA as AuroraTooltip, specialized to O/H/L/C rows.
// ---------------------------------------------------------------------------

interface CandleTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload?: CandlePoint }>;
  yPrefix: string;
}

function CandleTooltip({ active, label, payload, yPrefix }: CandleTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const deltaPct = row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0;
  const up = row.close >= row.open;
  const lines: Array<[string, number]> = [
    ["open", row.open],
    ["high", row.high],
    ["low", row.low],
    ["close", row.close],
  ];
  return (
    <div
      style={{
        padding: "6px 10px",
        background: "rgba(8,9,10,0.94)",
        border: `1px solid ${AURORA.lead}`,
        borderRadius: 4,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        color: AURORA.ink,
        boxShadow: "0 8px 22px -6px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      <div style={{ color: AURORA.lead, fontWeight: 600, marginBottom: 2 }}>
        {typeof label === "string" ? shortDate(label) : String(label ?? "")}
        <span
          style={{
            marginLeft: 8,
            color: up ? AURORA.up : AURORA.down,
            fontWeight: 700,
          }}
        >
          {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(2)}%
        </span>
      </div>
      {lines.map(([name, v]) => (
        <div key={name} style={{ display: "flex", gap: 10 }}>
          <span style={{ color: AURORA.inkMuted, width: 34 }}>{name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {formatTick(v, yPrefix)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart body
// ---------------------------------------------------------------------------

interface CandleRow extends CandlePoint {
  range: [number, number];
}

function CandlestickChartImpl({
  data,
  height = 160,
  yPrefix = "",
  freeze = false,
  ariaLabel,
}: CandlestickChartProps) {
  const rows = useMemo<CandleRow[]>(
    () => data.map((d) => ({ ...d, range: [d.low, d.high] })),
    [data],
  );
  if (rows.length === 0) return null;

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={AURORA.grid} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="day"
            tick={AXIS_TICK}
            axisLine={{ stroke: AURORA.grid }}
            tickLine={false}
            minTickGap={28}
            tickFormatter={shortDate}
          />
          <YAxis
            domain={[
              (dataMin: number) => dataMin - Math.abs(dataMin) * 0.005,
              (dataMax: number) => dataMax + Math.abs(dataMax) * 0.005,
            ]}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatTick(v, yPrefix)}
            width={46}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,107,53,0.06)" }}
            content={(props) => (
              <CandleTooltip
                {...(props as unknown as Omit<CandleTooltipProps, "yPrefix">)}
                yPrefix={yPrefix}
              />
            )}
          />
          <Bar
            dataKey="range"
            shape={CandleShape}
            maxBarSize={12}
            isAnimationActive={!freeze}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Memoized like AuroraChart — recharts mounts are ~150-200ms; don't pay it
// on parent re-renders (tab switches, sort, filter).
export const CandlestickChart = memo(CandlestickChartImpl);
