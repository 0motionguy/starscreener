// Reliability tab — error-rate area + per-model success ranking.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChartShell, ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { ModelRollup } from "@/lib/llm/derive";
import type { DailySummaryRow } from "@/lib/llm/types";
import { ReliabilityAreaChart } from "./UsageCharts";

interface Props {
  summary: DailySummaryRow[];
  models: ModelRollup[];
}

export function ReliabilityTab({ summary, models }: Props) {
  const data = [...summary]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({
      day: r.day,
      value: r.events === 0 ? 0 : r.errors / r.events,
    }));

  const totalEvents = summary.reduce((acc, r) => acc + r.events, 0);
  const totalErrors = summary.reduce((acc, r) => acc + r.errors, 0);
  const overallErrRate = totalEvents === 0 ? 0 : totalErrors / totalEvents;
  const peakErrDay = summary
    .slice()
    .sort((a, b) =>
      (b.events === 0 ? 0 : b.errors / b.events) - (a.events === 0 ? 0 : a.errors / a.events),
    )[0];
  const peakRate = peakErrDay && peakErrDay.events > 0
    ? peakErrDay.errors / peakErrDay.events
    : 0;

  const rankedRel = [...models]
    .filter((m) => m.model !== "other")
    .sort((a, b) => b.success_rate - a.success_rate);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card variant="panel">
        <CardHeader showCorner right={<span>error rate · 30d</span>}>Reliability</CardHeader>
        <CardBody>
          <ChartShell variant="chart">
            <ChartWrap variant="chart" style={{ minHeight: 240 }}>
              <ReliabilityAreaChart data={data} />
            </ChartWrap>
            <ChartStats columns={3}>
              <ChartStat label="Overall" value={`${(overallErrRate * 100).toFixed(2)}%`} sub="window" />
              <ChartStat label="Peak day" value={`${(peakRate * 100).toFixed(2)}%`} sub={peakErrDay?.day ?? "—"} />
              <ChartStat label="Total errors" value={totalErrors} sub={`of ${totalEvents}`} />
            </ChartStats>
          </ChartShell>
        </CardBody>
      </Card>

      <Card variant="panel">
        <CardHeader showCorner right={<span>by model</span>}>Most reliable</CardHeader>
        <CardBody>
          {rankedRel.length === 0 ? (
            <p style={{ padding: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>No model traffic in the current window.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Events</th>
                  <th style={thStyle}>Errors</th>
                  <th style={thStyle}>Success</th>
                </tr>
              </thead>
              <tbody>
                {rankedRel.slice(0, 12).map((m, i) => (
                  <tr key={m.model}>
                    <td style={tdRightStyle}>#{i + 1}</td>
                    <td style={tdStyle}>{shorten(m.model)}</td>
                    <td style={tdRightStyle}>{m.events.toLocaleString()}</td>
                    <td style={tdRightStyle}>{m.errors}</td>
                    <td style={tdRightStyle}>{(m.success_rate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function shorten(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

const tableStyle = { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 };
const thStyle = {
  textAlign: "left" as const,
  padding: "6px 10px",
  color: "var(--color-text-secondary, #8b9097)",
  borderBottom: "1px solid var(--color-border-subtle, #1f2329)",
  fontWeight: 500,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
  fontSize: 11,
};
const tdStyle = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--color-border-subtle, #1f2329)",
};
const tdRightStyle = { ...tdStyle, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };
