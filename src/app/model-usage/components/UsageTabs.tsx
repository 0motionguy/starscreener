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
    <nav className="v4-tab-bar signals-tabs" role="tablist" aria-label="Model usage tabs">
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
            className={cn("v4-tab", isActive && "v4-tab--on")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
