// Agent Commerce — URL-state tab strip.
//
// Server component. Each tab is a Link that preserves all other URL params
// except `tab`. Mirrors signals/SourceFilterBar pattern.

import Link from "next/link";

import type { AgentCommerceTab } from "@/lib/agent-commerce/extract";
import { TABS } from "@/lib/agent-commerce/extract";

const TAB_LABELS: Record<AgentCommerceTab, string> = {
  overview: "Overview",
  payments: "Payments",
  marketplaces: "Marketplaces",
  apis: "APIs",
  wallets: "Wallets",
  mcp: "MCP",
  signals: "Signals",
  opportunities: "Opportunities",
};

const TAB_GLYPHS: Record<AgentCommerceTab, string> = {
  overview: "01",
  payments: "02",
  marketplaces: "03",
  apis: "04",
  wallets: "05",
  mcp: "06",
  signals: "07",
  opportunities: "08",
};

interface TabsProps {
  active: AgentCommerceTab;
  counts?: Partial<Record<AgentCommerceTab, number>>;
  baseQuery: URLSearchParams;
}

function buildTabHref(base: URLSearchParams, tab: AgentCommerceTab): string {
  const next = new URLSearchParams(base);
  if (tab === "overview") {
    next.delete("tab");
  } else {
    next.set("tab", tab);
  }
  const qs = next.toString();
  return qs ? `/agent-commerce?${qs}` : "/agent-commerce";
}

export function AgentCommerceTabs({ active, counts, baseQuery }: TabsProps) {
  return (
    <nav className="ac-tabs" aria-label="Agent Commerce sections">
      {TABS.map((tab) => {
        const isActive = tab === active;
        const count = counts?.[tab];
        return (
          <Link
            key={tab}
            href={buildTabHref(baseQuery, tab)}
            className={`ac-tab ${isActive ? "is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="ac-tab-num">{TAB_GLYPHS[tab]}</span>
            <span className="ac-tab-label">{TAB_LABELS[tab]}</span>
            {typeof count === "number" ? (
              <span className="ac-tab-count">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
