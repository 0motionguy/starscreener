"use client";

// 12-tag × 24-hour momentum heatmap.
//
// Migrated from a hand-rolled CSS-grid SVG to ECharts heatmap series via
// the shared <EChart> wrapper. Rows are tags, columns are UTC hours, and
// cell intensity = `pattern[hour]` (a 0..1 share of the tag's volume in
// that hour, computed upstream by buildTagMomentum).
//
// The original CSS-grid version split palette by `trend` (hot/warm = orange,
// cool = cyan). The migrated brief asked for a single continuous color
// ramp using CHART_TOKENS (bgMuted → borderDefault → accent → positive),
// which is what every other migrated heatmap on the dashboard uses for
// visual consistency. The trend classification is still surfaced in the
// tooltip so the signal isn't lost.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import type { TagRow } from "@/lib/signals/tag-momentum";
import { Card, CardHeader } from "@/components/ui/Card";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

export interface TagMomentumHeatmapProps {
  rows: TagRow[];
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i % 4 === 0 ? String(i).padStart(2, "0") : "",
);

export function TagMomentumHeatmap({ rows }: TagMomentumHeatmapProps) {
  const { heatmapData, tagLabels, tagMeta } = useMemo(() => {
    // y-axis is tags. ECharts renders the first y-axis category at the
    // bottom by default; reverse so the highest-volume tag sits at the top
    // of the chart, matching the original DOM order.
    const reversed = [...rows].reverse();
    const labels = reversed.map((r) => `#${r.tag}`);
    const meta = reversed.map((r) => ({
      tag: r.tag,
      count: r.count,
      trend: r.trend,
      delta: r.delta,
    }));

    // Heatmap data is [xHour, yTagIndex, intensity]. ECharts skips cells
    // with no entry, so we emit all 24 even when intensity is 0 — that
    // keeps the grid visually dense (faint cells render as bgMuted).
    const data: [number, number, number][] = [];
    reversed.forEach((row, yIndex) => {
      row.pattern.forEach((v, xHour) => {
        data.push([xHour, yIndex, v]);
      });
    });

    return { heatmapData: data, tagLabels: labels, tagMeta: meta };
  }, [rows]);

  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: {
        top: 8,
        right: 56,
        bottom: 28,
        left: 96,
        containLabel: false,
      },
      xAxis: {
        type: "category",
        data: HOUR_LABELS,
        position: "bottom",
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9,
          interval: 0,
          fontFamily: "var(--font-mono), monospace",
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: tagLabels,
        axisLabel: {
          color: CHART_TOKENS.textDefault,
          fontSize: 10.5,
          fontFamily: "var(--font-mono), monospace",
          formatter: (label: string) => label,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitArea: { show: false },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: {
          value: [number, number, number];
          data: [number, number, number];
        }) => {
          const [xHour, yIndex, intensity] = params.value ?? params.data;
          const meta = tagMeta[yIndex];
          if (!meta) return "";
          const hourLabel = `${String(xHour).padStart(2, "0")}:00 UTC`;
          const pct = Math.round(intensity * 100);
          const trendColor =
            meta.trend === "hot"
              ? CHART_TOKENS.accent
              : meta.trend === "warm"
                ? CHART_TOKENS.warning
                : CHART_TOKENS.cyan;
          return `
            <div style="font-family:var(--font-mono),monospace;min-width:180px;">
              <div style="font-size:10px;color:${CHART_TOKENS.textFaint};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">
                Tag momentum
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>Tag</span>
                <span style="color:${CHART_TOKENS.textDefault};">#${meta.tag}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>Hour</span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${hourLabel}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>Intensity</span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${pct}%</span>
              </div>
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${CHART_TOKENS.borderDefault};display:flex;justify-content:space-between;gap:12px;font-size:11px;">
                <span style="color:${CHART_TOKENS.textSubtle};">Trend</span>
                <span style="color:${trendColor};text-transform:uppercase;letter-spacing:0.08em;">${meta.trend}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>24h count</span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${meta.count}</span>
              </div>
            </div>
          `;
        },
      },
      visualMap: {
        min: 0,
        max: 1,
        show: true,
        orient: "vertical",
        right: 8,
        top: "middle",
        itemWidth: 10,
        itemHeight: 120,
        text: ["hot", "cool"],
        textStyle: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9,
          fontFamily: "var(--font-mono), monospace",
        },
        // Continuous ramp matching the migration spec:
        //   bgMuted → borderDefault → accent → positive.
        // Faint cells fade into the panel background; peaks pop in
        // momentum-orange, strongest cells go positive-green.
        inRange: {
          color: [
            CHART_TOKENS.bgMuted,
            CHART_TOKENS.borderDefault,
            CHART_TOKENS.accent,
            CHART_TOKENS.positive,
          ],
        },
        calculable: false,
      },
      series: [
        {
          type: "heatmap",
          data: heatmapData,
          label: { show: false },
          itemStyle: {
            borderColor: CHART_TOKENS.bgCanvas,
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              borderColor: CHART_TOKENS.textDefault,
              borderWidth: 1.5,
            },
          },
          progressive: 0,
          animationDuration: 0,
        },
      ],
    };
  }, [heatmapData, tagLabels, tagMeta]);

  // Height scales with row count so each tag gets ~22px — matches the
  // CSS-grid version's visual density on the live dashboard.
  const chartHeight = Math.max(180, rows.length * 22 + 40);

  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader
        showCorner
        right={
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  background: CHART_TOKENS.bgMuted,
                  border: `1px solid ${CHART_TOKENS.borderDefault}`,
                  display: "inline-block",
                }}
              />
              cool
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  background: CHART_TOKENS.accent,
                  display: "inline-block",
                }}
              />
              hot
            </span>
          </>
        }
      >
        <span>{"// HEATMAP / MENTIONS PER HOUR"}</span>
        <span
          style={{
            color: "var(--color-text-subtle)",
            marginLeft: 8,
          }}
        >
          / INTENSITY = SHARE OF SIGNAL VOLUME
        </span>
      </CardHeader>

      <div
        className="ds-card-body signals-heatmap-body"
        style={{ padding: "8px 12px 12px" }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              padding: "20px 8px",
              color: "var(--color-text-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
            }}
          >
            no tag momentum yet - collectors warming up
          </div>
        ) : (
          <EChart
            option={option}
            height={chartHeight}
            ariaLabel="Tag momentum heatmap — 12 tags by 24 UTC hours"
          />
        )}
      </div>
    </Card>
  );
}

export default TagMomentumHeatmap;
