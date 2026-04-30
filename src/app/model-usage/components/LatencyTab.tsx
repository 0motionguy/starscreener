// Latency tab — p50 / p95 lines from daily summary.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChartShell, ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { DailyByModelRow, DailySummaryRow } from "@/lib/llm/types";
import { LatencyLineChart } from "./UsageCharts";

interface Props {
  summary: DailySummaryRow[];
  byModel: DailyByModelRow[];
}

export function LatencyTab({ summary, byModel }: Props) {
  const data = [...summary]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ day: r.day, value: r.latency_p50_ms, value2: r.latency_p95_ms }));

  // Worst-case p95 across the window — the SLA-relevant headline number.
  const p95Max = Math.max(0, ...summary.map((r) => r.latency_p95_ms));
  const totalEvents = summary.reduce((acc, r) => acc + r.events, 0);
  const p50Avg = totalEvents === 0
    ? 0
    : Math.round(summary.reduce((acc, r) => acc + r.latency_p50_ms * r.events, 0) / totalEvents);
  const slowModel = byModel
    .slice()
    .sort((a, b) => b.latency_p95_ms - a.latency_p95_ms)[0]?.model ?? "—";

  return (
    <Card variant="panel">
      <CardHeader showCorner right={<span>p50 (green) · p95 (warning)</span>}>Latency</CardHeader>
      <CardBody>
        <ChartShell variant="chart">
          <ChartWrap variant="chart" style={{ minHeight: 240 }}>
            <LatencyLineChart data={data} />
          </ChartWrap>
          <ChartStats columns={3}>
            <ChartStat label="p95 max" value={fmtMs(p95Max)} sub="window" />
            <ChartStat label="p50 wt avg" value={fmtMs(p50Avg)} sub="event-weighted" />
            <ChartStat label="Slowest model" value={shorten(slowModel)} />
          </ChartStats>
        </ChartShell>
      </CardBody>
    </Card>
  );
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shorten(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}
