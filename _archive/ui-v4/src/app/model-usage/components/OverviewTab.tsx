// Overview tab — 6-KPI strip + a top-models snapshot.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import type { FeatureRollup, ModelRollup, OverviewMetrics } from "@/lib/llm/derive";

interface Props {
  overview: OverviewMetrics;
  models: ModelRollup[];
  features: FeatureRollup[];
}

export function OverviewTab({ overview, models, features }: Props) {
  return (
    <section style={sectionStyle}>
      <MetricGrid columns={6} className="kpi-band">
        <Metric label="Events 24h" value={fmtInt(overview.events_24h)} sub="LLM calls" pip />
        <Metric
          label="Cost 24h"
          value={fmtUsd(overview.cost_24h_usd)}
          sub={`${(overview.cost_estimated_share * 100).toFixed(0)}% est.`}
          tone="positive"
          pip
        />
        <Metric label="Models" value={fmtInt(overview.models_active)} sub="active 24h" tone="external" pip />
        <Metric
          label="Top model"
          value={shortenModel(overview.top_model ?? "—")}
          sub={overview.top_model ? "by usage" : "no traffic"}
          tone="accent"
          pip
        />
        <Metric label="p95 latency" value={fmtLatency(overview.p95_latency_ms)} sub="24h" tone="warning" pip />
        <Metric
          label="Error rate"
          value={`${(overview.error_rate_24h * 100).toFixed(1)}%`}
          sub="24h"
          tone={overview.error_rate_24h > 0.05 ? "negative" : "positive"}
          pip
        />
      </MetricGrid>

      <div style={twoColStyle}>
        <Card variant="panel">
          <CardHeader showCorner right={<span>top by usage</span>}>
            Models
          </CardHeader>
          <CardBody>
            {models.length === 0 ? (
              <p style={emptyStyle}>No model traffic yet.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Model</th>
                    <th style={thStyle}>Events</th>
                    <th style={thStyle}>Share</th>
                    <th style={thStyle}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {models.slice(0, 8).map((m) => (
                    <tr key={m.model}>
                      <td style={tdStyle}>{shortenModel(m.model)}</td>
                      <td style={tdRightStyle}>{fmtInt(m.events)}</td>
                      <td style={tdRightStyle}>{(m.share_usage * 100).toFixed(1)}%</td>
                      <td style={tdRightStyle}>{fmtUsd(m.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card variant="panel">
          <CardHeader showCorner right={<span>internal — admin only</span>}>
            Features
          </CardHeader>
          <CardBody>
            {features.length === 0 ? (
              <p style={emptyStyle}>No feature traffic yet.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Feature</th>
                    <th style={thStyle}>Events</th>
                    <th style={thStyle}>Share</th>
                    <th style={thStyle}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {features.slice(0, 8).map((f) => (
                    <tr key={f.feature}>
                      <td style={tdStyle}>{f.feature}</td>
                      <td style={tdRightStyle}>{fmtInt(f.events)}</td>
                      <td style={tdRightStyle}>{(f.share_usage * 100).toFixed(1)}%</td>
                      <td style={tdRightStyle}>{fmtUsd(f.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortenModel(model: string): string {
  // 'anthropic/claude-3.5-sonnet' → 'claude-3.5-sonnet'.
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

const sectionStyle = { display: "grid", gap: 16 } as const;
const twoColStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
} as const;
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
const emptyStyle = { padding: 16, color: "var(--color-text-secondary, #8b9097)", fontSize: 13 };
