"use client";

// Consensus radar — eight-source firing pattern across the top
// ConsensusStory[] from src/lib/signals/consensus.ts.
//
// Migrated from a vertical sparkline list (inline SVG) to an Apache ECharts
// radar via the shared <EChart> wrapper. The panel slot was always titled
// "// 02 CONSENSUS RADAR" but the prior implementation rendered a list,
// not a radar — this migration makes the visual match the label.
//
// Each indicator axis is one source (HN / GitHub / X / Reddit / Bluesky /
// Dev.to / Claude RSS / OpenAI RSS). Each story is one polygon. Per-axis
// value = sum of capped signalScore for items in that story coming from
// that source. The polygon shape immediately answers "which sources are
// firing for this topic?" — a small, lopsided polygon means narrow
// consensus; a fat polygon means cross-channel breakout.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import type { ConsensusStory } from "@/lib/signals/consensus";
import type { SourceKey } from "@/lib/signals/types";
import { Card, CardHeader } from "@/components/ui/Card";
import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_PALETTE, CHART_TOKENS } from "@/lib/charts/theme/tokens";

// Axis order matches the cross-source filter rail above this panel so the
// eye lands on the same slot for the same source between widgets.
const SOURCE_AXES: { key: SourceKey; label: string }[] = [
  { key: "hn",      label: "HN" },
  { key: "github",  label: "GITHUB" },
  { key: "x",       label: "X" },
  { key: "reddit",  label: "REDDIT" },
  { key: "bluesky", label: "BLUESKY" },
  { key: "devto",   label: "DEV.TO" },
  { key: "claude",  label: "CLAUDE" },
  { key: "openai",  label: "OPENAI" },
];

// HTML-escape so story titles with quotes / brackets don't break the
// tooltip render (formatter returns raw HTML).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Per-story per-source intensity = sum of capped signalScore. Same cap
// (100) used in buildConsensus() so a single-source spike can't dominate.
function sourceIntensity(story: ConsensusStory): Record<SourceKey, number> {
  const out: Record<SourceKey, number> = {
    hn: 0,
    github: 0,
    x: 0,
    reddit: 0,
    bluesky: 0,
    devto: 0,
    claude: 0,
    openai: 0,
  };
  for (const item of story.items) {
    out[item.source] += Math.min(100, item.signalScore);
  }
  return out;
}

export interface ConsensusRadarProps {
  stories: ConsensusStory[];
  totalActive: number;
}

