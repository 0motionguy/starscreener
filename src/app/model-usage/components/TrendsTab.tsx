// Trends tab — daily events area + token volume + a per-day summary table.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChartShell, ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import type { DailyByModelRow, DailySummaryRow } from "@/lib/llm/types";
import { EventsAreaChart } from "./UsageCharts";

interface Props {
  summary: DailySummaryRow[];
  byModel: DailyByModelRow[];
}

export function TrendsTab({ summary, byModel }: Props) {
  const data = [...summary]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ day: r.day, value: r.events }));

  const totalEvents = summary.reduce((acc, r) => acc + r.events, 0);
  const totalTokens = summary.reduce((acc, r) => acc + r.total_tokens, 0);
  const peakDay = [...summary].sort((a, b) => b.events - a.events)[0];
  const uniqueModels = new Set(byModel.map((r) => r.model)).size;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card variant="panel">
        <CardHeader showCorner right={<span>events · 30d</span>}>Volume</CardHeader>
        <CardBody>
          <ChartShell variant="chart">
            <ChartWrap variant="chart" style={{ minHeight: 240 }}>
              <EventsAreaChart data={data} />
            </ChartWrap>
            <ChartStats columns={4}>
              <ChartStat label="Events" value={fmtInt(totalEvents)} sub="window" />
              <ChartStat label="Tokens" value={fmtInt(totalTokens)} sub="total" />
              <ChartStat label="Peak day" value={peakDay ? fmtInt(peakDay.events) : "—"} sub={peakDay?.day ?? "—"} />
              <ChartStat label="Models" value={uniqueModels} sub="unique" />
            </ChartStats>
          </ChartShell>
        </CardBody>
      </Card>

      <Card variant="panel">
        <CardHeader showCorner right={<span>per-day rollup</span>}>Daily</CardHeader>
        <CardBody>
          {summary.length === 0 ? (
            <p style={{ padding: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>
              No daily summaries yet.
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Day</th>
                  <th style={thStyle}>Events</th>
                  <th style={thStyle}>Errors</th>
                  <th style={thStyle}>Tokens</th>
                  <th style={thStyle}>Cost</th>
                  <th style={thStyle}>p95</th>
                  <th style={thStyle}>Models</th>
                </tr>
              </thead>
              <tbody>
                {[...summary].sort((a, b) => b.day.localeCompare(a.day)).map((r) => (
                  <tr key={r.day}>
                    <td style={tdStyle}>{r.day}</td>
                    <td style={tdRightStyle}>{fmtInt(r.events)}</td>
                    <td style={tdRightStyle}>{r.errors}</td>
                    <td style={tdRightStyle}>{fmtInt(r.total_tokens)}</td>
                    <td style={tdRightStyle}>${r.cost_usd.toFixed(4)}</td>
                    <td style={tdRightStyle}>{fmtMs(r.latency_p95_ms)}</td>
                    <td style={tdRightStyle}>{r.models_active}</td>
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

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
