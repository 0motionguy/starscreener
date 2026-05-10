"use client";

import { useMemo } from "react";
import type { JSX } from "react";
import Image from "next/image";
import type { EChartsCoreOption } from "echarts/core";
import type { CompareRepoBundle } from "@/lib/github-compare";
import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";

export interface CompareHeatmapProps {
  bundles: CompareRepoBundle[];
  palette: string[];
}

const WEEKS = 52;
const ROW_HEIGHT = 110;

const BUCKET_ALPHAS = [0.2, 0.4, 0.65, 0.95] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface HeatPoint {
  /** [weekIndex, dayIndex, count] */
  value: [number, number, number];
  dateIso: string;
}

interface MonthLabel {
  weekIndex: number;
  label: string;
}

interface RowModel {
  bundle: CompareRepoBundle;
  accent: string;
  data: HeatPoint[];
  monthLabels: MonthLabel[];
  totalYear: number;
  total30d: number;
  max: number;
}

function toRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function formatDateIso(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Per-row 4 thresholds across 1..max so each row normalizes its own scale. */
function bucketThresholds(max: number): [number, number, number, number] {
  if (max <= 0) return [1, 1, 1, 1];
  return [
    1,
    Math.max(2, Math.ceil(max * 0.25)),
    Math.max(3, Math.ceil(max * 0.5)),
    Math.max(4, Math.ceil(max * 0.75)),
  ];
}

function buildRow(bundle: CompareRepoBundle, accent: string): RowModel {
  const empty = { weekStart: 0, days: [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number] };
  const tail = (bundle.commitActivity ?? []).slice(-WEEKS);
  const weeks = [
    ...Array.from({ length: WEEKS - tail.length }, () => empty),
    ...tail,
  ];

  let max = 0;
  for (const w of weeks) for (const d of w.days) if (d > max) max = d;

  const data: HeatPoint[] = [];
  const monthLabels: MonthLabel[] = [];
  let totalYear = 0;
  let total30d = 0;
  let lastMonth = -1;
  const last30Cutoff = weeks.length - 4;

  weeks.forEach((week, wi) => {
    if (week.weekStart > 0) {
      const month = new Date(week.weekStart * 1000).getUTCMonth();
      if (month !== lastMonth && wi % 4 === 0) {
        monthLabels.push({ weekIndex: wi, label: MONTH_NAMES[month] });
        lastMonth = month;
      }
    }
    week.days.forEach((count, di) => {
      totalYear += count;
      if (wi >= last30Cutoff) total30d += count;
      data.push({
        value: [wi, di, count],
        dateIso: week.weekStart > 0 ? formatDateIso((week.weekStart + di * 86400) * 1000) : "",
      });
    });
  });

  return { bundle, accent, data, monthLabels, totalYear, total30d, max };
}

/**
 * Build an ECharts heatmap option for a single repo row. ECharts has a native
 * `pieceWise` visualMap, but per-row thresholds + per-row accent colors mean
 * each row needs its own bucket→rgba mapping. We pre-compute the rgba palette
 * from the row accent and feed it as `pieces` so the visualMap doesn't have
 * to do the alpha math at render time.
 */
function buildOption(row: RowModel): EChartsCoreOption {
  const thresholds = bucketThresholds(row.max);
  const emptyFill = CHART_TOKENS.bgMuted;
  const bucketColors = BUCKET_ALPHAS.map((a) => toRgba(row.accent, a));

  // pieces: [0,0]=empty, then 4 buckets keyed by count thresholds.
  const pieces: Array<{ min?: number; max?: number; gte?: number; lte?: number; color: string }> = [
    { min: 0, max: 0, color: emptyFill },
    { gte: 1, lte: thresholds[1] - 1, color: bucketColors[0] },
    { gte: thresholds[1], lte: thresholds[2] - 1, color: bucketColors[1] },
    { gte: thresholds[2], lte: thresholds[3] - 1, color: bucketColors[2] },
    { gte: thresholds[3], color: bucketColors[3] },
  ];

  // Use threshold-bucket lookup for hover-resilient color (matches the SVG
  // bucket logic precisely so the canvas reads the same visual intensity).
  const tooltipFormatter = (params: unknown) => {
    const p = params as { value: [number, number, number]; data?: { dateIso?: string } };
    const count = p.value[2];
    const dateIso = p.data?.dateIso ?? "";
    const plural = count === 1 ? "" : "s";
    return `${count} commit${plural}${dateIso ? ` on ${dateIso}` : ""}`;
  };

  return {
    grid: {
      top: 18,
      right: 8,
      bottom: 4,
      left: 36,
      containLabel: false,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: CHART_TOKENS.bgCanvas,
      borderColor: CHART_TOKENS.borderDefault,
      borderWidth: 1,
      padding: [6, 8],
      textStyle: {
        color: CHART_TOKENS.textDefault,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
      },
      extraCssText: "box-shadow: none;",
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: "category",
      data: Array.from({ length: WEEKS }, (_, i) => String(i)),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        show: true,
        interval: (index: number) => row.monthLabels.some((m) => m.weekIndex === index),
        formatter: (val: string) => {
          const m = row.monthLabels.find((ml) => ml.weekIndex === Number(val));
          return m ? m.label : "";
        },
        color: CHART_TOKENS.textFaint,
        fontSize: 9,
        fontFamily: "var(--font-mono)",
      },
      position: "top",
    },
    yAxis: {
      type: "category",
      data: DAY_LABELS,
      inverse: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        show: true,
        // Mirror the original SVG's odd-only labels (Mon / Wed / Fri).
        interval: (index: number) => index === 1 || index === 3 || index === 5,
        color: CHART_TOKENS.textFaint,
        fontSize: 9,
        fontFamily: "var(--font-mono)",
      },
    },
    visualMap: {
      show: false,
      type: "piecewise",
      pieces,
      seriesIndex: 0,
    },
    series: [
      {
        type: "heatmap",
        name: row.bundle.fullName,
        data: row.data,
        itemStyle: {
          borderRadius: 2,
          borderWidth: 0,
        },
        progressive: 0,
        animation: false,
      },
    ],
  };
}

