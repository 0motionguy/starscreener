// AcValueStrip — 4-card value strip for /agent-commerce.
// Pixel-faithful to 09-agent-commerce.html:538-562. Pure JSX, no props,
// no data — these are PRO-tier feature surfaces that don't change per render.
//
// Markup contract: <div class="value-strip fade-up"> with 4 .value-cell
// children, each carrying a .v-icon (inline SVG), .v-title, .v-desc, and
// .v-tag corner badge. shell.css owns the layout (4-col grid, 1px gaps).

export function AcValueStrip() {
  return (
    <div className="value-strip fade-up">
      <div className="value-cell">
        <div className="v-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="12" height="10" rx="1" />
            <path d="M5 6h6m-6 3h6" />
          </svg>
        </div>
        <div className="v-title">Endpoint health monitor</div>
        <div className="v-desc">
          Live status for x402 and portal endpoints. MCP health joins once
          probes are wired.
        </div>
        <span className="v-tag">PRO</span>
      </div>

      <div className="value-cell">
        <div className="v-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M2 13l4-4 3 3 5-7" />
          </svg>
        </div>
        <div className="v-title">On-chain alerts</div>
        <div className="v-desc">
          Volume thresholds per facilitator, new endpoint detection, settlement
          spikes.
        </div>
        <span className="v-tag">PRO</span>
      </div>

      <div className="value-cell">
        <div className="v-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" />
          </svg>
        </div>
        <div className="v-title">Token-economy CSV</div>
        <div className="v-desc">
          Daily snapshot of price + market cap + 24h volume across all
          $AI-COMMERCE tokens.
        </div>
        <span className="v-tag">PRO</span>
      </div>

      <div className="value-cell">
        <div className="v-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3 8h4l1-3 2 6 1-3h2" />
          </svg>
        </div>
        <div className="v-title">Dune query API</div>
        <div className="v-desc">
          Direct passthrough to agentic-market Dune queries — embed in your
          dashboards.
        </div>
        <span className="v-tag">PRO</span>
      </div>
    </div>
  );
}
