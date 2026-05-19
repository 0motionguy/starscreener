// AccountYouStats — 5-cell .you-stats KPI strip.
// Renders watching / alerts / referrals / drops / compare-runs.

interface Props {
  watching: number;
  watchingCap: number; // -1 = unlimited
  alerts24h: number;
  referralsPaid: number;
  reposDropped: number;
  compareRunsThisWeek: number;
}

function capLabel(cap: number): string {
  return cap < 0 ? "∞" : cap.toString();
}

export function AccountYouStats(props: Props) {
  const {
    watching,
    watchingCap,
    alerts24h,
    referralsPaid,
    reposDropped,
    compareRunsThisWeek,
  } = props;

  return (
    <div className="you-stats">
      <div className="kpi">
        <span className="kpi-label">Watching</span>
        <span className="kpi-value">
          {watching}{" "}
          <span style={{ color: "var(--fg-faint)", fontSize: 14 }}>
            /{capLabel(watchingCap)}
          </span>
        </span>
        <span className="kpi-delta">— private list</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Alerts firing 24h</span>
        <span className="kpi-value">{alerts24h}</span>
        <span className="kpi-delta">— rule-based</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Referrals (invites)</span>
        <span className="kpi-value">{referralsPaid}</span>
        <span className="kpi-delta">— credit counter</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Repos dropped (7d)</span>
        <span className="kpi-value">{reposDropped}</span>
        <span className="kpi-delta">— last week of activity</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Compare runs · wk</span>
        <span className="kpi-value">{compareRunsThisWeek}</span>
        <span className="kpi-delta">— this week</span>
      </div>
    </div>
  );
}
