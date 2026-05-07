// Agent Commerce — secondary filter bar (category + protocol + pricing + portal-ready).
//
// Server component. Each toggle is a Link that flips the relevant URL param,
// preserving all other state. Multi-select for protocols (comma-joined).

import Link from "next/link";

import type {
  AgentCommerceCategory,
  AgentCommerceProtocol,
} from "@/lib/agent-commerce/types";
import {
  CATEGORIES,
  PRICING_TYPES,
  PROTOCOLS,
  type AgentCommercePricingFilter,
} from "@/lib/agent-commerce/extract";

const CATEGORY_LABELS: Record<AgentCommerceCategory, string> = {
  payments: "Payments",
  data: "Data",
  infra: "Infra",
  marketplace: "Marketplace",
  auth: "Auth",
  inference: "Inference",
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

const PRICING_LABELS: Record<AgentCommercePricingFilter, string> = {
  per_call: "per-call",
  subscription: "subscription",
  free: "free",
};

interface FilterBarProps {
  category: AgentCommerceCategory | null;
  protocols: Set<AgentCommerceProtocol>;
  pricing: AgentCommercePricingFilter | null;
  portalReady: boolean;
  query: string;
  baseQuery: URLSearchParams;
}

function withParam(
  base: URLSearchParams,
  key: string,
  value: string | null,
): string {
  const next = new URLSearchParams(base);
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  return qs ? `/agent-commerce?${qs}` : "/agent-commerce";
}

function toggleProtocol(
  base: URLSearchParams,
  current: Set<AgentCommerceProtocol>,
  proto: AgentCommerceProtocol,
): string {
  const next = new Set(current);
  if (next.has(proto)) next.delete(proto);
  else next.add(proto);
  const value = Array.from(next).join(",");
  return withParam(base, "protocol", value || null);
}

// Count active filters so the bar can show a "clear all" affordance and so we
// can collapse the sidebar rail label when the user has scoped the surface.
function countActive(props: FilterBarProps): number {
  let n = 0;
  if (props.category) n++;
  n += props.protocols.size;
  if (props.pricing) n++;
  if (props.portalReady) n++;
  if (props.query) n++;
  return n;
}

function clearAllHref(base: URLSearchParams): string {
  const next = new URLSearchParams(base);
  next.delete("cat");
  next.delete("protocol");
  next.delete("pricing");
  next.delete("portalready");
  next.delete("q");
  const qs = next.toString();
  return qs ? `/agent-commerce?${qs}` : "/agent-commerce";
}

export function AgentCommerceFilterBar(props: FilterBarProps) {
  const { category, protocols, pricing, portalReady, baseQuery } = props;
  const activeCount = countActive(props);

  return (
    <div className="ac-filterbar" role="group" aria-label="Filters">
      <div className="ac-fb-group">
        <span className="ac-fb-lbl">{"// category"}</span>
        <Link
          className={`ac-chip ${category === null ? "is-on" : ""}`}
          href={withParam(baseQuery, "cat", null)}
        >
          all
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            className={`ac-chip ${category === c ? "is-on" : ""}`}
            href={withParam(baseQuery, "cat", category === c ? null : c)}
          >
            {CATEGORY_LABELS[c]}
          </Link>
        ))}
      </div>

      <div className="ac-fb-group">
        <span className="ac-fb-lbl">{"// protocol"}</span>
        {PROTOCOLS.map((p) => (
          <Link
            key={p}
            className={`ac-chip ac-chip-proto ${protocols.has(p) ? "is-on" : ""}`}
            href={toggleProtocol(baseQuery, protocols, p)}
            data-proto={p}
          >
            {PROTOCOL_LABELS[p]}
          </Link>
        ))}
      </div>

      <div className="ac-fb-group">
        <span className="ac-fb-lbl">{"// pricing"}</span>
        <Link
          className={`ac-chip ${pricing === null ? "is-on" : ""}`}
          href={withParam(baseQuery, "pricing", null)}
        >
          any
        </Link>
        {PRICING_TYPES.map((t) => (
          <Link
            key={t}
            className={`ac-chip ${pricing === t ? "is-on" : ""}`}
            href={withParam(baseQuery, "pricing", pricing === t ? null : t)}
          >
            {PRICING_LABELS[t]}
          </Link>
        ))}
      </div>

      <div className="ac-fb-group ac-fb-group-flag">
        <Link
          className={`ac-chip ac-chip-flag ${portalReady ? "is-on" : ""}`}
          href={withParam(baseQuery, "portalready", portalReady ? null : "1")}
          aria-pressed={portalReady}
        >
          <span className="ac-chip-dot" aria-hidden />
          Portal Ready
        </Link>
        {activeCount > 0 ? (
          <Link
            href={clearAllHref(baseQuery)}
            className="ac-fb-clear"
            aria-label={`Clear ${activeCount} active filters`}
          >
            clear ({activeCount})
          </Link>
        ) : null}
      </div>
    </div>
  );
}
