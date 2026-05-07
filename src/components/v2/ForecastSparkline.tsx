"use client";

// V2 design-system primitive — forecast sparkline with past + future band.
// Past = solid gray area + line. Future = dashed brand mid-line + shaded band.
//
// Migrated from hand-drawn <svg> paths to Apache ECharts via the shared
// <EChart> wrapper. The shape is preserved 1:1: a single time-axis chart
// with three series — past area+line, forecast band (markArea between
// p10/p90 walks), and a dashed forecast mid-line — plus the split marker
// where past ends and forecast begins.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

interface ForecastSparklineProps {
  past: number[];
  currentStars: number;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  horizonDays: number;
  width?: number;
  height?: number;
}

export function ForecastSparkline({
  past,
  currentStars,
  pointEstimate,
  lowP10,
  highP90,
  horizonDays,
  width: _width = 280,
  height = 72,
}: ForecastSparklineProps): React.ReactElement {
  const option = useMemo<EChartsCoreOption>(() => {
    const pastPoints = past.length;
    const lastPast = past[pastPoints - 1] ?? currentStars;

    // Forecast walk: linear interp from lastPast → pointEstimate, with a
    // confidence band that widens with sqrt(t). Mirrors the original
    // hand-rolled geometry so the visual shape is unchanged.
    const lowSpread = pointEstimate - lowP10;
    const highSpread = highP90 - pointEstimate;
    const bandHalf = (highSpread + lowSpread) / 2;

    interface ForecastSample {
      x: number;
      mid: number;
      low: number;
      high: number;
    }

    const forecast: ForecastSample[] = [];
    for (let i = 0; i <= horizonDays; i++) {
      const t = i / horizonDays;
      const mid = lastPast + (pointEstimate - lastPast) * t;
      const halfAtT = bandHalf * Math.sqrt(t);
      forecast.push({
        x: pastPoints + i,
        mid,
        low: mid - halfAtT,
        high: mid + halfAtT,
      });
    }

    // Past series — index axis tuples [i, value]. Area fill renders as the
    // soft gray gradient under the past line.
    const pastSeriesData = past.map(
      (v, i) => [i, v] as [number, number],
    );

    // Forecast band — two stacked-style series. ECharts has no first-class
    // p10/p90 ribbon, so we draw the upper bound (high) as a transparent
    // line and the lower bound (low) as a filled area subtracted from it
    // by stacking on a positive base. Simpler: render two area series with
    // matching gradient stops; the visual fill is between low and high.
    // We use a "low-as-base + high-as-fill-from-base" trick: low is the
    // baseline series with no area, and high carries the area from low.
    const bandLowData = forecast.map(
      (p) => [p.x, p.low] as [number, number],
    );
    const bandHighData = forecast.map(
      (p) => [p.x, p.high] as [number, number],
    );

    const forecastMidData = forecast.map(
      (p) => [p.x, p.mid] as [number, number],
    );

    const splitX = pastPoints - 1;

    return {
      animationDuration: 0,
      grid: {
        top: 2,
        right: 2,
        bottom: 2,
        left: 2,
        containLabel: false,
      },
      xAxis: {
        type: "value",
        min: 0,
        max: pastPoints + horizonDays - 1,
        show: false,
      },
      yAxis: {
        type: "value",
        scale: true,
        show: false,
        // Pad the value axis like the original 12% pad on min/max.
        boundaryGap: ["12%", "12%"] as [string, string],
      },
      // No tooltip / legend — sparkline is decorative-grade.
      tooltip: { show: false },
      series: [
        // 1. Past area — solid soft-gray fill under the past line.
        {
          type: "line" as const,
          name: "past-area",
          data: pastSeriesData,
          showSymbol: false,
          smooth: false,
          lineStyle: {
            color: CHART_TOKENS.textSubtle,
            width: 1.75,
            cap: "round" as const,
            join: "round" as const,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(196, 196, 198, 0.25)" },
                { offset: 1, color: "rgba(196, 196, 198, 0)" },
              ],
            },
          },
          z: 2,
          animationDuration: 0,
        },
        // 2. Forecast band — low boundary (transparent line, used as
        //    stack base for the high series area).
        {
          type: "line" as const,
          name: "band-low",
          data: bandLowData,
          stack: "forecast-band",
          showSymbol: false,
          lineStyle: { width: 0, opacity: 0 },
          itemStyle: { opacity: 0 },
          z: 1,
          animationDuration: 0,
        },
        // 3. Forecast band — high boundary, stacked on band-low so the
        //    area between low and high renders as the orange p10/p90 fill.
        //    ECharts stacks values, so we feed (high - low) here.
        {
          type: "line" as const,
          name: "band-high",
          data: forecast.map(
            (p) => [p.x, p.high - p.low] as [number, number],
          ),
          stack: "forecast-band",
          showSymbol: false,
          lineStyle: { width: 0, opacity: 0 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(245, 110, 15, 0.35)" },
                { offset: 1, color: "rgba(245, 110, 15, 0.05)" },
              ],
            },
          },
          z: 1,
          animationDuration: 0,
        },
        // 4. Forecast mid-line — dashed accent line with glow.
        {
          type: "line" as const,
          name: "forecast-mid",
          data: forecastMidData,
          showSymbol: false,
          smooth: false,
          lineStyle: {
            color: "#F56E0F",
            width: 2,
            type: "dashed" as const,
            cap: "round" as const,
            join: "round" as const,
            shadowColor: "rgba(245, 110, 15, 0.5)",
            shadowBlur: 4,
          },
          z: 4,
          animationDuration: 0,
          // Origin dot at the past/forecast split, pinned to the first
          // forecast point (which equals lastPast).
          markPoint: {
            symbol: "circle",
            symbolSize: 7,
            data: [{ coord: [splitX, lastPast], name: "split" }],
            itemStyle: {
              color: "#F56E0F",
              borderColor: CHART_TOKENS.bgRaised,
              borderWidth: 1.5,
              shadowColor: "rgba(245, 110, 15, 0.8)",
              shadowBlur: 6,
            },
            label: { show: false },
            animation: false,
          },
          // Vertical split line at past→forecast boundary.
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: {
              color: CHART_TOKENS.textDisabled,
              width: 0.5,
              type: "dashed" as const,
            },
            data: [{ xAxis: splitX }],
            label: { show: false },
            animation: false,
          },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [
    past,
    currentStars,
    pointEstimate,
    lowP10,
    highP90,
    horizonDays,
  ]);

  return (
    <EChart
      option={option}
      height={height}
      width="100%"
      ariaLabel="Forecast sparkline"
      className="w-full h-20"
    />
  );
}
