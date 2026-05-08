// Deprecated: switch consumers to /theme/sparkline (small line charts)
// or /theme/full (analytical charts). Keeping this file for one
// release so any forgotten import path still works.
//
// Importing this module pulls the FULL set of echarts charts/components
// (Radar/Heatmap/Treemap/DataZoom/VisualMap/...) — which is exactly what
// the split is trying to avoid on home-page-class surfaces. Move callers
// to a more specific slice as you touch them.

import "./theme/full";
export * from "./theme/tokens";
export { echarts, TR_DARK_THEME } from "./theme/core";

if (process.env.NODE_ENV !== "production") {
  console.warn(
    "[charts/theme] root import is deprecated — use @/lib/charts/theme/sparkline or /full",
  );
}
