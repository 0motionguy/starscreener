// Theme registration core — runs `echarts.registerTheme(...)` exactly once at
// module load. No charts/components are pulled in here; that's the caller's
// job (via /sparkline or /full slices) so the bundle only carries what the
// route actually renders.
//
// Re-exports the echarts core namespace + TR_DARK_THEME so consumers that
// only need `echarts.init(...)` + the theme name can import from one place
// without dragging the whole-charts side-effect.

import * as echarts from "echarts/core";
import { trendingrepoDark, TR_DARK_THEME } from "./tokens";

echarts.registerTheme(TR_DARK_THEME, trendingrepoDark);

export { echarts, TR_DARK_THEME };