function HeatRow({ row }: { row: RowModel }): JSX.Element {
  const option = useMemo(() => buildOption(row), [row]);

  return (
    <div
      className="v2-card p-3"
      style={{ borderLeft: `3px solid ${row.accent}` }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Image src={row.bundle.avatarUrl} alt={row.bundle.owner} width={16} height={16} className="size-4 rounded-full" />
        <span className="font-mono text-[12px] text-text-primary truncate">{row.bundle.fullName}</span>
        <span className="font-mono text-[11px] text-text-tertiary tabular-nums ml-auto">
          <span className="text-text-secondary">{row.total30d}</span> commits (30d) ·{" "}
          <span className="text-text-secondary">{row.totalYear}</span> total (52w)
        </span>
      </div>
      <EChart
        option={option}
        height={ROW_HEIGHT}
        ariaLabel={`${row.bundle.fullName} commit heatmap, 52 weeks`}
      />
    </div>
  );
}

function UnavailableRow({ bundle, accent }: { bundle: CompareRepoBundle; accent: string }): JSX.Element {
  return (
    <div
      className="v2-card p-3"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Image src={bundle.avatarUrl} alt={bundle.owner} width={16} height={16} className="size-4 rounded-full" />
        <span className="font-mono text-[12px] text-text-secondary truncate">{bundle.fullName}</span>
      </div>
      <p className="text-xs text-text-tertiary">Heatmap unavailable</p>
    </div>
  );
}

/**
 * GitHub-style 52x7 contribution heatmaps per repo, stacked vertically and
 * normalized per-row so relative intensity is visible even across very
 * different-sized projects.
 */
export function CompareHeatmap({ bundles, palette }: CompareHeatmapProps): JSX.Element {
  const rows = useMemo(
    () =>
      bundles.map((bundle, i) => {
        const accent = palette[i] ?? CHART_TOKENS.accent;
        const unavailable =
          !bundle.ok || !bundle.commitActivity || bundle.commitActivity.length === 0;
        return { bundle, accent, row: unavailable ? null : buildRow(bundle, accent) };
      }),
    [bundles, palette],
  );

  return (
    <div className="flex flex-col gap-5">
      {rows.map(({ bundle, accent, row }) =>
        row ? (
          <HeatRow key={bundle.fullName} row={row} />
        ) : (
          <UnavailableRow key={bundle.fullName} bundle={bundle} accent={accent} />
        ),
      )}
    </div>
  );
}
