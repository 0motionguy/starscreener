// Tier B.2 / U2 — Daily/Weekly/Monthly tabs above the home rankings card.
//
// Two contracts under test:
//   1. parseTimeWindow() rejects junk values (incl. ?window=365d) and
//      defaults to "24h" — keeps the home page from crashing on deep links.
//   2. <TimeWindowTabs> renders the Yearly tab as disabled (aria-disabled
//      true, surfaces the 30-day-cap tooltip) — TrendingRepo doesn't carry
//      365 days of history and faking it would violate the no-publicly-stale
//      rule (F4 PR #3173).

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  TimeWindowTabs,
  parseTimeWindow,
  sortKeyForWindow,
} from "@/components/home/TimeWindowTabs";

afterEach(() => {
  cleanup();
});

describe("parseTimeWindow", () => {
  it("accepts the three real windows", () => {
    expect(parseTimeWindow("24h")).toBe("24h");
    expect(parseTimeWindow("7d")).toBe("7d");
    expect(parseTimeWindow("30d")).toBe("30d");
  });

  it("falls back to 24h for undefined / missing values", () => {
    expect(parseTimeWindow(undefined)).toBe("24h");
    expect(parseTimeWindow("")).toBe("24h");
  });

  it("falls back to 24h for the bogus Yearly URL — must not crash", () => {
    // Acceptance criterion from the U2 brief: visiting ?window=365d should
    // surface the 30-day-cap tooltip without rendering a yearly-sorted
    // table or throwing.
    expect(parseTimeWindow("365d")).toBe("24h");
    expect(parseTimeWindow("1y")).toBe("24h");
    expect(parseTimeWindow("forever")).toBe("24h");
  });

  it("unwraps the first value from a repeated array param", () => {
    // Next.js searchParams can be string[] when the same key appears twice.
    expect(parseTimeWindow(["7d", "30d"])).toBe("7d");
    expect(parseTimeWindow(["365d"])).toBe("24h");
  });
});

describe("sortKeyForWindow", () => {
  it("maps each window to its matching LiveTopTable sort column", () => {
    expect(sortKeyForWindow("24h")).toBe("d24");
    expect(sortKeyForWindow("7d")).toBe("d7");
    expect(sortKeyForWindow("30d")).toBe("d30");
  });
});

describe("<TimeWindowTabs>", () => {
  it("renders all four tabs with TrendShift-style labels", () => {
    const { container } = render(<TimeWindowTabs active="24h" />);
    const tabs = container.querySelectorAll('[role="tab"]');
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels).toEqual(["Daily", "Weekly", "Monthly", "Yearly"]);
  });

  it("marks the active tab via aria-selected", () => {
    const { container } = render(<TimeWindowTabs active="7d" />);
    const tabs = container.querySelectorAll('[role="tab"]');
    const active = Array.from(tabs).filter(
      (t) => t.getAttribute("aria-selected") === "true",
    );
    expect(active).toHaveLength(1);
    expect(active[0].textContent?.trim()).toBe("Weekly");
  });

  it("marks Yearly as a disabled <button> (not a link)", () => {
    // Honesty rule: Yearly is intentionally non-navigable because the data
    // simply doesn't exist beyond 30 days. Must not render as an <a> link;
    // must render as a <button disabled> so click/keyboard/AT all agree.
    const { container } = render(<TimeWindowTabs active="24h" />);
    const tabs = container.querySelectorAll('[role="tab"]');
    const yearly = Array.from(tabs).find(
      (t) => t.textContent?.trim() === "Yearly",
    );
    expect(yearly).toBeDefined();
    expect(yearly?.tagName.toLowerCase()).toBe("button");
    // Native `disabled` already prevents clicks + announces "dimmed/unavailable"
    // to screen readers. v4-tab--disabled class is the visual signal.
    expect((yearly as HTMLButtonElement).disabled).toBe(true);
    expect(yearly?.className).toMatch(/v4-tab--disabled/);
  });

  it("surfaces the 30-day cap tooltip line under the tabs", () => {
    const { container } = render(<TimeWindowTabs active="24h" />);
    const cap = container.querySelector(".time-window-tabs__cap");
    expect(cap).not.toBeNull();
    expect(cap?.textContent).toMatch(/30-day data cap/i);
    expect(cap?.getAttribute("title")).toMatch(/30-day window/i);
  });

  it("links Daily back to / (omits ?window= for the default)", () => {
    const { container } = render(<TimeWindowTabs active="30d" />);
    const daily = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Daily",
    );
    expect(daily?.getAttribute("href")).toBe("/");
  });

  it("links Weekly and Monthly to their ?window= URLs", () => {
    const { container } = render(<TimeWindowTabs active="24h" />);
    const links = Array.from(container.querySelectorAll("a"));
    expect(
      links.find((a) => a.textContent?.trim() === "Weekly")?.getAttribute("href"),
    ).toBe("/?window=7d");
    expect(
      links.find((a) => a.textContent?.trim() === "Monthly")?.getAttribute(
        "href",
      ),
    ).toBe("/?window=30d");
  });
});
