// Sparkline slice — minimal echarts modules for tiny line charts.
//
// Side-effect module: importing this file registers the theme (via ./core)
// and the smallest chart/component set needed for a single-series line or
// area chart. Use this slice on any surface where the chart is a line +
// optional areaStyle, with at most a tooltip and an invisible grid.
//
// Why a separate slice: the `full` bundle pulls Radar/Heatmap/Treemap/
// DataZoom/VisualMap and lands ~731 KB raw on every route. /, /signals,
// /githubrepo, /compare, repo-detail all share that chunk. A repo card
// sparkline doesn't need any of those — this slice keeps the home page
// chart chunk closer to ~95 KB.

import "./core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import * as echarts from "echarts/core";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
