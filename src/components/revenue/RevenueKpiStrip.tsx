// RevenueKpiStrip — 5-cell KPI strip on /revenue.
// shell.js handles the data-counter animation on data-target ints.

interface RevenueKpiStripProps {
  verifiedStartups: number;
  trackedOssCount: number;
  verifiedThisWeek: number;
  combined30dRevenueUsd: number;
  topMrrUsd: number;
  topMrrName: string | null;
  medianGrowth30dPct: number;
}

function fmtMoney(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

export function RevenueKpiStrip({
  verifiedStartups,
  trackedOssCount,
  verifiedThisWeek,
  combined30dRevenueUsd,
  topMrrUsd,
  topMrrName,
  medianGrowth30dPct,
}: RevenueKpiStripProps) {
  const growthPretty =
    medianGrowth30dPct >= 0
      ? `+${medianGrowth30dPct.toFixed(1)}%`
      : `${medianGrowth30dPct.toFixed(1)}%`;

  return (
    <div className="rev-kpi fade-up">
      <div className="cell">
        <div className="l">Verified startups</div>
        <div
          className="v"
          data-counter
          data-target={String(verifiedStartups)}
        >
          {verifiedStartups.toLocaleString()}
        </div>
        <div className="d">across all categories</div>
      </div>
      <div className="cell">
        <div className="l">Tracked OSS</div>
        <div className="v acc">{trackedOssCount}</div>
        <div className="d up">▲ {verifiedThisWeek} verified this week</div>
      </div>
      <div className="cell">
        <div className="l">Combined 30d revenue</div>
        <div className="v up">{fmtMoney(combined30dRevenueUsd)}</div>
        <div className="d">dev-adjacent filter</div>
      </div>
      <div className="cell">
        <div className="l">Top MRR</div>
        <div className="v up">{fmtMoney(topMrrUsd)}</div>
        <div className="d">
          {topMrrName ? `${topMrrName} · 30d revenue` : "30d revenue"}
        </div>
      </div>
      <div className="cell">
        <div className="l">Median growth-30d</div>
        <div className="v">{growthPretty}</div>
        <div className="d up">▲ healthy market</div>
      </div>
    </div>
  );
}
