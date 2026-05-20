const valueCells = [
  {
    title: "Endpoint health monitor",
    desc: "Live status on every x402, MCP, portal endpoint. Get pinged when one degrades.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M5 6h6m-6 3h6" />
      </svg>
    ),
  },
  {
    title: "On-chain alerts",
    desc: "Volume thresholds per facilitator, new endpoint detection, settlement spikes.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M2 13l4-4 3 3 5-7" />
      </svg>
    ),
  },
  {
    title: "Token-economy CSV",
    desc: "Daily price, market cap, and 24h volume snapshots across AI-commerce tokens.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8" r="6" />
      </svg>
    ),
  },
  {
    title: "Dune query API",
    desc: "Direct passthrough to agentic-market Dune queries for internal dashboards.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 8h4l1-3 2 6 1-3h2" />
      </svg>
    ),
  },
];

export function AgentCommerceValueStrip() {
  return (
    <div className="value-strip fade-up">
      {valueCells.map((cell) => (
        <div className="value-cell" key={cell.title}>
          <div className="v-icon">{cell.icon}</div>
          <div className="v-title">{cell.title}</div>
          <div className="v-desc">{cell.desc}</div>
          <span className="v-tag">PRO</span>
        </div>
      ))}
    </div>
  );
}
