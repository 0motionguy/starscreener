"use client";

import type { EChartsCoreOption } from "echarts/core";

import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";

interface StarHistoryChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
}

export function StarHistoryChart({
  option,
  ariaLabel,
}: StarHistoryChartProps) {
  return <EChart option={option} height={280} ariaLabel={ariaLabel} />;
}

export default StarHistoryChart;
