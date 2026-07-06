"use client";

// TradingViewCandles — stock candlesticks on TradingView's lightweight-charts.
//
// Operator steer 2026-07-06: "for any stock stuff if you need chart use
// github.com/tradingview/lightweight-charts". This is therefore the
// designated renderer for *stock* OHLC surfaces (AI-stocks panel). The
// recharts-based CandlestickChart stays for static/OG renders and non-stock
// OHLC where Aurora axis chrome matters more than trading UX.
//
// Canvas-based, ~45KB gz, zero deps, Apache-2.0. The TradingView attribution
// logo stays ON (license asks for it — honest attribution, same ethos as
// honest data). Chart creation is useEffect-only so RSC/SSR never touches
// canvas. Empty data renders nothing — no fabricated candles.
//
// Interaction tuning for the right-rail context: crosshair hover works (the
// wow bit), but mouse-wheel zoom + touch drags are disabled so the chart
// never hijacks page scrolling inside a 150px card.

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
} from "lightweight-charts";

import { AURORA } from "./AuroraChart";

export interface StockCandlePoint {
  /** ISO day "YYYY-MM-DD" (UTC) — lightweight-charts business-day string. */
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradingViewCandlesProps {
  data: StockCandlePoint[];
  height?: number;
  /** ISO currency code — "USD" renders $-prefixed prices. Serializable
   *  alternative to a formatter fn so RSC parents can pass it. */
  currency?: string;
  ariaLabel?: string;
}

export function TradingViewCandles({
  data,
  height = 150,
  currency = "USD",
  ariaLabel,
}: TradingViewCandlesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || data.length === 0) return;

    const prefix = currency === "USD" ? "$" : "";
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: AURORA.inkMuted,
        fontSize: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: AURORA.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { labelBackgroundColor: AURORA.lead },
        horzLine: { labelBackgroundColor: AURORA.lead },
      },
      localization: {
        priceFormatter: (p: number) =>
          `${prefix}${p >= 1_000 ? p.toFixed(0) : p.toFixed(2)}`,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: AURORA.up,
      downColor: AURORA.down,
      wickUpColor: AURORA.up,
      wickDownColor: AURORA.down,
      borderVisible: false,
    });
    series.setData(
      data.map((d) => ({
        time: d.day,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    );
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, currency]);

  if (data.length === 0) return null;
  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height }}
    />
  );
}
