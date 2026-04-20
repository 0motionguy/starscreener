"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Star, GitFork, Users } from "lucide-react";
import type { Repo, TimeRange } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

interface RepoChartProps {
  repo: Repo;
}

type SeriesKey = "stars" | "forks" | "contributors";

const TIME_TABS: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const SERIES: Array<{
  key: SeriesKey;
  label: string;
  color: string;
  icon: typeof Star;
}> = [
  { key: "stars", label: "Stars", color: "var(--color-up)", icon: Star },
  { key: "forks", label: "Forks", color: "var(--color-info)", icon: GitFork },
  { key: "contributors", label: "Contributors", color: "var(--color-brand)", icon: Users },
];

function generateDateLabels(count: number): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    labels.push(
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    );
  }
  return labels;
}

/**
 * Synthesize a "growth curve" series from the repo's sparkline and the
 * total current value. The sparkline is daily star counts normalized to
 * the current total, so we reconstruct absolute series for forks +
 * contributors by scaling the star curve (no separate history is tracked
 * per metric yet). This produces credible-looking curves that preserve
 * proportional growth shape.
 */
function buildSeries(
  sparkline: number[],
  totalStars: number,
  totalForks: number,
  totalContribs: number,
): { stars: number[]; forks: number[]; contributors: number[] } {
  if (sparkline.length === 0) {
    return { stars: [], forks: [], contributors: [] };
  }
  const isCumulative = sparkline.every((value, index) => {
    return index === 0 || value >= sparkline[index - 1];
  });
  const base = isCumulative
    ? sparkline
    : sparkline.reduce<number[]>((acc, value, index) => {
        const previous = index === 0 ? 0 : acc[index - 1];
        acc.push(previous + value);
        return acc;
      }, []);
  const last = base[base.length - 1] || 1;
  // Anchor the final point to the current total, then back-fill proportionally.
  const scale = totalStars > 0 ? totalStars / last : 1;
  const stars = base.map((v) => Math.round(v * scale));

  // Forks + contributors mirror the shape but with their own totals as
  // the right-edge anchor. Proportional back-fill gives realistic history.
  const forks = base.map((v) => Math.round((v / last) * totalForks));
  const contributors = base.map((v) =>
    Math.round((v / last) * totalContribs),
  );
  return { stars, forks, contributors };
}

interface TooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string | number; value?: number | string; color?: string }>;
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-bg-card border border-border-primary rounded-card px-3 py-2 shadow-card min-w-[160px]">
      <p className="text-[11px] font-mono text-text-tertiary mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div
            key={String(p.name ?? i)}
            className="flex items-center justify-between gap-4"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary capitalize">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              {p.name}
            </span>
            <span className="font-mono text-xs text-text-primary tabular-nums">
              {formatNumber(Number(p.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MIN_HISTORY_POINTS = 2;

export function RepoChart({ repo }: RepoChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    stars: true,
    forks: true,
    contributors: true,
  });

  // Only completely empty/all-zero histories get the placeholder. A two-point
  // series is enough to show direction and avoids blank project pages.
  const nonZeroDays = repo.sparklineData.filter(
    (n) => Number.isFinite(n) && n !== 0,
  ).length;
  const isSparse =
    repo.sparklineData.length < MIN_HISTORY_POINTS || nonZeroDays === 0;

  const chartData = useMemo(() => {
    const data = repo.sparklineData;
    let sliceStart: number;

    switch (timeRange) {
      case "24h":
        sliceStart = Math.max(0, data.length - 2);
        break;
      case "7d":
        sliceStart = Math.max(0, data.length - 7);
        break;
      case "30d":
      default:
        sliceStart = 0;
        break;
    }

    const sliced = data.slice(sliceStart);
    const { stars, forks, contributors } = buildSeries(
      sliced,
      repo.stars,
      repo.forks,
      repo.contributors,
    );
    const labels = generateDateLabels(sliced.length);

    return sliced.map((_, i) => ({
      date: labels[i],
      stars: stars[i],
      forks: forks[i],
      contributors: contributors[i],
    }));
  }, [repo.sparklineData, repo.stars, repo.forks, repo.contributors, timeRange]);

  const toggle = (key: SeriesKey) =>
    setVisible((v) => ({ ...v, [key]: !v[key] }));

  return (
    <section className="bg-bg-card rounded-card p-4 border border-border-primary shadow-card animate-slide-up">
      {/* Header: title + series toggles + time tabs */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
          Growth
        </h2>
        <div className="flex items-center gap-2">
          {SERIES.map((s) => {
            const Icon = s.icon;
            const on = visible[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-colors",
                  "border",
                  on
                    ? "border-border-primary text-text-primary bg-bg-tertiary"
                    : "border-border-secondary text-text-tertiary hover:text-text-secondary",
                )}
                style={on ? { boxShadow: `inset 0 -2px 0 0 ${s.color}` } : undefined}
              >
                <Icon size={11} style={{ color: on ? s.color : undefined }} aria-hidden />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 bg-bg-secondary rounded-badge p-0.5">
          {TIME_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTimeRange(tab.value)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-badge transition-all",
                timeRange === tab.value
                  ? "bg-bg-card text-text-primary shadow-card"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — wrapped in a horizontal-scroll container so narrow viewports
          can pan across dense time labels instead of cramming the axis. */}
      <div className="h-[240px] w-full overflow-x-auto">
        <div className="h-full min-w-[520px]">
        {isSparse ? (
          <ChartPlaceholder captured={nonZeroDays} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
          >
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-tertiary)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-tertiary)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
              tickFormatter={(v: number) => formatNumber(v)}
              dx={-4}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "var(--color-border-primary)",
                strokeDasharray: "4 4",
              }}
            />
            <Legend wrapperStyle={{ display: "none" }} />
            {SERIES.map((s) =>
              visible[s.key] ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#grad-${s.key})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: s.color,
                    stroke: "var(--color-bg-card)",
                    strokeWidth: 2,
                  }}
                />
              ) : null,
            )}
          </AreaChart>
        </ResponsiveContainer>
        )}
        </div>
      </div>

      {/*
        Chart-honesty footnote. Today the pipeline only stores per-day star
        history; forks/contributors curves are derived from that star shape
        (see buildSeries above). The note makes the estimation explicit
        instead of letting readers assume the lines are independently tracked.
      */}
      {!isSparse &&
        (visible.forks || visible.contributors) && (
          <p
            className="mt-2 text-[10px] text-text-tertiary leading-snug"
            title="Forks and contributors are reconstructed from star growth, scaled to current totals. Per-day fork/contributor history will arrive in a future pipeline pass."
          >
            <span className="font-mono">*</span> Forks and contributors curves
            are estimated from the star-history shape; only today&apos;s totals
            are exact.
          </p>
        )}
    </section>
  );
}

/**
 * Placeholder rendered in lieu of the Recharts AreaChart when the repo's
 * sparkline series is too sparse to convey a trend. Shows a thin dotted
 * baseline and a "Collecting history" caption so the section doesn't feel
 * broken on newly-tracked repos.
 */
function ChartPlaceholder({ captured }: { captured: number }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 300 240"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <line
          x1={12}
          x2={288}
          y1={120}
          y2={120}
          stroke="var(--color-text-muted, var(--color-text-tertiary))"
          strokeWidth={1}
          strokeDasharray="4 6"
          strokeLinecap="round"
          opacity={0.5}
        />
      </svg>
      <p className="relative text-xs font-mono text-text-tertiary bg-bg-card px-2 py-1 rounded-badge">
        Collecting history — {captured}/30 days captured
      </p>
    </div>
  );
}
