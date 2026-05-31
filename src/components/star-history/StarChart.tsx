"use client";

// StarChart — ECharts-backed cumulative-stars area chart.
//
// One canonical chart kind. The visual variety on /tools/star-history comes
// from the 7 registered ECharts themes — see src/lib/charts/public-themes.ts.
// (Apache ECharts ships these themes officially under Apache 2.0; we vendor
// the object literals because the upstream UMD files self-register against a
// global `echarts` that doesn't exist in our scoped ESM setup.)
//
// IMPORTANT — the option is built INSIDE this Client Component, not passed
// in as a prop. ECharts option builders attach `formatter` callbacks, which
// RSC can't serialize across the server→client boundary.

import { useEffect, useMemo, useRef } from "react";

import { echarts } from "@/lib/charts/theme/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkPointComponent,
  MarkLineComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { buildOption, type ChartSeriesInput } from "./buildOption";
import {
  registerPublicThemes,
  type PublicThemeName,
} from "@/lib/charts/public-themes";
import type { StarActivityScale } from "@/lib/star-activity-shared";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkPointComponent,
  MarkLineComponent,
  LegendComponent,
  CanvasRenderer,
]);

// Idempotent — only the first call actually registers.
registerPublicThemes();

interface Props {
  themeName: PublicThemeName;
  /** 1–4 repos rendered as separate line series, painted from the active
   * theme palette (palette index = series index). */
  series: ReadonlyArray<ChartSeriesInput>;
  scale: StarActivityScale;
  /** CSS height of the chart canvas. */
  height: number | string;
  /** Optional aria label for the underlying div. */
  ariaLabel?: string;
}

export function StarChart({
  themeName,
  series,
  scale,
  height,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  const option = useMemo(
    () => buildOption({ series, scale }),
    [series, scale],
  );

  // Re-init when theme name changes — ECharts can't swap themes on an
  // existing canvas, you need a fresh init().
  useEffect(() => {
    if (!ref.current) return;
    if (instRef.current) {
      instRef.current.dispose();
      instRef.current = null;
    }
    const inst = echarts.init(ref.current, themeName, { renderer: "canvas" });
    inst.setOption(option, { notMerge: true });
    instRef.current = inst;

    const handleResize = () => inst.resize();
    window.addEventListener("resize", handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && ref.current) {
      ro = new ResizeObserver(() => inst.resize());
      ro.observe(ref.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
      inst.dispose();
      instRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeName]);

  // Same-theme option updates (window/scale switch).
  useEffect(() => {
    if (instRef.current) {
      instRef.current.setOption(option, { notMerge: false, lazyUpdate: true });
    }
  }, [option]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height }}
    />
  );
}
