// IdeasSummaryBar — 4-cell KPI strip below the hero. Numbers come from
// derived counters in the page.

interface IdeasSummaryBarProps {
  totalLive: number;
  reactionsThisWeek: number;
  shippedThisMonth: number;
  topClaimable: number;
}

export function IdeasSummaryBar({
  totalLive,
  reactionsThisWeek,
  shippedThisMonth,
  topClaimable,
}: IdeasSummaryBarProps) {
  const cells = [
    { label: "Live ideas", value: totalLive.toLocaleString(), hint: "published + claimable" },
    { label: "Reactions / wk", value: reactionsThisWeek.toLocaleString(), hint: "build/use/buy/invest" },
    { label: "Shipped this month", value: shippedThisMonth.toLocaleString(), hint: "claimed → shipped" },
    { label: "Top claimable", value: topClaimable.toLocaleString(), hint: "hot, unclaimed, ≤ 7d old" },
  ];

  return (
    <div className="ideas-kpi" role="group" aria-label="Ideas summary">
      {cells.map((c) => (
        <div className="kpi-cell" key={c.label}>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value">{c.value}</div>
          <div className="kpi-hint">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
