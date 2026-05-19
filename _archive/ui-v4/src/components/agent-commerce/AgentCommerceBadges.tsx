// Agent Commerce — pure server-rendered badge primitives.
//
// Used by the card + detail page. No client state.
// Visual language: square corners (terminal feel), unified padding, design-token
// colors (no bespoke hex), uppercase mono labels.

import type {
  AgentCommerceBadges,
  AgentCommercePricing,
  AgentCommerceProtocol,
} from "@/lib/agent-commerce/types";

const PROTOCOL_TONES: Record<AgentCommerceProtocol, string> = {
  x402: "tone-x402",
  http: "tone-http",
  mcp: "tone-mcp",
  a2a: "tone-a2a",
  rest: "tone-http",
  graphql: "tone-http",
  grpc: "tone-http",
};

const PROTOCOL_LABELS: Record<AgentCommerceProtocol, string> = {
  x402: "x402",
  http: "HTTP",
  mcp: "MCP",
  a2a: "A2A",
  rest: "REST",
  graphql: "GraphQL",
  grpc: "gRPC",
};

export function ProtocolBadge({
  protocol,
}: {
  protocol: AgentCommerceProtocol;
}) {
  return (
    <span className={`ac-proto ${PROTOCOL_TONES[protocol]}`}>
      {PROTOCOL_LABELS[protocol]}
    </span>
  );
}

export function ProtocolList({
  protocols,
}: {
  protocols: AgentCommerceProtocol[];
}) {
  if (protocols.length === 0) return null;
  return (
    <div className="ac-proto-row">
      {protocols.map((p) => (
        <ProtocolBadge key={p} protocol={p} />
      ))}
    </div>
  );
}

export function PricingBadge({ pricing }: { pricing: AgentCommercePricing }) {
  if (pricing.type === "unknown") {
    return <span className="ac-price tone-unknown">pricing unclear</span>;
  }
  const label =
    pricing.type === "per_call"
      ? "per-call"
      : pricing.type === "subscription"
        ? "subscription"
        : "free";
  const tone =
    pricing.type === "per_call"
      ? "tone-percall"
      : pricing.type === "subscription"
        ? "tone-sub"
        : "tone-free";
  return (
    <span className={`ac-price ${tone}`}>
      <span className="ac-price-label">{label}</span>
      {pricing.value ? <em className="ac-price-val">{pricing.value}</em> : null}
    </span>
  );
}

export function CapabilityChips({ capabilities }: { capabilities: string[] }) {
  if (capabilities.length === 0) return null;
  const visible = capabilities.slice(0, 6);
  const overflow = capabilities.length - visible.length;
  return (
    <div className="ac-caps">
      {visible.map((cap) => (
        <span key={cap} className="ac-cap">
          {cap}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="ac-cap ac-cap-more" title={capabilities.slice(6).join(", ")}>
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

export function StatusBadges({ badges }: { badges: AgentCommerceBadges }) {
  // Hide the row entirely when there are no flags rather than rendering an
  // empty container (which used to leave a 4px gap and look broken on cold
  // entries).
  const hasAny =
    badges.x402Enabled ||
    badges.portalReady ||
    badges.mcpServer ||
    badges.agentActionable ||
    badges.verified;
  if (!hasAny) return null;
  return (
    <div className="ac-flags">
      {badges.x402Enabled ? (
        <span className="ac-flag ac-flag-x402" title="x402-enabled">
          x402
        </span>
      ) : null}
      {badges.portalReady ? (
        <span
          className="ac-flag ac-flag-portal"
          title="Portal v0.1 manifest validated"
        >
          Portal Ready
        </span>
      ) : null}
      {badges.mcpServer ? (
        <span className="ac-flag ac-flag-mcp" title="MCP server">
          MCP
        </span>
      ) : null}
      {badges.agentActionable ? (
        <span
          className="ac-flag ac-flag-act"
          title="Agent-callable surface present"
        >
          Agent Actionable
        </span>
      ) : null}
      {badges.verified ? (
        <span className="ac-flag ac-flag-verified" title="Manually verified">
          Verified
        </span>
      ) : null}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const width = Math.max(2, clamped);
  // Tier thresholds map to canonical tokens — high uses Functional Green
  // (the semantic "active/positive/stable" rail), mid uses warning amber,
  // low uses subtle text (still legible — the previous --color-text-faint
  // was nearly invisible against the raised card surface).
  const tone = clamped >= 70 ? "high" : clamped >= 40 ? "mid" : "low";
  return (
    <span
      className={`ac-score-bar tone-${tone}`}
      aria-label={`Composite score ${clamped}`}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <em className="ac-score-fill" style={{ width: `${width}%` }} />
      <strong className="ac-score-num">{clamped}</strong>
    </span>
  );
}
