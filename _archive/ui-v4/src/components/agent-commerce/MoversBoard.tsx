// Agent Commerce — composite movers board (v4 rebuild).
//
// Drops the previous sparkline rail (synthetic until score-history collector
// lands — operator pulled it). Each row is a v4 mover row with rank, name,
// protocol/category meta, composite score, and pricing pill. Linked to the
// per-entity page.

import Link from "next/link";

import type { AgentCommerceItem, AgentCommerceProtocol } from "@/lib/agent-commerce/types";

interface MoversBoardProps {
  items: AgentCommerceItem[];
}

const PROTOCOL_LABEL: Record<AgentCommerceProtocol, string> = {
  x402: "x402",
  http: "HTTP",
  mcp: "MCP",
  a2a: "A2A",
  rest: "REST",
  graphql: "GraphQL",
  grpc: "gRPC",
};

const PROTOCOL_CLASS: Record<AgentCommerceProtocol, string> = {
  x402: "ac-mr-proto--x402",
  http: "ac-mr-proto--http",
  mcp: "ac-mr-proto--mcp",
  a2a: "ac-mr-proto--a2a",
  rest: "ac-mr-proto--http",
  graphql: "ac-mr-proto--http",
  grpc: "ac-mr-proto--http",
};

function scoreToneClass(score: number): string {
  if (score >= 60) return "ac-mr-score--high";
  if (score >= 40) return "ac-mr-score--mid";
  return "ac-mr-score--low";
}

function pricingLabel(type: string): string {
  if (type === "unknown") return "—";
  return type.replace("_", " ");
}

export function MoversBoard({ items }: MoversBoardProps) {
  if (items.length === 0) {
    return (
      <div className="ac-board-empty">
        <p>No composite movers yet — collector warming up.</p>
      </div>
    );
  }
  return (
    <section className="ac-movers-board" aria-label="Composite movers">
      {items.map((item, idx) => {
        const score = item.scores.composite;
        const toneCls = scoreToneClass(score);
        return (
          <Link
            key={item.id}
            href={`/agent-commerce/${item.slug}`}
            className={`ac-mover-row ${idx === 0 ? "is-first" : ""}`}
          >
            <span className="ac-mover-row__rank">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <div className="ac-mover-row__body">
              <div className="ac-mover-row__name">{item.name}</div>
              <div className="ac-mover-row__meta">
                <span className="v2-mono ac-mover-row__kind">{item.kind}</span>
                <span className="ac-mover-row__sep" aria-hidden>
                  ·
                </span>
                <span>{item.category}</span>
                {item.protocols.slice(0, 3).map((p) => (
                  <span
                    key={p}
                    className={`v2-mono ac-mover-row__proto ${PROTOCOL_CLASS[p]}`}
                  >
                    {PROTOCOL_LABEL[p]}
                  </span>
                ))}
              </div>
            </div>
            <span className={`ac-mover-row__score ${toneCls}`}>
              {score}
              <span className="ac-mover-row__score-lbl">score</span>
            </span>
            <span className="ac-mover-row__stage">
              {pricingLabel(item.pricing.type)}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
