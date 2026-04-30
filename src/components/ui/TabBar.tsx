// V4 — TabBar
//
// Horizontal tab navigation used by signals.html (mention feed tabs),
// home.html (table tabs: All / Repos / Skills / MCP), top10.html (category
// tabs), breakouts. Three slots per tab: optional icon (e.g. source pip),
// label, optional count.
//
// Mockup-canonical:
//   - 42px tab height, 0 14px padding
//   - Mono caps with track 0.14em
//   - On-state: ink-000 color, 2px acc bottom border, soft acc gradient
//     wash from top
//   - Hover: ink-100 color
//
// Usage (controlled):
//   const [active, setActive] = useState("all");
//   <TabBar
//     items={[
//       { id: "all", label: "ALL", count: 14 },
//       { id: "hn",  label: "HN",  count: 3, icon: <SourcePip src="hn"/> },
//       …
//     ]}
//     active={active}
//     onChange={setActive}
//   />
//
// Usage (link mode):
//   <TabBar
//     items={[{ id: "/", label: "TREND" }, { id: "/signals", label: "SIGNAL" }]}
//     active={pathname}
//     hrefFor={(id) => id}
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number | string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabBarProps {
  items: TabItem[];
  active: string;
  onChange?: (id: string) => void;
  /** When provided, tabs render as <a href={hrefFor(id)}> instead of <button>. */
  hrefFor?: (id: string) => string;
  /**
   * Optional right-aligned slot rendered after the tabs (e.g. "Sort · momentum",
   * "live"). Mockup pattern from home.html § 05 Live · top 50.
   */
  rightSlot?: ReactNode;
  className?: string;
}

export function TabBar({
  items,
  active,
  onChange,
  hrefFor,
  rightSlot,
  className,
}: TabBarProps) {
  return (
    <div className={cn("v4-tab-bar", className)} role="tablist">
      {items.map((item) => {
        const isActive = item.id === active;
        const cls = cn(
          "v4-tab",
          isActive && "v4-tab--on",
          item.disabled && "v4-tab--disabled",
        );
        const inner = (
          <>
            {item.icon ? <span className="v4-tab__icon">{item.icon}</span> : null}
            <span className="v4-tab__label">{item.label}</span>
            {item.count !== undefined ? (
              <span className="v4-tab__count">{item.count}</span>
            ) : null}
          </>
        );
        if (hrefFor) {
          return (
            <a
              key={item.id}
              href={hrefFor(item.id)}
              className={cls}
              role="tab"
              aria-selected={isActive}
              aria-disabled={item.disabled}
            >
              {inner}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            className={cls}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(item.id)}
          >
            {inner}
          </button>
        );
      })}
      {rightSlot ? <div className="v4-tab-bar__right">{rightSlot}</div> : null}
    </div>
  );
}
