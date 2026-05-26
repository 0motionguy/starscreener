"use client";

// CapitalFlowChart renders the 30-day area chart from the mockup. Daily
// dollars are bucketed from funding signals; Series C+ days get markers.
// Client Component because it forwards function props (yFormatter,
// tooltipFormatter) into <AuroraChart> ("use client"). The Server→Client
// boundary cannot serialize functions, so this wrapper has to live
// client-side too.

import { AuroraChart } from "@/components/charts/AuroraChart";
import type { FundingSignal } from "@/lib/funding/types";
import { ensureFundingSignals } from "./fundingDisplayData";

interface CapitalFlowChartProps {
  signals: FundingSignal[];
}

const DAYS = 30;

const BREAKOUT_ROUNDS = new Set([
  "series-c",
  "series-d-plus",
  "growth",
  "ipo",
  "acquisition",
]);

interface Bucket {
  date: Date;
  totalUsd: number;
  topAmount: number;
  topCompany: string;
}

function bucketByDay(signals: FundingSignal[]): Bucket[] {
  const visibleSignals = ensureFundingSignals(signals, 18);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const buckets: Bucket[] = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(startOfToday);
    d.setDate(startOfToday.getDate() - i);
    buckets.push({
      date: d,
      totalUsd: 0,
      topAmount: 0,
      topCompany: "",
    });
  }

  const earliest = buckets[0].date.getTime();
  const dayMs = 86_400_000;

  for (const s of visibleSignals) {
    const ex = s.extracted;
    if (!ex?.amount) continue;
    const t = Date.parse(s.publishedAt);
    if (!Number.isFinite(t) || t < earliest) continue;
    const dayIdx = Math.floor((t - earliest) / dayMs);
    if (dayIdx < 0 || dayIdx >= DAYS) continue;
    const b = buckets[dayIdx];
    b.totalUsd += ex.amount;
    if (ex.amount > b.topAmount && BREAKOUT_ROUNDS.has(ex.roundType)) {
      b.topAmount = ex.amount;
      b.topCompany = ex.companyName;
    }
  }

  return buckets;
}

function formatCurrencyAxis(usd: number): string {
  if (usd >= 1_000_000_000) {
    return `$${(usd / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (usd >= 1_000_000) return `$${Math.round(usd / 1_000_000)}M`;
  return `$${Math.round(usd / 1_000)}K`;
}

function formatTopAmount(usd: number): string {
  if (usd >= 1_000_000_000) {
    return `$${(usd / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  return `$${Math.round(usd / 1_000_000)}M`;
}

function shortDate(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CapitalFlowChart({ signals }: CapitalFlowChartProps) {
  const buckets = bucketByDay(signals);

  // Reshape into the Aurora-friendly data array.
  const data = buckets.map((b) => ({
    d: toIso(b.date),
    totalUsd: b.totalUsd,
    topCompany: b.topCompany,
    topAmount: b.topAmount,
  }));

  // Pick the top-2 breakout days as vertical markers on the chart.
  const breakouts = buckets
    .map((b, i) => ({ ...b, i }))
    .filter((b) => b.topAmount > 0)
    .sort((a, b) => b.topAmount - a.topAmount)
    .slice(0, 2);

  const markers = breakouts.map((b) => ({
    x: toIso(b.date),
    label: `${b.topCompany} ${formatTopAmount(b.topAmount)}`,
  }));

  const firstDate = buckets[0]?.date;
  const lastDate = buckets[DAYS - 1]?.date;

  return (
    <div className="panel fade-up">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 03"}</span>
        <span className="ph-title">Capital flow - 30-day</span>
        <span className="ph-meta">daily $ raised - breakout markers on Series C+</span>
        <div className="ph-actions">
          <div className="share-wrap">
            <button className="share-btn" type="button" aria-label="Share capital flow chart">
              Share
            </button>
            <div className="share-menu">
              <div className="item x" data-share="x" data-text="TrendingRepo Funding Radar capital flow">
                <span className="sm-ico">X</span>Share to X
              </div>
              <div className="item cp" data-share="cp">
                <span className="sm-ico">CP</span>Copy link
              </div>
              <div className="item em" data-share="em">
                <span className="sm-ico">&lt;/&gt;</span>Embed chart<span className="pro-tag">PRO</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flow-chart">
        <AuroraChart
          data={data}
          xKey="d"
          variant="area"
          height={220}
          series={[{ dataKey: "totalUsd", name: "Capital raised" }]}
          markers={markers}
          yFormatter={formatCurrencyAxis}
          tooltipFormatter={formatCurrencyAxis}
          ariaLabel="30-day funding capital flow"
        />
      </div>
      <div className="row between funding-chart-foot">
        <span>{firstDate ? shortDate(firstDate) : "Start"}</span>
        <span>30-day window</span>
        <span>{lastDate ? shortDate(lastDate) : "Today"}</span>
      </div>
    </div>
  );
}
