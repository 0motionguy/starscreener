import { Metric, MetricGrid } from "@/components/ui/Metric";

export interface KpiStripProps {
  totalSignals: number;
  changePct: number | null;
  activeSources: number;
  totalSources: number;
  topTag: string | null;
  topTagDelta: number | null;
  topTagCount: number | null;
  consensusCount: number;
  alphaScore: number;
  alphaDelta: number;
  freshnessLabel: string;
  /** "1H" / "24H" / "7D" / "30D" — drives volume + change-vs-prior copy. */
  windowLabel: string;
}

function formatPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v).toFixed(1).replace(/\.0$/, "");
  return v >= 0 ? `+${abs}%` : `-${abs}%`;
}

function formatDelta(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v}`;
}

export function KpiStrip({
  totalSignals,
  changePct,
  activeSources,
  totalSources,
  topTag,
  topTagDelta,
  topTagCount,
  consensusCount,
  alphaScore,
  alphaDelta,
  freshnessLabel,
  windowLabel,
}: KpiStripProps) {
  const changeTone = changePct !== null && changePct < 0 ? "negative" : "positive";
  const tagTone =
    topTagDelta !== null && topTagDelta < 0 ? "negative" : "positive";
  const alphaTone = alphaDelta < 0 ? "negative" : "accent";

  return (
    <MetricGrid columns={6}>
      <Metric
        label={`Signal volume · ${windowLabel}`}
        value={totalSignals.toLocaleString("en-US")}
        delta={
          <span
            style={{
              color:
                changeTone === "negative"
                  ? "var(--color-negative)"
                  : "var(--color-positive)",
            }}
          >
            {formatPct(changePct)}
          </span>
        }
        sub={`vs prev ${windowLabel}`}
      />
      <Metric
        label="Sources · live"
        value={`${activeSources} / ${totalSources}`}
        sub={
          activeSources === totalSources ? (
            <span style={{ color: "var(--color-positive)" }}>all healthy</span>
          ) : activeSources >= Math.max(1, totalSources - 2) ? (
            <span style={{ color: "var(--color-warning)" }}>
              {totalSources - activeSources} stale
            </span>
          ) : (
            <span style={{ color: "var(--color-negative)" }}>
              {totalSources - activeSources} cold
            </span>
          )
        }
        live={activeSources === totalSources}
      />
      <Metric
        label="Top tag · momentum"
        value={
          <span style={{ fontSize: "15px" }}>
            {topTag ? `#${topTag}` : "—"}
          </span>
        }
        sub={
          topTag && topTagCount !== null
            ? `${formatDelta(topTagDelta)} · ${topTagCount} mentions`
            : "no tags yet"
        }
        tone={tagTone}
      />
      <Metric
        label="Consensus stories"
        value={consensusCount.toLocaleString("en-US")}
        sub="in 3+ sources"
      />
      <Metric
        label="Alpha score"
        value={
          <span style={{ color: "var(--color-accent)" }}>
            {alphaScore.toFixed(1)}
          </span>
        }
        sub={`heat index · ${formatDelta(alphaDelta)}`}
        tone={alphaTone}
      />
      <Metric
        label="Data freshness"
        value={freshnessLabel}
        sub={
          <span style={{ color: "var(--color-positive)" }}>≈ realtime</span>
        }
      />
    </MetricGrid>
  );
}

export default KpiStrip;
