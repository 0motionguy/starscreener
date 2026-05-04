// URL-driven tab buttons. Mirrors the project's TabBar pattern but stays
// stateless — each click is a normal `<Link>` that updates the ?tab= param.
//
// Server component (no client state needed); clicks re-render the page via
// Next.js routing.

import Link from "next/link";
import { cn } from "@/lib/utils";

export type UsageTabKey =
  | "overview"
  | "models"
  | "features"
  | "cost"
  | "latency"
  | "reliability"
  | "trends";

interface UsageTabsProps {
  active: UsageTabKey;
  /** Preserve the day window across tab switches. */
  days: number;
}

const TABS: ReadonlyArray<{ key: UsageTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "models", label: "Models" },
  { key: "features", label: "Features" },
  { key: "cost", label: "Cost" },
  { key: "latency", label: "Latency" },
  { key: "reliability", label: "Reliability" },
  { key: "trends", label: "Trends" },
];

export function UsageTabs({ active, days }: UsageTabsProps) {
  return (
    <nav className="filter-bar signals-tabs" role="tablist" aria-label="Model usage tabs" style={navStyle}>
      {TABS.map(({ key, label }) => {
        const isActive = key === active;
        const href = `/model-usage?tab=${key}${days !== 1 ? `&days=${days}` : ""}`;
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={cn("ds-tab", isActive && "is-active")}
            style={{
              ...buttonStyle,
              ...(isActive ? activeStyle : {}),
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const navStyle = {
  display: "flex",
  gap: 4,
  borderBottom: "1px solid var(--color-border-subtle, #1f2329)",
  paddingBottom: 4,
  flexWrap: "wrap" as const,
};

const buttonStyle = {
  padding: "8px 14px",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 13,
  letterSpacing: 0.4,
  color: "var(--color-text-secondary, #8b9097)",
  border: "1px solid transparent",
  borderBottom: "2px solid transparent",
  textDecoration: "none",
  textTransform: "uppercase" as const,
};

const activeStyle = {
  color: "var(--color-text-default, #eef0f2)",
  borderBottom: "2px solid var(--color-accent, #ff6b35)",
};
