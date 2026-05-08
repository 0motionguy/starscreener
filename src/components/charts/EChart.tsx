"use client";

// Thin React wrapper around Apache ECharts (canvas, tree-shaken core).
//
// Why a custom wrapper instead of using `echarts-for-react` directly:
//   - We control the SSR shape (Next 15 + RSC). The wrapper is "use client"
//     so RSC pages can render <EChart> without a dynamic import dance, and
//     ECharts only init's after the canvas ref mounts in the browser.
//   - We register chart modules + theme once via the side-effect import of
//     ../../lib/charts/theme. Components don't need to remember to register
//     anything; if a session needs a new chart type, edit theme.ts.
//   - ResizeObserver wired so charts reflow with the responsive grid (the
//     dashboard layout shifts column counts at md / lg breakpoints).
//   - `notMerge=true` on every setOption so option changes fully replace
//     prior state — avoids stale series leaking when data shape changes.

import { useEffect, useRef } from "react";
import type { EChartsCoreOption, ECharts } from "echarts/core";
import { TR_DARK_THEME, echarts } from "@/lib/charts/theme/core";

export interface EChartProps {
  option: EChartsCoreOption;
  /** Height in px or any CSS length. Default 280 to match dashboard cards. */
  height?: number | string;
  /** Width override; defaults to 100% of the parent. */
  width?: number | string;
  className?: string;
  /** Optional ARIA label for accessibility. */
  ariaLabel?: string;
  /** Hook into the ECharts instance (e.g. for `getDataURL`). Rare. */
  onReady?: (instance: ECharts) => void;
}

export function EChart({
  option,
  height = 280,
  width = "100%",
  className,
  ariaLabel,
  onReady,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ECharts | null>(null);

  // Initialise the chart once on mount; tear down on unmount.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const instance = echarts.init(node, TR_DARK_THEME, {
      renderer: "canvas",
      // devicePixelRatio honored automatically; explicit override would go here.
    });
    instanceRef.current = instance;
    onReady?.(instance);

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node);

    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
    // onReady is intentionally not in deps — re-running setup on every render
    // would recreate the canvas and lose user interactions (zoom/brush state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push option changes; notMerge=true so removed series actually disappear.
  // Guard against null/undefined options — callers like RepoDetailChart gate
  // JSX rendering on a sparse-data flag, but a dependency-array race can
  // still hand us a null option after the canvas has already mounted.
  // ECharts setOption(null) throws "option must be an object" and surfaces
  // as a route-level 500 during hydration.
  useEffect(() => {
    if (!option) return;
    instanceRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={className}
      style={{ width, height }}
    />
  );
}

export default EChart;