export function ConsensusRadar({ stories, totalActive }: ConsensusRadarProps) {
  // Right-side count copy depends on how many strong (3+ source) stories
  // we have vs how many "near-consensus" rows are padding the panel.
  const nearCount = stories.length - totalActive;
  const headerRight =
    totalActive === 0
      ? `${stories.length} NEAR`
      : nearCount > 0
        ? `${totalActive} ACTIVE · ${nearCount} NEAR`
        : `${totalActive} ACTIVE`;

  // Subtitle changes when we're in fallback mode so the user knows the
  // panel isn't claiming false consensus.
  const subtitle =
    totalActive === 0
      ? "· NO CONSENSUS YET · TOP SINGLE-SOURCE SIGNALS"
      : "· STORIES IN 3+ SOURCES";

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (stories.length === 0) return null;

    // Derive per-story per-axis values. Build values[] in SOURCE_AXES order.
    const seriesData = stories.map((story, idx) => {
      const intensity = sourceIntensity(story);
      const value = SOURCE_AXES.map((axis) => intensity[axis.key]);
      // Top story gets the brand accent; subsequent stories cycle the
      // theme palette starting at index 1 so we don't double-orange.
      const color =
        idx === 0
          ? CHART_TOKENS.accent
          : CHART_PALETTE[idx % CHART_PALETTE.length];
      return {
        value,
        name: story.title,
        // Carry the raw counts so the tooltip can show source breakdown
        // without recomputing from props.
        intensity,
        sourceCount: story.sources.length,
        score: story.score,
        delta: story.delta,
        color,
      };
    });

    // Global max with +10% headroom so the strongest polygon doesn't
    // touch the outer ring. Floor at 100 so a low-volume window still
    // shows a meaningful grid.
    const observedMax = seriesData.reduce(
      (acc, s) => Math.max(acc, ...s.value),
      0,
    );
    const axisMax = Math.max(100, Math.ceil((observedMax * 1.1) / 10) * 10);

    return {
      // Radar panel sits inside a card body — small padding all around so
      // the polygon breathes without overflowing the indicator labels.
      radar: {
        indicator: SOURCE_AXES.map((axis) => ({
          name: axis.label,
          max: axisMax,
        })),
        shape: "polygon",
        splitNumber: 4,
        center: ["50%", "54%"],
        radius: "66%",
        axisName: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          fontFamily:
            'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
          // Letter-spacing reads as terminal-typography against the dark
          // panel; matches the .ds-card-header label styling.
          padding: [2, 4],
        },
        axisLine: {
          lineStyle: { color: CHART_TOKENS.borderSubtle },
        },
        splitLine: {
          lineStyle: { color: CHART_TOKENS.borderSubtle },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: [
              "rgba(20, 26, 32, 0.0)",
              "rgba(20, 26, 32, 0.35)",
            ],
          },
        },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: CHART_TOKENS.bgCanvas,
        borderColor: CHART_TOKENS.borderDefault,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: {
          color: CHART_TOKENS.textDefault,
          fontSize: 11,
          fontFamily:
            'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
        },
        extraCssText: "letter-spacing: 0.04em; box-shadow: none;",
        // ECharts radar item-trigger fires per polygon. params.data carries
        // the SeriesDatum we attached above.
        formatter: (params: unknown) => {
          const p = params as {
            color?: string;
            data?: {
              name?: string;
              intensity?: Record<SourceKey, number>;
              sourceCount?: number;
              score?: number;
              delta?: number;
            };
          };
          const d = p.data;
          if (!d) return "";
          const intensity = d.intensity ?? ({} as Record<SourceKey, number>);
          const rows = SOURCE_AXES.filter((a) => (intensity[a.key] ?? 0) > 0)
            .map(
              (a) => `
                <li style="display:flex;justify-content:space-between;gap:14px;font-size:10px;">
                  <span style="color:${CHART_TOKENS.textSubtle};">${a.label}</span>
                  <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${(intensity[a.key] ?? 0).toFixed(0)}</span>
                </li>`,
            )
            .join("");
          const deltaLabel =
            (d.delta ?? 0) > 0
              ? `+${d.delta}`
              : (d.delta ?? 0) < 0
                ? `${d.delta}`
                : "±0";
          const deltaColor =
            (d.delta ?? 0) > 0
              ? CHART_TOKENS.positive
              : (d.delta ?? 0) < 0
                ? CHART_TOKENS.negative
                : CHART_TOKENS.textFaint;
          return `
            <div style="min-width:220px;font-family:var(--font-mono),monospace;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color ?? CHART_TOKENS.accent};"></span>
                <span style="font-size:11px;color:${CHART_TOKENS.textDefault};line-height:1.3;">${escapeHtml(d.name ?? "")}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:6px;font-size:10px;color:${CHART_TOKENS.textFaint};">
                <span>${d.sourceCount ?? 0} SOURCES</span>
                <span>SCORE <span style="color:${CHART_TOKENS.textDefault};">${(d.score ?? 0).toFixed(1)}</span> <span style="color:${deltaColor};">${deltaLabel}</span></span>
              </div>
              ${rows ? `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px;border-top:1px solid ${CHART_TOKENS.borderDefault};padding-top:6px;">${rows}</ul>` : ""}
            </div>
          `;
        },
      },
      series: [
        {
          type: "radar",
          // notMerge in <EChart> swaps the whole option, so we don't need
          // to clear stale series here.
          symbol: "circle",
          symbolSize: 4,
          // Per-polygon stroke + fill colours. ECharts respects itemStyle
          // .color on the inner data records.
          data: seriesData.map((s) => ({
            value: s.value,
            name: s.name,
            intensity: s.intensity,
            sourceCount: s.sourceCount,
            score: s.score,
            delta: s.delta,
            lineStyle: { color: s.color, width: s === seriesData[0] ? 2 : 1.4 },
            itemStyle: { color: s.color },
            // Low-alpha fill so overlapping polygons remain readable. Top
            // story gets a slightly stronger fill to read as the lead.
            areaStyle: {
              color: s === seriesData[0]
                ? "rgba(255,107,53,0.22)"
                : (() => {
                    // Convert hex → rgba(…, 0.10). Hex chars come from
                    // CHART_PALETTE so the slice is safe.
                    const hex = s.color.replace("#", "");
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    return `rgba(${r},${g},${b},0.10)`;
                  })(),
            },
          })),
          animationDuration: 0,
        },
      ],
    };
  }, [stories]);

  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader showCorner right={<span>{headerRight}</span>}>
        <span>{"// 02 CONSENSUS RADAR"}</span>
        <span style={{ color: "var(--color-text-subtle)", marginLeft: "8px" }}>
          {subtitle}
        </span>
      </CardHeader>

      <div className="ds-card-body" style={{ padding: 0 }}>
        {option === null ? (
          <div
            style={{
              padding: "24px 14px",
              color: "var(--color-text-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
            }}
          >
            no signals yet — collectors warming up
          </div>
        ) : (
          <div style={{ padding: "8px 6px 12px" }}>
            <EChart
              option={option}
              height={320}
              ariaLabel={`Consensus radar — ${stories.length} stories across ${SOURCE_AXES.length} sources`}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

export default ConsensusRadar;
