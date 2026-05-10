// Comparison line-chart slice.
//
// Side-effect module: importing this file registers the theme (via ./core)
// plus the ECharts modules required by CompareChart. It intentionally leaves
// out bar/scatter/heatmap/treemap/radar/dataZoom/visualMap/markLine so the
// star-history lazy chart does not pull the full analytical bundle.

import "./core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import * as echarts from "echarts/core";

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);
