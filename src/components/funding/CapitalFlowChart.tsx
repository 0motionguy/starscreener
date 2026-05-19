// CapitalFlowChart — server-rendered 30-day area chart.
// Daily $ raised bucketed from signals[].publishedAt + extracted.amount.
// Series C+ rounds get vertical dashed marker lines (`.marker`).

import type { FundingSignal } from "@/lib/funding/types";

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
  /** Largest single round in the bucket (for breakout marker label). */
  topAmount: number;
  topCompany: string;
  topRoundType: string;
}

function bucketByDay(signals: FundingSignal[]): Bucket[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const buckets: Bucket[] = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(startOfToday);
    d.setDate(startOfToday.getDate() - i);
    buckets.push({
      date: d,
      totalUsd: 0,
      topAmount: 0,
      topCompany: "",
      topRoundType: "",
    });
  }

  const earliest = buckets[0].date.getTime();

  for (const s of signals) {
    const ex = s.extracted;
    if (!ex || !ex.amount) continue;
    const t = Date.parse(s.publishedAt);
    if (!Number.isFinite(t) || t < earliest) continue;
    const dayMs = 86_400_000;
    const dayIdx = Math.floor((t - earliest) / dayMs);
    if (dayIdx < 0 || dayIdx >= DAYS) continue;
    const b = buckets[dayIdx];
    b.totalUsd += ex.amount;
    if (ex.amount > b.topAmount && BREAKOUT_ROUNDS.has(ex.roundType)) {
      b.topAmount = ex.amount;
      b.topCompany = ex.companyName;
      b.topRoundType = ex.roundType;
    }
  }

  return buckets;
}

function formatCurrencyAxis(usd: number): string {
  if (usd >= 1_000_000_000) {
    return `$${(usd / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (usd >= 1_000_000) {
    return `$${Math.round(usd / 1_000_000)}M`;
  }
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
  // Round axis up to a nice number (1.25× of peak, then format).
  const axisCeiling = Math.max(1, peakUsd * 1.15);

  const innerW = VB_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const scaleX = (i: number) =>
    PAD_LEFT + (i / Math.max(1, DAYS - 1)) * innerW;
  const scaleY = (v: number) => PAD_TOP + innerH * (1 - v / axisCeiling);

  // Build line + area paths
  const linePts = buckets.map(
    (b, i) => `${scaleX(i).toFixed(2)},${scaleY(b.totalUsd).toFixed(2)}`,
  );
  const lineD = `M${linePts.join(" L")}`;
  const baselineY = scaleY(0);
  const areaD = `M${scaleX(0).toFixed(2)},${baselineY.toFixed(2)} L${linePts.join(" L")} L${scaleX(DAYS - 1).toFixed(2)},${baselineY.toFixed(2)} Z`;

  // Pick top 2 breakout markers (Series C+)
  const breakouts = buckets
    .map((b, i) => ({ ...b, i }))
    .filter((b) => b.topAmount > 0)
    .sort((a, b) => b.topAmount - a.topAmount)
    .slice(0, 2);

  // Top-3 points to dot
  const topPts = buckets
    .map((b, i) => ({ b, i }))
    .sort((a, b) => b.b.totalUsd - a.b.totalUsd)
    .slice(0, 3);

  const firstDate = buckets[0]?.date;
  const lastDate = buckets[DAYS - 1]?.date;

  // Y-axis labels — 5 horizontal lines
  const ySteps = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="panel fade-up">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 03"}</span>
        <span className="ph-title">Capital flow · 30-day</span>
        <span className="ph-meta">
          daily $ raised · breakout markers on Series C+
        </span>
      </div>
      <div className="flow-chart">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
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
              <text
                key={step}
                x={PAD_LEFT - 4}
                y={scaleY(axisCeiling * step) + 2}
                textAnchor="end"
              >
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
              <text
                x={scaleX(b.i) + 4}
                y={PAD_TOP + 12}
                className="marker-label"
              >
                {b.topCompany} {formatTopAmount(b.topAmount)}
              </text>
            </g>
          ))}
          <g>
            {topPts.map(({ b, i }) => (
              <circle
                key={i}
                cx={scaleX(i)}
                cy={scaleY(b.totalUsd)}
                r={3}
                className="pt"
              />
            ))}
          </g>
        </svg>
      </div>
      <div
        className="row between"
        style={{
          padding: "8px 16px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--fg-muted)",
        }}
      >
        <span>{firstDate ? shortDate(firstDate) : "—"}</span>
        <span>30-day window</span>
        <span>{lastDate ? shortDate(lastDate) : "—"}</span>
      </div>
    </div>
  );
}
