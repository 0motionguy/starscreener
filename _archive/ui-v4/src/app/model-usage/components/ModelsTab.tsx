// Models tab — one card per model with full rollup + metadata.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { ModelRollup } from "@/lib/llm/derive";
import type { ModelMeta } from "@/lib/llm/types";

interface Props {
  models: ModelRollup[];
  metaList: ModelMeta[];
}

export function ModelsTab({ models, metaList }: Props) {
  const metaById = new Map(metaList.map((m) => [m.model_id, m]));
  if (models.length === 0) {
    return (
      <Card variant="panel">
        <CardBody>
          <p style={{ padding: 24, color: "var(--color-text-secondary)" }}>
            No model traffic in the current window.
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <div style={gridStyle}>
      {models.map((m) => {
        const meta = metaById.get(m.model);
        return (
          <Card key={m.model} variant="panel">
            <CardHeader
              showCorner
              right={
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  rank #{m.ranks.usage} usage
                </span>
              }
            >
              {shortenModel(m.model)}
            </CardHeader>
            <CardBody>
              <div style={subhead}>
                <span>{m.provider}</span>
                {meta ? <span>· ctx {fmtCtx(meta.context_length)}</span> : null}
                {meta && (meta.input_price_per_million > 0 || meta.output_price_per_million > 0) ? (
                  <span>
                    · ${meta.input_price_per_million.toFixed(2)} in / $
                    {meta.output_price_per_million.toFixed(2)} out / 1M
                  </span>
                ) : null}
                {meta?.supports_tools ? <Pill>tools</Pill> : null}
                {meta?.supports_vision ? <Pill>vision</Pill> : null}
                {meta?.supports_reasoning ? <Pill>reasoning</Pill> : null}
              </div>
              <dl style={dlStyle}>
                <Stat label="Events" value={fmtInt(m.events)} />
                <Stat label="Usage share" value={`${(m.share_usage * 100).toFixed(1)}%`} />
                <Stat label="Cost" value={fmtUsd(m.cost_usd)} sub={`${(m.cost_estimated_share * 100).toFixed(0)}% est.`} />
                <Stat label="Cost share" value={`${(m.share_cost * 100).toFixed(1)}%`} />
                <Stat label="p50 latency" value={fmtLat(m.latency_p50_ms)} />
                <Stat label="p95 latency" value={fmtLat(m.latency_p95_ms)} />
                <Stat label="Success rate" value={`${(m.success_rate * 100).toFixed(1)}%`} />
                <Stat label="Tokens" value={fmtInt(m.total_tokens)} sub={`in ${fmtInt(m.input_tokens)}`} />
              </dl>
              <div style={ranksStyle}>
                <Rank label="usage" value={m.ranks.usage} />
                <Rank label="cost" value={m.ranks.cost} />
                <Rank label="latency" value={m.ranks.latency} />
                <Rank label="reliability" value={m.ranks.reliability} />
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={statStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>
        <span>{value}</span>
        {sub ? <span style={subStyle}>{sub}</span> : null}
      </dd>
    </div>
  );
}

function Rank({ label, value }: { label: string; value: number }) {
  return (
    <span style={rankItemStyle}>
      <span style={rankLabelStyle}>{label}</span>
      <span style={rankValStyle}>#{value}</span>
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>;
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

function fmtLat(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCtx(ctx: number): string {
  if (!Number.isFinite(ctx) || ctx <= 0) return "—";
  if (ctx < 1000) return String(ctx);
  if (ctx < 1_000_000) return `${Math.round(ctx / 1000)}k`;
  return `${(ctx / 1_000_000).toFixed(1)}M`;
}

function shortenModel(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
  gap: 16,
} as const;
const subhead = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  fontSize: 12,
  color: "var(--color-text-secondary)",
  marginBottom: 16,
};
const dlStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  margin: 0,
};
const statStyle = { display: "grid", gap: 2 };
const dtStyle = {
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  color: "var(--color-text-secondary)",
};
const ddStyle = {
  margin: 0,
  fontVariantNumeric: "tabular-nums" as const,
  display: "flex",
  alignItems: "baseline" as const,
  gap: 6,
};
const subStyle = { fontSize: 11, color: "var(--color-text-secondary)" };
const ranksStyle = {
  display: "flex",
  gap: 12,
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid var(--color-border-subtle, #1f2329)",
  flexWrap: "wrap" as const,
};
const rankItemStyle = { display: "flex", flexDirection: "column" as const, gap: 2 };
const rankLabelStyle = {
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  color: "var(--color-text-secondary)",
};
const rankValStyle = { fontVariantNumeric: "tabular-nums" as const, fontSize: 14 };
const pillStyle = {
  display: "inline-flex",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid var(--color-border-subtle, #1f2329)",
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
};
