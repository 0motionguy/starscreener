// Features tab — admin only (the page itself is admin-gated).

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { FeatureRollup } from "@/lib/llm/derive";

interface Props {
  features: FeatureRollup[];
}

export function FeaturesTab({ features }: Props) {
  if (features.length === 0) {
    return (
      <Card variant="panel">
        <CardBody>
          <p style={{ padding: 24, color: "var(--color-text-secondary)" }}>
            No feature traffic in the current window.
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card variant="panel">
      <CardHeader showCorner right={<span>internal — admin only</span>}>
        Features
      </CardHeader>
      <CardBody>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Feature</th>
              <th style={thStyle}>Events</th>
              <th style={thStyle}>Usage share</th>
              <th style={thStyle}>Cost</th>
              <th style={thStyle}>Cost share</th>
              <th style={thStyle}>p50</th>
              <th style={thStyle}>p95</th>
              <th style={thStyle}>Success</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.feature}>
                <td style={tdStyle}>{f.feature}</td>
                <td style={tdRightStyle}>{fmtInt(f.events)}</td>
                <td style={tdRightStyle}>{(f.share_usage * 100).toFixed(1)}%</td>
                <td style={tdRightStyle}>{fmtUsd(f.cost_usd)}</td>
                <td style={tdRightStyle}>{(f.share_cost * 100).toFixed(1)}%</td>
                <td style={tdRightStyle}>{fmtLat(f.latency_p50_ms)}</td>
                <td style={tdRightStyle}>{fmtLat(f.latency_p95_ms)}</td>
                <td style={tdRightStyle}>{(f.success_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (!Number.isFinite(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtLat(ms: number): string {
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
