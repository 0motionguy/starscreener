// Full slice — every chart type and component the dashboard uses.
//
// Side-effect module: importing this file registers the theme (via ./core)
// and the complete chart/component set. Use this slice on analytical
// surfaces that need bars, scatter, heatmaps, treemaps, radars, data zoom,
// visual maps, mark lines, or a legend — i.e. /signals, /compare,
// repo-detail, /funding, model-usage, consensus.
//
// If your component renders a single line + tooltip, prefer
// ./sparkline — it pulls ~6× less code.

import "./core";
import {
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  TreemapChart,
  RadarChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  RadarComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import * as echarts from "echarts/core";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  TreemapChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  RadarComponent,
  CanvasRenderer,
]);
