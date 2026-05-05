"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";

import { Sparkline } from "@/components/shared/Sparkline";
import { squarifiedTreemap } from "@/lib/treemap";
import { cn, formatNumber } from "@/lib/utils";
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  type Channel,
} from "@/components/mindshare/channels";

export type MindshareWindow = "24h" | "48h" | "7d" | "30d" | "3m" | "6m" | "12m";

export interface MindshareTreemapRow {
  id: string;
  fullName: string;
  shortName: string;
  owner: string;
  name: string;
  score: number;
  starsDelta24h: number;
  mentionCount24h: number;
  channelsFiring: number;
  dominantChannel: Channel;
  shares: Record<Channel, number>;
  categoryId: string;
  ecosystem: string;
  sparkline: number[];
  periodDelta: Record<MindshareWindow, number>;
  periodMentions: Record<MindshareWindow, number>;
}

interface MindshareTreemapProps {
  rows: MindshareTreemapRow[];
  className?: string;
}

const TREEMAP_WIDTH = 1200;
const TREEMAP_HEIGHT = 620;

const WINDOW_TABS: Array<{ key: MindshareWindow; label: string }> = [
  { key: "24h", label: "24H" },
  { key: "48h", label: "48H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
];

const TOP_PRESETS = [20, 50, 100] as const;

function areaWeight(row: MindshareTreemapRow, window: MindshareWindow): number {
  const periodScore = Math.abs(row.periodDelta[window] ?? 0);
  const mentionScore = Math.log1p(Math.max(0, row.periodMentions[window] ?? 0));
  return Math.max(1, row.score * row.score + periodScore * 0.7 + mentionScore * 8);
}

function performanceFill(delta: number): string {
  if (delta >= 300) return "linear-gradient(145deg, #0d5a37 0%, #166534 100%)";
  if (delta > 0) return "linear-gradient(145deg, #0e412d 0%, #14532d 100%)";
  if (delta <= -120) return "linear-gradient(145deg, #661b1b 0%, #8b1f1f 100%)";
  if (delta < 0) return "linear-gradient(145deg, #4b1c1c 0%, #6b1f1f 100%)";
  return "linear-gradient(145deg, #1f2937 0%, #111827 100%)";
}

function deltaLabel(delta: number): string {
  if (delta > 0) return `+${formatNumber(Math.round(delta))}`;
  if (delta < 0) return `${formatNumber(Math.round(delta))}`;
  return "0";
}

function pctLabel(value: number): string {
  return `${value.toFixed(1)}%`;
}

function density(w: number, h: number) {
  const minDim = Math.min(w, h);
  if (minDim >= 160) {
    return { showMeta: true, showSpark: true, showOwner: true, nameSize: 19, subSize: 12, pad: 12 };
  }
  if (minDim >= 110) {
    return { showMeta: true, showSpark: true, showOwner: true, nameSize: 14, subSize: 10, pad: 9 };
  }
  if (minDim >= 70) {
    return { showMeta: false, showSpark: false, showOwner: true, nameSize: 11, subSize: 9, pad: 7 };
  }
  return { showMeta: false, showSpark: false, showOwner: false, nameSize: 10, subSize: 9, pad: 5 };
}

function dominantChip(channel: Channel): CSSProperties {
  return {
    borderColor: CHANNEL_COLORS[channel],
    color: CHANNEL_COLORS[channel],
  };
}

function rankRows(rows: MindshareTreemapRow[], window: MindshareWindow) {
  return [...rows].sort((a, b) => areaWeight(b, window) - areaWeight(a, window));
}

function uniqueValues(rows: MindshareTreemapRow[], key: "categoryId" | "ecosystem") {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function MindshareTreemap({ rows, className }: MindshareTreemapProps) {
  const [windowKey, setWindowKey] = useState<MindshareWindow>("24h");
  const [category, setCategory] = useState<string>("all");
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [topN, setTopN] = useState<(typeof TOP_PRESETS)[number]>(50);

  const categoryOptions = useMemo(() => uniqueValues(rows, "categoryId"), [rows]);
  const ecosystemOptions = useMemo(() => uniqueValues(rows, "ecosystem"), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (category !== "all") out = out.filter((row) => row.categoryId === category);
    if (ecosystem !== "all") out = out.filter((row) => row.ecosystem === ecosystem);
    out = rankRows(out, windowKey);
    return out.slice(0, topN);
  }, [rows, category, ecosystem, windowKey, topN]);

  const totalWeight = useMemo(
    () => filtered.reduce((sum, row) => sum + areaWeight(row, windowKey), 0),
    [filtered, windowKey],
  );

  const rects = useMemo(
    () =>
      squarifiedTreemap(
        filtered.map((row) => ({ id: row.id, value: areaWeight(row, windowKey) })),
        {
          width: TREEMAP_WIDTH,
          height: TREEMAP_HEIGHT,
          padding: 2,
        },
      ),
    [filtered, windowKey],
  );

  const rectById = useMemo(() => new Map(rects.map((rect) => [rect.id, rect])), [rects]);

  const gainers = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => (b.periodDelta[windowKey] ?? 0) - (a.periodDelta[windowKey] ?? 0))
        .slice(0, 8),
    [filtered, windowKey],
  );

  const losers = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => (a.periodDelta[windowKey] ?? 0) - (b.periodDelta[windowKey] ?? 0))
        .slice(0, 8),
    [filtered, windowKey],
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {WINDOW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setWindowKey(tab.key)}
            className={cn(
              "rounded border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.11em]",
              windowKey === tab.key
                ? "border-accent-green bg-accent-green/15 text-accent-green"
                : "border-border-primary text-text-tertiary hover:text-text-secondary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded border border-border-primary bg-bg-secondary px-2 py-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-tertiary">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="bg-transparent text-xs text-text-secondary outline-none"
          >
            <option value="all">All AI Categories</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 rounded border border-border-primary bg-bg-secondary px-2 py-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-tertiary">Ecosystem</span>
          <select
            value={ecosystem}
            onChange={(event) => setEcosystem(event.target.value)}
            className="bg-transparent text-xs text-text-secondary outline-none"
          >
            <option value="all">All Ecosystems</option>
            {ecosystemOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          {TOP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTopN(preset)}
              className={cn(
                "rounded border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.11em]",
                topN === preset
                  ? "border-accent-green bg-accent-green/15 text-accent-green"
                  : "border-border-primary text-text-tertiary hover:text-text-secondary",
              )}
            >
              Top {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />Positive</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />Negative</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />Flat</span>
          </div>

          <div
            className="relative w-full overflow-hidden rounded-card border border-border-primary bg-[#060a10]"
            style={{ aspectRatio: `${TREEMAP_WIDTH} / ${TREEMAP_HEIGHT}` }}
            role="list"
            aria-label="AI repository mindshare treemap"
          >
            {filtered.map((row) => {
              const rect = rectById.get(row.id);
              if (!rect) return null;

              const size = density(rect.w, rect.h);
              const delta = row.periodDelta[windowKey] ?? 0;
              const sharePct = totalWeight > 0 ? (areaWeight(row, windowKey) / totalWeight) * 100 : 0;
              const style: CSSProperties = {
                left: `${(rect.x / TREEMAP_WIDTH) * 100}%`,
                top: `${(rect.y / TREEMAP_HEIGHT) * 100}%`,
                width: `${(rect.w / TREEMAP_WIDTH) * 100}%`,
                height: `${(rect.h / TREEMAP_HEIGHT) * 100}%`,
                background: performanceFill(delta),
                padding: size.pad,
              };

              return (
                <Link
                  key={row.id}
                  href={`/repo/${row.owner}/${row.name}`}
                  className="group absolute block overflow-hidden rounded-[6px] border border-white/10 text-white transition will-change-transform hover:z-20 hover:scale-[1.01] hover:border-white/30 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/70"
                  style={style}
                  role="listitem"
                  title={`${row.fullName} | share ${pctLabel(sharePct)} | delta ${deltaLabel(delta)} | ${CHANNEL_LABELS[row.dominantChannel]}`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-80" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="min-w-0">
                      {size.showOwner && <p className="truncate text-[10px] font-mono uppercase tracking-[0.1em] text-white/65">{row.owner}</p>}
                      <p className="truncate font-semibold leading-tight" style={{ fontSize: size.nameSize }}>{row.shortName}</p>
                      {size.showMeta && <p className="truncate font-mono text-white/80" style={{ fontSize: size.subSize }}>{pctLabel(sharePct)} share</p>}
                    </div>

                    <div className="space-y-1">
                      {size.showMeta && (
                        <p className="truncate font-mono text-white/75" style={{ fontSize: size.subSize }}>
                          {deltaLabel(delta)} | {row.channelsFiring}/5 | {formatNumber(row.periodMentions[windowKey] ?? 0)} mentions
                        </p>
                      )}
                      {size.showSpark && (
                        <Sparkline data={row.sparkline.slice(-14)} width={88} height={20} positive={delta >= 0} className="opacity-90" />
                      )}
                      <span className="inline-flex max-w-full items-center truncate rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.08em]" style={dominantChip(row.dominantChannel)}>
                        {CHANNEL_LABELS[row.dominantChannel]}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="space-y-3">
          <SideList title="Top Gainers" rows={gainers} windowKey={windowKey} positive />
          <SideList title="Top Losers" rows={losers} windowKey={windowKey} positive={false} />
        </aside>
      </div>
    </div>
  );
}

function SideList({
  title,
  rows,
  windowKey,
  positive,
}: {
  title: string;
  rows: MindshareTreemapRow[];
  windowKey: MindshareWindow;
  positive: boolean;
}) {
  return (
    <section className="rounded-card border border-border-primary bg-bg-secondary p-3">
      <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] text-text-tertiary">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => {
          const delta = row.periodDelta[windowKey] ?? 0;
          const base = Math.max(1, row.score * 100);
          const relPct = (delta / base) * 100;
          const tone = delta >= 0 ? "text-emerald-400" : "text-rose-400";

          if (positive && delta < 0) return null;
          if (!positive && delta > 0) return null;

          return (
            <li key={`${title}-${row.id}`} className="flex items-center justify-between gap-2 text-xs">
              <Link href={`/repo/${row.owner}/${row.name}`} className="truncate text-text-secondary hover:text-text-primary">
                {row.fullName}
              </Link>
              <span className={cn("shrink-0 font-mono", tone)}>
                {deltaLabel(delta)} ({relPct >= 0 ? "+" : ""}{relPct.toFixed(1)}%)
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

