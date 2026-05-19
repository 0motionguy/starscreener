// RevenueValueStrip — 4 PRO value cells under the leaderboard.
// Mirrors the .value-strip / .value-cell shell already in shell.css.

export function RevenueValueStrip() {
  return (
    <div className="value-strip fade-up" style={{ marginTop: 16 }}>
      <div className="value-cell">
        <div className="v-icon" aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M2 13l4-4 3 3 5-7" />
          </svg>
        </div>
        <div className="v-title">MRR cohorts + Δ alerts</div>
        <div className="v-desc">
          Weekly cohort table by month. Get pinged when any tracked OSS startup
          crosses a $ threshold or growth rate.
        </div>
        <span className="v-tag">PRO</span>
      </div>
      <div className="value-cell">
        <div className="v-icon" aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M2 4h12v8H2zM2 8h12" />
          </svg>
        </div>
        <div className="v-title">Full TrustMRR CSV</div>
        <div className="v-desc">
          All verified startups with MRR, customers, payment provider, country.
          Updated daily.
        </div>
        <span className="v-tag">PRO</span>
      </div>
      <div className="value-cell">
        <div className="v-icon" aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="8" cy="8" r="6" />
          </svg>
        </div>
        <div className="v-title">Repo-to-revenue join</div>
        <div className="v-desc">
          Match any GitHub repo to a verified startup by domain or homepage
          URL.
        </div>
        <span className="v-tag">PRO</span>
      </div>
      <div className="value-cell">
        <div className="v-icon" aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="8" cy="6" r="3" />
            <path d="M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" />
          </svg>
        </div>
        <div className="v-title">Founder profiles</div>
        <div className="v-desc">
          X-handle attribution per startup. See the people behind the revenue.
          Reach out via verified routes.
        </div>
        <span className="v-tag">PRO</span>
      </div>
    </div>
  );
}
