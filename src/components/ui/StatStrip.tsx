// Compact stat strip — replaces the H1+blurb hero on listing pages
// where NewsTopHeaderV3 isn't already carrying the duty (/skills, /mcp,
// /signals, /reddit, /funding, /revenue, /research).
//
// One eyebrow line + 3-5 stat tiles + optional rightSlot for nav/tabs.
// v3-panel chrome with 4 corner brackets (matches CardShell in
// NewsTopHeaderV3.tsx).

import type { ReactNode } from "react";
import { Metric, MetricGrid, type MetricTone } from "@/components/ui/Metric";

export interface StatStripStat {
  /** Mono uppercase label above the value. */
  label: string;
  /** Big tabular-nums number/string. Caller formats. */
  value: string;
  /** Optional secondary line (compact mono). */
  hint?: string;
  /** Color tone — defaults to "default". */
  tone?: "default" | "up" | "down" | "accent";
}

interface StatStripProps {
  /** Eyebrow line, e.g. "// SKILLS · LIVE INDEX". */
  eyebrow: string;
  /** Right-side eyebrow detail, e.g. "1,432 ITEMS · 24H". */
  status?: string;
  /** Up to 5 stats. Layout collapses gracefully. */
  stats: StatStripStat[];
  /** Optional right-aligned slot (tabs, links). */
  rightSlot?: ReactNode;
  /** Page accent for the corner-bracket markers. Defaults to v3-acc. */
  accent?: string;
}

function metricTone(tone: StatStripStat["tone"]): MetricTone {
  switch (tone) {
    case "up":
      return "positive";
    case "down":
      return "negative";
    case "accent":
      return "accent";
    default:
      return "neutral";
  }
}

export function StatStrip({
  eyebrow,
  status,
  stats,
  rightSlot,
  accent = "var(--v4-acc)",
}: StatStripProps) {
  return (
    <section
      aria-label="Page metrics"
      className="relative"
      style={{
        background: "linear-gradient(180deg, var(--v4-bg-050), var(--v4-bg-000))",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      {/* 4 corner-bracket markers — matches NewsTopHeaderV3 CardShell. */}
      <CornerMarkers accent={accent} />

      {/* Eyebrow row */}
      <div
        className="v2-mono flex items-center justify-between gap-3 px-3 py-2"
        style={{
          borderBottom: "1px solid var(--v4-line-100)",
          background: "var(--v4-bg-025)",
        }}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <span aria-hidden className="flex items-center gap-1">
            <Square color={accent} glow={accent} />
            <Square color="var(--v4-line-300)" />
            <Square color="var(--v4-line-300)" />
          </span>
          <span
            className="truncate text-[11px] tracking-[0.18em]"
            style={{ color: "var(--v4-ink-200)" }}
          >
            {eyebrow}
          </span>
        </span>
        {status ? (
          <span
            className="shrink-0 text-[10px] tabular-nums tracking-[0.14em]"
            style={{ color: "var(--v4-ink-400)" }}
          >
            {status}
          </span>
        ) : null}
      </div>

      {/* Stats row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <MetricGrid
          columns={Math.min(Math.max(stats.length, 4), 6) as 4 | 5 | 6}
          className="mb-0 flex-1 border-x-0 border-b-0"
        >
          {stats.map((stat, i) => (
            <Metric
              key={i}
              label={stat.label}
              value={stat.value}
              sub={stat.hint}
              tone={metricTone(stat.tone)}
            />
          ))}
        </MetricGrid>
        {rightSlot ? (
          <div className="shrink-0 self-start px-4 pb-4 sm:self-end">{rightSlot}</div>
        ) : null}
      </div>
    </section>
  );
}

function CornerMarkers({ accent }: { accent: string }) {
  const corners: Array<React.CSSProperties> = [
    { top: -2, left: -2 },
    { top: -2, right: -2 },
    { bottom: -2, left: -2 },
    { bottom: -2, right: -2 },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ width: 5, height: 5, background: accent, ...pos }}
        />
      ))}
    </>
  );
}

function Square({
  color,
  glow,
  size = 6,
}: {
  color: string;
  glow?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: 1,
        boxShadow: glow ? `0 0 6px ${glow}33` : undefined,
      }}
    />
  );
}

export default StatStrip;
