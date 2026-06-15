// TimeWindowTabs — Daily / Weekly / Monthly / Yearly above the Live top-50
// rankings card on the home surface (TrendShift-style nav).
//
// URL contract: `?window=24h|7d|30d`. Defaults to 24h (omitted from URL).
// Yearly is rendered as a disabled tab with a tooltip because TrendingRepo
// only carries 30 days of star history — see the "no-publicly-stale" rule:
// faking a 365d delta would be worse than admitting the cap.
//
// Server component. Renders the existing v4 TabBar in `hrefs` link-mode so
// Next.js prefetch + back/forward navigation work without client state.
// The tab itself drives:
//   1. LiveTopTable's initial sort column (via `initialSortKey` prop on the
//      table, set by page.tsx based on the same `?window=` param)
//   2. A subtle hint line under the tabs explaining what each window shows
//
// References: src/components/ui/TabBar.tsx, src/app/categories/[slug]/page.tsx
// (which uses the same `?window=24h|7d|30d` contract for category track tabs).

import { TabBar, type TabItem } from "@/components/ui/TabBar";

export type TimeWindowId = "24h" | "7d" | "30d";

export const TIME_WINDOW_IDS: readonly TimeWindowId[] = ["24h", "7d", "30d"];

/** Type-narrow an unknown URL param value to a TimeWindowId, defaulting to 24h. */
export function parseTimeWindow(
  value: string | string[] | undefined,
): TimeWindowId {
  const v = Array.isArray(value) ? value[0] : value;
  return (TIME_WINDOW_IDS as readonly string[]).includes(v ?? "")
    ? (v as TimeWindowId)
    : "24h";
}

/** Map a TimeWindowId to the LiveTopTable SortKey for the matching delta column. */
export function sortKeyForWindow(window: TimeWindowId): "d24" | "d7" | "d30" {
  if (window === "7d") return "d7";
  if (window === "30d") return "d30";
  return "d24";
}

interface TimeWindowTabsProps {
  /** Active window id. */
  active: TimeWindowId;
  /**
   * Base path the tab links point to. Defaults to "/" (home). Useful when the
   * component is reused on other surfaces (e.g. /breakouts).
   */
  basePath?: string;
}

// "Yearly" intentionally has no href — TrendingRepo doesn't carry 365 days of
// star history. The disabled flag wires the v4-tab--disabled CSS + aria-disabled.
const YEARLY_TOOLTIP =
  "Beyond TrendingRepo's 30-day window — see Methodology for why";

export function TimeWindowTabs({ active, basePath = "/" }: TimeWindowTabsProps) {
  // Build hrefs for the three real windows. 24h is the default and elides the
  // ?window= param to keep the canonical URL clean (matches the existing
  // TrendingControlBar.cleanQuery convention).
  const hrefs: Record<string, string> = {
    "24h": basePath,
    "7d": `${basePath}${basePath.includes("?") ? "&" : "?"}window=7d`,
    "30d": `${basePath}${basePath.includes("?") ? "&" : "?"}window=30d`,
    // 365d intentionally omitted — TabBar treats missing hrefs as buttons,
    // but we mark the item disabled so it never fires onChange either.
  };

  const items: TabItem[] = [
    { id: "24h", label: "Daily" },
    { id: "7d", label: "Weekly" },
    { id: "30d", label: "Monthly" },
    { id: "365d", label: "Yearly", disabled: true },
  ];

  return (
    <div className="time-window-tabs" data-active={active}>
      <TabBar items={items} active={active} hrefs={hrefs} />
      <p className="time-window-tabs__hint" role="note">
        {active === "24h"
          ? "Sorted by 24h star delta. Same data refreshes every 30 minutes."
          : active === "7d"
            ? "Sorted by 7-day star delta. Catches multi-day breakouts."
            : "Sorted by 30-day star delta. The widest window we carry."}
        {/* Yearly's "30-day cap" tooltip is on the disabled tab itself —
            screen readers see aria-disabled, mouse users see the title attr.
            Surfaced redundantly here so sighted users on the wrong window
            still see the cap honestly. */}
        <span className="time-window-tabs__cap" title={YEARLY_TOOLTIP}>
          Yearly unavailable — 30-day data cap
        </span>
      </p>
    </div>
  );
}
