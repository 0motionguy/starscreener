// CapitalFlowChart renders the server-side 30-day area chart from the mockup.
// Daily dollars are bucketed from funding signals; Series C+ days get markers.

import type { FundingSignal } from "@/lib/funding/types";
import { ensureFundingSignals } from "./fundingDisplayData";

interface CapitalFlowChartProps {
  signals: FundingSignal[];
}

const DAYS = 30;
const VB_W = 800;
const VB_H = 200;
const PAD_LEFT = 40;
const PAD_RIGHT = 10;
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

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

export function CapitalFlowChart({ signals }: CapitalFlowChartProps) {
  const buckets = bucketByDay(signals);
  const peakUsd = Math.max(1, ...buckets.map((b) => b.totalUsd));
  const axisCeiling = Math.max(1, peakUsd * 1.15);

  const innerW = VB_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const scaleX = (i: number) => PAD_LEFT + (i / Math.max(1, DAYS - 1)) * innerW;
  const scaleY = (v: number) => PAD_TOP + innerH * (1 - v / axisCeiling);

  const linePts = buckets.map(
    (b, i) => `${scaleX(i).toFixed(2)},${scaleY(b.totalUsd).toFixed(2)}`,
  );
  const lineD = `M${linePts.join(" L")}`;
  const baselineY = scaleY(0);
  const areaD = `M${scaleX(0).toFixed(2)},${baselineY.toFixed(2)} L${linePts.join(
    " L",
  )} L${scaleX(DAYS - 1).toFixed(2)},${baselineY.toFixed(2)} Z`;

  const breakouts = buckets
    .map((b, i) => ({ ...b, i }))
    .filter((b) => b.topAmount > 0)
    .sort((a, b) => b.topAmount - a.topAmount)
    .slice(0, 2);

  const topPts = buckets
    .map((b, i) => ({ b, i }))
    .sort((a, b) => b.b.totalUsd - a.b.totalUsd)
    .slice(0, 3);

  const ySteps = [1, 0.75, 0.5, 0.25, 0];
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
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img">
          <title>30-day funding capital flow</title>
          <g className="grid">
            {ySteps.map((step) => (
              <line
                key={step}
                x1={PAD_LEFT}
                y1={scaleY(axisCeiling * step)}
                x2={VB_W}
                y2={scaleY(axisCeiling * step)}
              />
            ))}
          </g>
          <g className="axis">
            {ySteps.map((step) => (
              <text key={step} x={PAD_LEFT - 4} y={scaleY(axisCeiling * step) + 2} textAnchor="end">
                {formatCurrencyAxis(axisCeiling * step)}
              </text>
            ))}
          </g>
          <path className="area" d={areaD} />
          <path className="line" d={lineD} />
          {breakouts.map((b) => (
            <g key={`${b.i}-${b.topCompany}`}>
              <line
                x1={scaleX(b.i)}
                y1={PAD_TOP}
                x2={scaleX(b.i)}
                y2={VB_H - PAD_BOTTOM}
                className="marker"
              />
              <text x={scaleX(b.i) + 4} y={PAD_TOP + 12} className="marker-label">
                {b.topCompany} {formatTopAmount(b.topAmount)}
              </text>
            </g>
          ))}
          <g>
            {topPts.map(({ b, i }) => (
              <circle key={i} cx={scaleX(i)} cy={scaleY(b.totalUsd)} r={3} className="pt" />
            ))}
          </g>
        </svg>
      </div>
      <div className="row between funding-chart-foot">
        <span>{firstDate ? shortDate(firstDate) : "Start"}</span>
        <span>30-day window</span>
        <span>{lastDate ? shortDate(lastDate) : "Today"}</span>
      </div>
    </div>
  );
}
