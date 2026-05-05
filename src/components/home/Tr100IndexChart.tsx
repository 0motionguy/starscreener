"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

export interface Tr100Point {
  ts: number;
  value: number;
}

interface Props {
  points: Tr100Point[];
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatTick(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function Tr100IndexChart({ points }: Props) {
  const data = useMemo(
    () => points.filter((p) => Number.isFinite(p.value) && p.value > 0),
    [points],
  );
  const hasEnoughData = data.length >= 2;

  const lwcData = useMemo(
    () =>
      data.map((p) => ({
        time: Math.floor(p.ts / 1000) as UTCTimestamp,
        value: p.value,
      })),
    [data],
  );

  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area", Time> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasEnoughData) return;
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "var(--ink-400, #8a8a8a)",
        attributionLogo: false,
        fontFamily: "var(--font-mono), monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: true, color: "var(--line-200, #1f1f1f)" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "var(--line-300, #2a2a2a)", width: 1, style: 2 },
        horzLine: { color: "var(--line-300, #2a2a2a)", width: 1, style: 2 },
      },
      localization: {
        priceFormatter: (v: number) => formatCompact(v),
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "var(--acc, #ff6a00)",
      topColor: "rgba(255, 106, 0, 0.36)",
      bottomColor: "rgba(255, 106, 0, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.display = "none";
    tooltip.style.zIndex = "20";
    tooltip.style.background = "var(--bg-000, #0a0a0a)";
    tooltip.style.border = "1px solid var(--line-300, #2a2a2a)";
    tooltip.style.padding = "8px 10px";
    tooltip.style.fontFamily = "var(--font-mono), monospace";
    tooltip.style.fontSize = "11px";
    tooltip.style.color = "var(--ink-100, #f6f9fc)";
    tooltip.style.letterSpacing = "0.08em";
    host.appendChild(tooltip);

    chartRef.current = chart;
    seriesRef.current = series;
    tooltipRef.current = tooltip;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      });
    });
    ro.observe(host);

    chart.subscribeCrosshairMove((param) => {
      const t = tooltipRef.current;
      if (!t || !param.time || !param.point) {
        if (t) t.style.display = "none";
        return;
      }
      const price = param.seriesData.get(series) as { value?: number } | undefined;
      if (!price || typeof price.value !== "number") {
        t.style.display = "none";
        return;
      }
      const dateMs = Number(param.time) * 1000;
      t.innerHTML = `<div style="color: var(--ink-400, #8a8a8a); margin-bottom: 4px; text-transform: uppercase;">${formatTick(
        dateMs,
      )}</div><div style="display:flex;justify-content:space-between;gap:12px;"><span style="text-transform:uppercase;">Index</span><span style="font-variant-numeric: tabular-nums;">${formatCompact(
        price.value,
      )}</span></div>`;
      const left = Math.min(param.point.x + 12, host.clientWidth - 140);
      const top = Math.max(8, param.point.y - 46);
      t.style.left = `${left}px`;
      t.style.top = `${top}px`;
      t.style.display = "block";
    });

    return () => {
      ro.disconnect();
      tooltip.remove();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      tooltipRef.current = null;
    };
  }, [hasEnoughData]);

  useEffect(() => {
    if (!hasEnoughData || !seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(lwcData);
    chartRef.current.timeScale().fitContent();
  }, [hasEnoughData, lwcData]);

  if (!hasEnoughData) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 280,
          color: "var(--ink-400, #8a8a8a)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Index warming up - collecting daily snapshots...
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      style={{
        width: "100%",
        height: 280,
        position: "relative",
      }}
    />
  );
}

export default Tr100IndexChart;
