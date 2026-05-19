"use client";

// Source-vs-source agreement heatmap. Bins each consensus item by its
// (oursRank, externalRank) decile and counts hits per cell — the diagonal
// is "perfect agreement", off-diagonal cells are divergence.
//
// Migrated from a hand-rolled SVG scatter to ECharts heatmap series via
// the shared <EChart> wrapper. The decile binning gives the canvas an
// honest density map that the eye can read in one glance, instead of
// 100×100 dot soup.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { ConsensusItem } from "@/lib/consensus-trending";
import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";

interface AgreementMatrixProps {
  items: ConsensusItem[];
  /** Top-N to label. Reserved for future label overlay; currently unused
   *  by the heatmap rendering but preserved on the public API for
   *  back-compat with the SVG implementation. */
  labelCount?: number;
}

const BIN_COUNT = 10; // 10×10 decile grid: each cell = 10 ranks wide.
const MAX_RANK = 100;

// Axis labels = decile mid-points. "1-10", "11-20", ... "91-100".
const BIN_LABELS = Array.from({ length: BIN_COUNT }, (_, i) => {
  const lo = i * 10 + 1;
  const hi = (i + 1) * 10;
  return `${lo}-${hi}`;
});

function rankToBin(rank: number): number {
  const clamped = Math.min(MAX_RANK, Math.max(1, rank));
  // Bin 0 = ranks 1-10, bin 9 = ranks 91-100.
  return Math.min(BIN_COUNT - 1, Math.floor((clamped - 1) / 10));
}

export function AgreementMatrix({ items }: AgreementMatrixProps) {
  const { heatmapData, maxCount } = useMemo(() => {
    // Build a dense BIN_COUNT × BIN_COUNT grid of zero counts so every
    // cell renders (ECharts heatmap skips missing coords by default).
    const counts: number[][] = Array.from({ length: BIN_COUNT }, () =>
      new Array<number>(BIN_COUNT).fill(0),
    );

    for (const item of items) {
      const ours = item.oursRank;
      const external = item.externalRank;
      if (ours == null || external == null) continue;
      const xBin = rankToBin(ours);
      const yBin = rankToBin(external);
      counts[xBin][yBin] += 1;
    }

    const data: [number, number, number][] = [];
    let max = 0;
    for (let x = 0; x < BIN_COUNT; x++) {
      for (let y = 0; y < BIN_COUNT; y++) {
        const v = counts[x][y];
        if (v > max) max = v;
        data.push([x, y, v]);
      }
    }
    return { heatmapData: data, maxCount: max };
  }, [items]);

  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { top: 24, right: 56, bottom: 48, left: 72, containLabel: false },
      xAxis: {
        type: "category",
        data: BIN_LABELS,
        name: "OURS RANK",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          fontWeight: 500,
        },
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9,
          interval: 0,
        },
        axisTick: { show: false },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: BIN_LABELS,
        name: "EXTERNAL RANK",
        nameLocation: "middle",
        nameGap: 50,
        nameRotate: 90,
        nameTextStyle: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          fontWeight: 500,
        },
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9,
          interval: 0,
        },
        axisTick: { show: false },
        splitArea: { show: false },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: {
          value: [number, number, number];
          data: [number, number, number];
        }) => {
          const [xBin, yBin, count] = params.value ?? params.data;
          const xLabel = BIN_LABELS[xBin];
          const yLabel = BIN_LABELS[yBin];
          const noun = count === 1 ? "repo" : "repos";
          return `
            <div style="font-family:var(--font-mono),monospace;min-width:160px;">
              <div style="font-size:10px;color:${CHART_TOKENS.textFaint};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">
                Agreement cell
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>Ours rank</span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">#${xLabel}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:${CHART_TOKENS.textSubtle};">
                <span>External rank</span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">#${yLabel}</span>
              </div>
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${CHART_TOKENS.borderDefault};display:flex;justify-content:space-between;gap:12px;font-size:11px;">
                <span style="color:${CHART_TOKENS.textSubtle};">Count</span>
                <span style="color:${CHART_TOKENS.positive};font-variant-numeric:tabular-nums;">${count} ${noun}</span>
              </div>
            </div>
          `;
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, maxCount),
        show: true,
        orient: "vertical",
        right: 8,
        top: "middle",
        itemWidth: 10,
        itemHeight: 120,
        text: ["high", "low"],
        textStyle: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9,
          fontFamily: "var(--font-mono), monospace",
        },
        // Subtle dark → bright accent ramp using brand tokens.
        // bgMuted (cell bg) → bgRaised → accent (orange) → positive (green).
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
          animationDuration: 200,
        },
      ],
    };
  }, [heatmapData, maxCount]);

  return (
    <div className="matrix-wrap">
      <EChart
        option={option}
        height={480}
        ariaLabel="Source-vs-source agreement heatmap"
      />
    </div>
  );
}
