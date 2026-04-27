"use client";

import { useMemo } from "react";
import type { JSX } from "react";
import Image from "next/image";
import type { CompareRepoBundle } from "@/lib/github-compare";

interface CompareHeatmapProps {
  bundles: CompareRepoBundle[];
  palette: string[];
}

const CELL = 11;
const GAP = 2;
const WEEKS = 52;
const DAYS = 7;
const GRID_WIDTH = WEEKS * (CELL + GAP) - GAP;
const GRID_HEIGHT = DAYS * (CELL + GAP) - GAP;
const LEFT_GUTTER = 24;
const TOP_GUTTER = 14;
const SVG_WIDTH = LEFT_GUTTER + GRID_WIDTH;
const SVG_HEIGHT = TOP_GUTTER + GRID_HEIGHT;

const BUCKET_ALPHAS = [0.2, 0.4, 0.65, 0.95] as const;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type WeekBucket = { weekStart: number; days: [number, number, number, number, number, number, number] };
interface Cell { x: number; y: number; count: number; bucket: number; dateIso: string }
interface RepoRow {
  bundle: CompareRepoBundle;
  accent: string;
  cells: Cell[];
  monthLabels: Array<{ x: number; label: string }>;
  totalYear: number;
  total30d: number;
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

/** Split 4 bucket thresholds across 1..max so each row normalizes its own scale. */
function bucketThresholds(max: number): [number, number, number, number] {
  if (max <= 0) return [1, 1, 1, 1];
  return [
    1,
    Math.max(2, Math.ceil(max * 0.25)),
    Math.max(3, Math.ceil(max * 0.5)),
    Math.max(4, Math.ceil(max * 0.75)),
  ];
}

function pickBucket(count: number, t: [number, number, number, number]): number {
  if (count <= 0) return 0;
  if (count >= t[3]) return 4;
  if (count >= t[2]) return 3;
  if (count >= t[1]) return 2;
  return 1;
}

function buildRow(bundle: CompareRepoBundle, accent: string): RepoRow {
  const empty: WeekBucket = { weekStart: 0, days: [0, 0, 0, 0, 0, 0, 0] };
  const tail = (bundle.commitActivity ?? []).slice(-WEEKS);
  const weeks: WeekBucket[] = [
    ...Array.from({ length: WEEKS - tail.length }, () => empty),
    ...tail,
  ];

  let max = 0;
  for (const w of weeks) for (const d of w.days) if (d > max) max = d;
  const thresholds = bucketThresholds(max);

  const cells: Cell[] = [];
  const monthLabels: Array<{ x: number; label: string }> = [];
  let totalYear = 0;
  let total30d = 0;
  let lastMonth = -1;
  const last30Cutoff = weeks.length - 4;

  weeks.forEach((week, wi) => {
    const weekX = LEFT_GUTTER + wi * (CELL + GAP);
    if (week.weekStart > 0) {
      const month = new Date(week.weekStart * 1000).getUTCMonth();
      if (month !== lastMonth && wi % 4 === 0) {
        monthLabels.push({ x: weekX, label: MONTH_NAMES[month] });
        lastMonth = month;
      }
    }
    week.days.forEach((count, di) => {
      totalYear += count;
      if (wi >= last30Cutoff) total30d += count;
      cells.push({
        x: weekX,
        y: TOP_GUTTER + di * (CELL + GAP),
        count,
        bucket: pickBucket(count, thresholds),
        dateIso: week.weekStart > 0 ? formatDateIso((week.weekStart + di * 86400) * 1000) : "",
      });
    });
  });

  return { bundle, accent, cells, monthLabels, totalYear, total30d };
}

function HeatRow({ row }: { row: RepoRow }): JSX.Element {
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
      <div className="w-full overflow-x-auto scrollbar-hide">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          width="100%"
          height={SVG_HEIGHT}
          role="img"
          aria-label={`${row.bundle.fullName} commit heatmap, 52 weeks`}
          style={{ minWidth: SVG_WIDTH, display: "block" }}
        >
          {row.monthLabels.map((m, idx) => (
            <text key={`${m.label}-${idx}`} x={m.x} y={TOP_GUTTER - 4} fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
              {m.label}
            </text>
          ))}
          {DAY_LABELS.map((label, di) =>
            label ? (
              <text key={label} x={0} y={TOP_GUTTER + di * (CELL + GAP) + CELL - 2} fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                {label}
              </text>
            ) : null,
          )}
          {row.cells.map((cell, i) => (
            <rect
              key={i}
              x={cell.x}
              y={cell.y}
              width={CELL}
              height={CELL}
              rx={2}
              ry={2}
              fill={cell.bucket === 0 ? "var(--color-bg-secondary)" : toRgba(row.accent, BUCKET_ALPHAS[cell.bucket - 1])}
            >
              <title>
                {cell.count} commit{cell.count === 1 ? "" : "s"}
                {cell.dateIso ? ` on ${cell.dateIso}` : ""}
              </title>
            </rect>
          ))}
        </svg>
      </div>
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
        const accent = palette[i] ?? "var(--color-brand)";
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
