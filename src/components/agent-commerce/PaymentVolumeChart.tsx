"use client";

// PaymentVolumeChart — cumulative x402 settlement timeline.
//
// Inspired by agentic.market's "Total Payment Volume" chart. Renders a
// real area chart from on-chain data we already collect:
//   - getBaseX402Onchain().byDay — daily tx counts per facilitator
//   - getSolanaX402Onchain().byDay — same shape, when present
//
// The screenshot on agentic.market shows sub-minute granularity (e.g.
// 20:04:40 → 20:05:30). We don't have that resolution — our BlockScout
// poller runs daily, so the chart granularity is per-day. To reach
// sub-minute the TOOLBOX collector would need to poll the facilitator
// contracts at higher frequency (~30s) and write timestamped rows.
//
// No fabrication. Empty data → empty state. Dune USD volume isn't
// available locally so the headline is "settlements" (tx count), not USD.
//
// Server component — recomputes at revalidate cadence.

import { AuroraChart, compactNumber } from "@/components/charts/AuroraChart";
import type { BaseX402OnchainFile } from "@/lib/base-x402-onchain";
import type { SolanaX402OnchainFile } from "@/lib/solana-x402-onchain";
import { LiveAgoTicker } from "./LiveAgoTicker";

interface PaymentVolumeChartProps {
  base: BaseX402OnchainFile | null;
  solana: SolanaX402OnchainFile | null;
}

interface DayPoint {
  day: string;
  base: number;
  solana: number;
  total: number;
  cumulative: number;
}

function buildSeries(
  base: BaseX402OnchainFile | null,
  solana: SolanaX402OnchainFile | null,
): DayPoint[] {
  const allDays = new Set<string>();
  if (base?.byDay) Object.keys(base.byDay).forEach((d) => allDays.add(d));
  if (solana?.byDay) Object.keys(solana.byDay).forEach((d) => allDays.add(d));
  const sorted = Array.from(allDays).sort();

  const out: DayPoint[] = [];
  let cumulative = 0;
  for (const day of sorted) {
    const baseTxs = base?.byDay?.[day]?.txs ?? 0;
    const solanaTxs = solana?.byDay?.[day]?.txs ?? 0;
    const total = baseTxs + solanaTxs;
    cumulative += total;
    out.push({ day, base: baseTxs, solana: solanaTxs, total, cumulative });
  }
  return out;
}

function formatDay(day: string): string {
  // "2026-04-30" → "30 Apr"
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  const monthIdx = Number.parseInt(parts[1], 10) - 1;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts[2]} ${months[monthIdx] ?? parts[1]}`;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function PaymentVolumeChart({ base, solana }: PaymentVolumeChartProps) {
  const series = buildSeries(base, solana);
  const totalSettlements = series.length > 0 ? series[series.length - 1].cumulative : 0;
  const topDay = [...series].sort((a, b) => b.total - a.total)[0] ?? null;
  const baseFetched = base?.fetchedAt ?? null;
  const solanaFetched = solana?.fetchedAt ?? null;
  const newestFetched = [baseFetched, solanaFetched]
    .filter(Boolean)
    .sort()
    .reverse()[0] as string | undefined;

  const baseFacilitators = base?.byFacilitator ? Object.keys(base.byFacilitator).length : 0;
  const solanaFacilitators = solana?.byFacilitator ? Object.keys(solana.byFacilitator).length : 0;
  const totalFacilitators = baseFacilitators + solanaFacilitators;

  const feedHealthy = series.length > 0;

  return (
    <section className="pv-chart card">
      <PvChartStyles />

      <div className="pv-head">
        <div className="pv-title">
          <span className="slash">{"//"}</span> x402 settlements &middot; cumulative tx
        </div>
        <span className={`pv-status${feedHealthy ? " live" : " cold"}`}>
          <span className="dot" aria-hidden="true" />
          {feedHealthy ? (
            <>
              {series.length} days · BlockScout ·{" "}
              <LiveAgoTicker fetchedAt={newestFetched ?? null} />
            </>
          ) : (
            "no on-chain data"
          )}
        </span>
      </div>

      {feedHealthy ? (
        <>
          <div className="pv-kpis">
            <div className="pv-kpi pv-kpi--accent">
              <span className="pv-kpi-label">Total settlements</span>
              <span className="pv-kpi-value">{formatCount(totalSettlements)}</span>
              <span className="pv-kpi-sub">cumulative · {series.length}d window</span>
            </div>
            <div className="pv-kpi">
              <span className="pv-kpi-label">Peak day</span>
              <span className="pv-kpi-value">{topDay ? formatCount(topDay.total) : "0"}</span>
              <span className="pv-kpi-sub">{topDay ? formatDay(topDay.day) : "—"}</span>
            </div>
            <div className="pv-kpi">
              <span className="pv-kpi-label">Facilitators</span>
              <span className="pv-kpi-value">{totalFacilitators}</span>
              <span className="pv-kpi-sub">
                {baseFacilitators} base · {solanaFacilitators} solana
              </span>
            </div>
            <div className="pv-kpi">
              <span className="pv-kpi-label">Daily avg</span>
              <span className="pv-kpi-value">
                {formatCount(Math.round(totalSettlements / Math.max(1, series.length)))}
              </span>
              <span className="pv-kpi-sub">tx / day</span>
            </div>
          </div>

          <div className="pv-chart-wrap">
            <AuroraChart
              data={series}
              xKey="day"
              variant="area"
              height={240}
              series={[{ dataKey: "cumulative", name: "Cumulative tx" }]}
              yFormatter={compactNumber}
              tooltipFormatter={compactNumber}
              ariaLabel="x402 cumulative settlements"
            />
          </div>

          <div className="pv-foot">
            <span>
              Source · Base BlockScout v2 API
              {solana ? " + Solana RPC" : ""} · daily aggregate
            </span>
            <span className="grow" />
            <span className="faint">
              sub-minute live = TOOLBOX collector upgrade (see backlog)
            </span>
          </div>
        </>
      ) : (
        <div className="pv-empty">
          No on-chain x402 data in the spine. TOOLBOX base-x402-onchain /
          solana-x402-onchain collectors haven&apos;t written yet.
        </div>
      )}
    </section>
  );
}

function PvChartStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.pv-chart {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: 14px 0;
}
.pv-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.pv-title {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-bright);
  font-weight: 600;
}
.pv-title .slash { color: var(--accent); font-weight: 700; margin-right: 6px; }
.pv-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-faint);
}
.pv-status .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-faint); }
.pv-status.live .dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--up-soft);
  animation: pulse-live 1.6s ease-in-out infinite;
}
.pv-status.cold .dot { background: var(--down); }

.pv-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.pv-kpi {
  background: var(--surface);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.pv-kpi--accent .pv-kpi-value { color: var(--accent); }
.pv-kpi-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: var(--t-control);
  text-transform: uppercase;
  color: var(--fg-subtle);
  font-weight: 600;
}
.pv-kpi-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--fg-bright);
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.pv-kpi-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-faint);
}

.pv-chart-wrap {
  padding: 12px 14px 6px;
}
.pv-chart-wrap svg {
  width: 100%;
  height: auto;
  max-height: 280px;
  display: block;
}

.pv-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg-faint);
  letter-spacing: 0.04em;
}
.pv-foot .grow { flex: 1; }
.pv-foot .faint { color: var(--fg-disabled); }

.pv-empty {
  padding: 24px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-faint);
}

@media (max-width: 900px) {
  .pv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`,
      }}
    />
  );
}
