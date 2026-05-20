// SignalsKpiStrip - five KPI cells for the Market Signals cockpit.
// Emits the .kpi-strip chrome styled by shell.css. shell.js animates
// [data-counter] values on mount.

interface SignalsKpiStripProps {
  totalMentions: number;
  totalSources: number;
  liveSources: number;
  crossSourceCount: number;
  npmAccelerating: number;
  arxivPapers: number;
  citedRepos: number;
}

export function SignalsKpiStrip({
  totalMentions,
  totalSources,
  liveSources,
  crossSourceCount,
  npmAccelerating,
  arxivPapers,
  citedRepos,
}: SignalsKpiStripProps) {
  return (
    <div className="kpi-strip" style={{ marginBottom: 16 }}>
      <div className="kpi">
        <span className="kpi-label">Total mentions 24h</span>
        <span className="kpi-value" data-counter data-target={totalMentions}>
          {totalMentions.toLocaleString()}
        </span>
        <span className="kpi-delta up">up +18% vs 7d avg</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Cross-source mentions</span>
        <span className="kpi-value" data-counter data-target={crossSourceCount}>
          {crossSourceCount.toLocaleString()}
        </span>
        <span className="kpi-delta up">same repo on 4+ sources</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">arXiv papers ingested</span>
        <span className="kpi-value" data-counter data-target={arxivPapers}>
          {arxivPapers.toLocaleString()}
        </span>
        <span className="kpi-delta up">{citedRepos.toLocaleString()} cite OSS</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">NPM accelerating</span>
        <span className="kpi-value" data-counter data-target={npmAccelerating}>
          {npmAccelerating.toLocaleString()}
        </span>
        <span className="kpi-delta up">+30% weekly dl</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Source rail live</span>
        <span className="kpi-value" data-counter data-target={liveSources}>
          {liveSources.toLocaleString()}
        </span>
        <span className="kpi-delta up">{totalSources.toLocaleString()} sources tracked</span>
      </div>
    </div>
  );
}
