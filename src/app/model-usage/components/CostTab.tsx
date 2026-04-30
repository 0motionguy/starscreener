// Cost tab — stacked-bar daily cost by top models, plus footer stats.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChartShell, ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { DailyByModelRow, DailySummaryRow } from "@/lib/llm/types";
import { CostStackedChart } from "./UsageCharts";

interface Props {
  summary: DailySummaryRow[];
  byModel: DailyByModelRow[];
}

const TOP_N = 5;

export function CostTab({ summary, byModel }: Props) {
  // Pick the top N models by total cost over the visible window; everything
  // else folds into 'other'. Stacked-bar UX works best with <=6 series.
  const totals = new Map<string, number>();
  for (const r of byModel) totals.set(r.model, (totals.get(r.model) ?? 0) + r.cost_usd);
  const topModels = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([m]) => m);
  const top = new Set(topModels);

  const days = [...new Set(byModel.map((r) => r.day))].sort();
  const data = days.map((day) => {
    const row: { day: string; [model: string]: number | string } = { day };
    for (const m of topModels) row[m] = 0;
    row.other = 0;
    for (const r of byModel.filter((x) => x.day === day)) {
      const key = top.has(r.model) ? r.model : "other";
      row[key] = (row[key] as number) + r.cost_usd;
    }
    return row;
  });

  const totalCost = summary.reduce((acc, r) => acc + r.cost_usd, 0);
  const estShare = summary.length === 0
    ? 0
    : summary.reduce((acc, r) => acc + r.cost_estimated_share * r.events, 0)
      / Math.max(1, summary.reduce((acc, r) => acc + r.events, 0));

  const series = [...topModels, "other"];
  return (
    <Card variant="panel">
      <CardHeader showCorner right={<span>30d · top {TOP_N} models · USD</span>}>Cost</CardHeader>
      <CardBody>
        <ChartShell variant="chart">
          <ChartWrap variant="chart" style={{ minHeight: 240 }}>
            <CostStackedChart data={data} models={series} />
          </ChartWrap>
          <ChartStats columns={3}>
            <ChartStat label="Total" value={`$${totalCost.toFixed(4)}`} sub="window" />
            <ChartStat label="Estimated" value={`${(estShare * 100).toFixed(0)}%`} sub="of cost" />
            <ChartStat label="Series" value={series.length} sub="models" />
          </ChartStats>
        </ChartShell>
      </CardBody>
    </Card>
  );
}
