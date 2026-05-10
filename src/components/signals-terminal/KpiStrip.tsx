import { Metric, MetricGrid } from "@/components/ui/Metric";

export interface KpiStripProps {
  totalSignals: number;
  changePct: number | null;
  /** Count of sources currently classified as "live" by classifyFreshness().
   *  We do NOT render this as `N / 8` — broadcasting "3/8" trains users to
   *  read the surface as broken. Render the live count as a positive number
   *  and tuck the cold roster into a collapsed disclosure. (M5, 2026-05-10) */
  activeSources: number;
  /** Source keys that are currently cold. Hidden by default behind a
   *  `<details>` so a user who wants the transparency can open it, but the
   *  first-paint chrome doesn't advertise the breakage. Pass `[]` when no
   *  sources are cold and the disclosure won't render. */
  coldSources?: readonly string[];
  topTag: string | null;
  topTagDelta: number | null;
  topTagCount: number | null;
  consensusCount: number;
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
  coldSources = [],
  topTag,
  topTagDelta,
  topTagCount,
  consensusCount,
  freshnessLabel,
  windowLabel,
}: KpiStripProps) {
  const changeTone = changePct !== null && changePct < 0 ? "negative" : "positive";
  const tagTone =
    topTagDelta !== null && topTagDelta < 0 ? "negative" : "positive";

  // Alpha-score / heat-index KPI removed (2026-05-03) — the "alpha score" /
  // "heat index" framing read as market-data on a code-trends newsroom.
  // Code-trend KPIs (volume, sources live, top tag, consensus, freshness)
  // stay; the consensus radar already surfaces story-level intensity.

  // M5 (2026-05-10): "Sources · live" used to render `activeSources / 8` and a
  // bright "{cold} cold" sub-line. Operator feedback: that broadcasts the
  // surface's own brokenness on first paint. New shape — a bare count + a
  // collapsed disclosure that lists cold sources only when expanded. Cold
  // information stays accessible (transparency rule) without being chrome.
  const coldCount = coldSources.length;

  return (
    <MetricGrid columns={5}>
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
        label="Live today"
        value={activeSources.toLocaleString("en-US")}
        sub={
          coldCount > 0 ? (
            <details
              style={{
                display: "inline",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "11px",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  color: "var(--color-muted, #888)",
                  outline: "none",
                }}
              >
                status
              </summary>
              <span
                style={{
                  display: "inline-block",
                  marginLeft: 6,
                  color: "var(--color-muted, #888)",
                }}
              >
                {coldSources.join(" · ")}
              </span>
            </details>
          ) : (
            <span style={{ color: "var(--color-positive)" }}>all healthy</span>
          )
        }
        live={coldCount === 0 && activeSources > 0}
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
