"use client";

// AuroraChart — the unified Recharts primitive every non-themed chart on the
// site uses. One look, applied everywhere: dark canvas, lava-orange lead,
// monotone-smooth curve, soft gradient area, dashed grid, glowing endpoint
// dot, soft rounded stroke. Operator decree 2026-05-24: "for compare use the
// theme picker, for the rest use ONE style".
//
// Five rendering shapes share the same DNA — pick via the `variant` prop:
//   • area        — single area line (the default; star-history, capital flow)
//   • dualArea    — primary area + secondary line on a 2nd y-axis (npm overlay)
//   • bars        — vertical bars with rounded tops (mention volume, daily Δ)
//   • stacked     — multi-series stacked area (sources × time)
//   • stackedBars — multi-series stacked column chart (model share by week)
//   • sparkline   — tiny inline area, no axes, no grid (table cells)
//
// Use it like a styled component: pass `data` (an array of points), `series`
// (one or more `{ dataKey, color?, name? }`), and optional formatters. Aurora
// defaults paint themselves; per-series colour overrides only kick in if the
// caller really needs to deviate.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ---------------------------------------------------------------------------
// Aurora design tokens — one source of truth so every chart looks identical.
// ---------------------------------------------------------------------------

export const AURORA = {
  lead: "#ff6b35",          // lava orange — primary line + endpoint dot
  leadSoft: "#ffa17a",      // washed orange — area top stop
  secondary: "#3ad6c5",     // cyan — second series / dual-axis line
  up: "#22c55e",            // green — up-trend accents
  down: "#ef4444",          // red — down-trend accents
  ink: "#e6e6e6",           // primary readable text on dark
  inkMuted: "#909caa",      // axis labels / sublines
  inkFaint: "#5a6470",      // grid (very subtle)
  void: "#0c0d10",          // tooltip backdrop
  grid: "rgba(255,255,255,0.07)",
} as const;

const AXIS_TICK = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 10,
  fill: AURORA.inkMuted,
};

const SOFT_STROKE = {
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type AuroraVariant =
  | "area"
  | "dualArea"
  | "bars"
  | "stacked"
  | "stackedBars"
  | "sparkline";

export interface AuroraSeries {
  /** The data field this series reads. */
  dataKey: string;
  /** Optional human-readable name (tooltip / legend). */
  name?: string;
  /** Override the colour. Defaults follow the Aurora palette by index. */
  color?: string;
  /** For dualArea: place this series on the right y-axis. */
  rightAxis?: boolean;
}

export interface AuroraMarker {
  /** X-axis value to mark (must match a `data[i][xKey]` value). */
  x: string | number;
  /** Tag shown on the marker line (optional). */
  label?: string;
  /** Stroke colour override. */
  color?: string;
}

export interface AuroraChartProps<T extends object> {
  data: T[];
  series: AuroraSeries[];
  /** Field name on each data point that maps to the X axis. */
  xKey: keyof T & string;
  variant?: AuroraVariant;
  height?: number | string;
  /** Optional vertical marker lines (releases, mentions, milestones). */
  markers?: AuroraMarker[];
  /** Format Y-axis tick labels. Defaults to compact number formatter. */
  yFormatter?: (v: number) => string;
  /** Format X-axis tick labels. Identity by default. */
  xFormatter?: (v: string | number) => string;
  /** Format tooltip values. Defaults to the yFormatter. */
  tooltipFormatter?: (v: number) => string;
  /** Override tooltip's "label" line — usually the formatted X value. */
  tooltipLabelFormatter?: (v: string | number) => string;
  /** Skip animation entirely — useful for static print/OG renders. */
  freeze?: boolean;
  /** Accessibility label on the wrapping div. */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toLocaleString();
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function shortDate(raw: string | number): string {
  if (typeof raw !== "string") return String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const monthIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
  return `${MONTH_ABBR[monthIdx]} ${parseInt(m[3], 10)}`;
}

function colorForIndex(s: AuroraSeries, idx: number): string {
  if (s.color) return s.color;
  // First slot is lava orange — every Aurora chart leads with the brand line.
  // Second/third fall through to cyan, then a desaturated violet for safety.
  const fallbacks = [AURORA.lead, AURORA.secondary, "#a78bfa"];
  return fallbacks[idx % fallbacks.length];
}

// ---------------------------------------------------------------------------
// Tooltip — shared across variants
// ---------------------------------------------------------------------------

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function AuroraTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueFormatter: (v: number) => string;
  labelFormatter?: (v: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const labelText = labelFormatter
    ? labelFormatter(label ?? "")
    : typeof label === "string"
      ? shortDate(label)
      : String(label ?? "");
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
        {labelText}
      </div>
      {payload.map((p, i) => (
        <div
          key={`${p.dataKey ?? i}`}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color ?? AURORA.lead,
              display: "inline-block",
            }}
          />
          <span style={{ color: AURORA.inkMuted }}>{p.name ?? p.dataKey}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {valueFormatter(Number(p.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root dispatcher
// ---------------------------------------------------------------------------

export function AuroraChart<T extends object>({
  data,
  series,
  xKey,
  variant = "area",
  height = 280,
  markers,
  yFormatter = compactNumber,
  xFormatter,
  tooltipFormatter,
  tooltipLabelFormatter,
  freeze = false,
  ariaLabel,
}: AuroraChartProps<T>) {
  const tooltipValueFmt = tooltipFormatter ?? yFormatter;

  // Memoise gradient ids so re-renders don't break SVG <defs> references.
  const gradId = useMemo(
    () => `aur-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  if (variant === "sparkline") {
    return (
      <SparklineBody
        data={data}
        series={series}
        xKey={xKey}
        gradId={gradId}
        freeze={freeze}
        height={height}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {variant === "bars" ? (
          <BarChart data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={AURORA.grid} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={{ stroke: AURORA.grid }}
              tickLine={false}
              minTickGap={28}
              tickFormatter={xFormatter ?? shortDate}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
              width={42}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,107,53,0.08)" }}
              content={(props) => (
                <AuroraTooltip
                  {...(props as unknown as Parameters<typeof AuroraTooltip>[0])}
                  valueFormatter={tooltipValueFmt}
                  labelFormatter={tooltipLabelFormatter}
                />
              )}
            />
            {series.map((s, i) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.name ?? s.dataKey}
                fill={colorForIndex(s, i)}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={!freeze}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
            {(markers ?? []).map((m, i) => (
              <ReferenceLine
                key={`mk-${i}`}
                x={m.x}
                stroke={m.color ?? AURORA.secondary}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
                label={
                  m.label
                    ? {
                        value: m.label,
                        position: "top",
                        fill: m.color ?? AURORA.secondary,
                        fontSize: 9.5,
                        fontFamily: "ui-monospace, monospace",
                      }
                    : undefined
                }
              />
            ))}
          </BarChart>
        ) : variant === "stackedBars" ? (
          <BarChart data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={AURORA.grid} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={{ stroke: AURORA.grid }}
              tickLine={false}
              minTickGap={28}
              tickFormatter={xFormatter ?? shortDate}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
              width={42}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,107,53,0.08)" }}
              content={(props) => (
                <AuroraTooltip
                  {...(props as unknown as Parameters<typeof AuroraTooltip>[0])}
                  valueFormatter={tooltipValueFmt}
                  labelFormatter={tooltipLabelFormatter}
                />
              )}
            />
            {series.map((s, i) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.name ?? s.dataKey}
                stackId="stk"
                fill={colorForIndex(s, i)}
                // Only round the topmost segment per bar (last series in
                // the stack). Recharts paints in declared order so the LAST
                // series sits on top.
                radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={!freeze}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
            {(markers ?? []).map((m, i) => (
              <ReferenceLine
                key={`mk-${i}`}
                x={m.x}
                stroke={m.color ?? AURORA.secondary}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
                label={
                  m.label
                    ? {
                        value: m.label,
                        position: "top",
                        fill: m.color ?? AURORA.secondary,
                        fontSize: 9.5,
                        fontFamily: "ui-monospace, monospace",
                      }
                    : undefined
                }
              />
            ))}
          </BarChart>
        ) : variant === "stacked" ? (
          <AreaChart data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => {
                const c = colorForIndex(s, i);
                return (
                  <linearGradient
                    key={s.dataKey}
                    id={`${gradId}-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={c} stopOpacity={0.72} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.18} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid stroke={AURORA.grid} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={{ stroke: AURORA.grid }}
              tickLine={false}
              minTickGap={28}
              tickFormatter={xFormatter ?? shortDate}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
              width={42}
            />
            <Tooltip
              cursor={{ stroke: AURORA.lead, strokeWidth: 1, strokeDasharray: "2 4" }}
              content={(props) => (
                <AuroraTooltip
                  {...(props as unknown as Parameters<typeof AuroraTooltip>[0])}
                  valueFormatter={tooltipValueFmt}
                  labelFormatter={tooltipLabelFormatter}
                />
              )}
            />
            {series.map((s, i) => (
              <Area
                key={s.dataKey}
                type="monotone"
                stackId="stk"
                dataKey={s.dataKey}
                name={s.name ?? s.dataKey}
                stroke={colorForIndex(s, i)}
                strokeWidth={1.4}
                {...SOFT_STROKE}
                fill={`url(#${gradId}-${i})`}
                fillOpacity={1}
                isAnimationActive={!freeze}
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        ) : (
          // area + dualArea share the same body shape; dualArea adds a
          // right-side YAxis and renders any rightAxis series as a Line.
          <ComposedChart data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => {
                const c = colorForIndex(s, i);
                return (
                  <linearGradient
                    key={s.dataKey}
                    id={`${gradId}-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                    <stop offset="55%" stopColor={c} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                );
              })}
              <filter id={`${gradId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid stroke={AURORA.grid} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={{ stroke: AURORA.grid }}
              tickLine={false}
              minTickGap={28}
              tickFormatter={xFormatter ?? shortDate}
            />
            <YAxis
              yAxisId="left"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
              width={42}
            />
            {variant === "dualArea" ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={yFormatter}
                width={42}
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: AURORA.lead, strokeWidth: 1, strokeDasharray: "2 4" }}
              content={(props) => (
                <AuroraTooltip
                  {...(props as unknown as Parameters<typeof AuroraTooltip>[0])}
                  valueFormatter={tooltipValueFmt}
                  labelFormatter={tooltipLabelFormatter}
                />
              )}
            />
            {series.map((s, i) => {
              const c = colorForIndex(s, i);
              const isRight = variant === "dualArea" && s.rightAxis;
              if (isRight) {
                return (
                  <Line
                    key={s.dataKey}
                    yAxisId="right"
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name ?? s.dataKey}
                    stroke={c}
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    {...SOFT_STROKE}
                    dot={false}
                    isAnimationActive={!freeze}
                    animationDuration={1000}
                    activeDot={{ r: 4, fill: c, stroke: AURORA.void, strokeWidth: 1.5 }}
                  />
                );
              }
              return (
                <Area
                  key={s.dataKey}
                  yAxisId="left"
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name ?? s.dataKey}
                  stroke={c}
                  strokeWidth={2.4}
                  {...SOFT_STROKE}
                  fill={`url(#${gradId}-${i})`}
                  fillOpacity={1}
                  isAnimationActive={!freeze}
                  animationDuration={900}
                  animationEasing="ease-out"
                  filter={i === 0 ? `url(#${gradId}-glow)` : undefined}
                  activeDot={{ r: 5, fill: c, stroke: AURORA.void, strokeWidth: 2 }}
                />
              );
            })}
            {(markers ?? []).map((m, i) => (
              <ReferenceLine
                key={`mk-${i}`}
                yAxisId="left"
                x={m.x}
                stroke={m.color ?? AURORA.secondary}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
                label={
                  m.label
                    ? {
                        value: m.label,
                        position: "top",
                        fill: m.color ?? AURORA.secondary,
                        fontSize: 9.5,
                        fontFamily: "ui-monospace, monospace",
                      }
                    : undefined
                }
              />
            ))}
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — micro-chart, no axes, no grid, single area line. Sized to
// stretch to the parent so it slots into a table cell, sidebar card, etc.
// ---------------------------------------------------------------------------

function SparklineBody<T extends object>({
  data,
  series,
  xKey,
  gradId,
  freeze,
  height,
  ariaLabel,
}: {
  data: T[];
  series: AuroraSeries[];
  xKey: keyof T & string;
  gradId: string;
  freeze: boolean;
  height: number | string;
  ariaLabel?: string;
}) {
  const s = series[0];
  if (!s) return null;
  const color = s.color ?? AURORA.lead;
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`${gradId}-spk`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey={xKey} hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey={s.dataKey}
            stroke={color}
            strokeWidth={1.6}
            {...SOFT_STROKE}
            fill={`url(#${gradId}-spk)`}
            fillOpacity={1}
            isAnimationActive={!freeze}
            animationDuration={700}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
