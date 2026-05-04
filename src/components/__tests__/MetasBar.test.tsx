import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { MetasBar } from "@/components/terminal/MetasBar";
import { useFilterStore } from "@/lib/store";
import type { MetaCounts } from "@/lib/types";

const FULL_COUNTS: MetaCounts = {
  hot: 12,
  breakouts: 7,
  quietKillers: 3,
  new: 9,
  discussed: 5,
  rankClimbers: 4,
  freshReleases: 2,
};

const ZERO_COUNTS: MetaCounts = {
  hot: 0,
  breakouts: 0,
  quietKillers: 0,
  new: 0,
  discussed: 0,
  rankClimbers: 0,
  freshReleases: 0,
};

beforeEach(() => {
  // Reset only the filter we touch — these aren't persisted but tests run
  // in the same JSDOM realm so resetting is the safe path.
  act(() => {
    useFilterStore.getState().setActiveMetaFilter(null);
  });
});

afterEach(() => {
  // @testing-library/react keeps every render attached to document.body
  // until cleanup() — without this, queries from one test see leftover DOM
  // from the prior render and `getByRole` finds duplicate "group" elements.
  cleanup();
});

describe("MetasBar", () => {
  it("renders all 7 meta chips with their labels and counts", () => {
    const { getByText } = render(<MetasBar counts={FULL_COUNTS} />);
    expect(getByText("HOT THIS WEEK")).toBeTruthy();
    expect(getByText("BREAKOUTS")).toBeTruthy();
    expect(getByText("QUIET KILLERS")).toBeTruthy();
    expect(getByText("NEW <30D")).toBeTruthy();
    expect(getByText("MOST DISCUSSED")).toBeTruthy();
    expect(getByText("RANK CLIMBERS")).toBeTruthy();
    expect(getByText("FRESH RELEASES")).toBeTruthy();
    // Counts render in their tabular slot.
    expect(getByText("12")).toBeTruthy();
    expect(getByText("7")).toBeTruthy();
  });

  it("renders 7 buttons grouped under the meta-filters role", () => {
    const { getAllByRole, getByRole } = render(
      <MetasBar counts={FULL_COUNTS} />,
    );
    expect(getByRole("group", { name: /meta filters/i })).toBeTruthy();
    expect(getAllByRole("button").length).toBe(7);
  });

  it("clicking a chip sets activeMetaFilter in the store", () => {
    const { getByText } = render(<MetasBar counts={FULL_COUNTS} />);
    expect(useFilterStore.getState().activeMetaFilter).toBeNull();

    act(() => {
      fireEvent.click(getByText("BREAKOUTS"));
    });
    expect(useFilterStore.getState().activeMetaFilter).toBe("breakouts");
  });

  it("clicking the active chip again toggles it back to null", () => {
    const { getByText } = render(<MetasBar counts={FULL_COUNTS} />);
    act(() => {
      fireEvent.click(getByText("HOT THIS WEEK"));
    });
    expect(useFilterStore.getState().activeMetaFilter).toBe("hot");

    act(() => {
      fireEvent.click(getByText("HOT THIS WEEK"));
    });
    expect(useFilterStore.getState().activeMetaFilter).toBeNull();
  });

  it("active chip exposes aria-pressed=true; inactive chips stay false", () => {
    const { getByRole } = render(<MetasBar counts={FULL_COUNTS} />);
    const hotBtn = getByRole("button", { name: /hot this week/i });
    const breakoutsBtn = getByRole("button", { name: /breakouts/i });
    expect(hotBtn.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      fireEvent.click(hotBtn);
    });
    expect(hotBtn.getAttribute("aria-pressed")).toBe("true");
    expect(breakoutsBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("a chip with count=0 renders disabled and a click is a no-op", () => {
    const { getByRole } = render(<MetasBar counts={ZERO_COUNTS} />);
    const hotBtn = getByRole("button", { name: /hot this week/i });
    expect((hotBtn as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      fireEvent.click(hotBtn);
    });
    expect(useFilterStore.getState().activeMetaFilter).toBeNull();
  });

  it("active state paints the chip border with the meta color", () => {
    const { getByRole } = render(<MetasBar counts={FULL_COUNTS} />);
    const hotBtn = getByRole(
      "button",
      { name: /hot this week/i },
    ) as HTMLElement;
    // Inactive border uses the neutral line token.
    expect(hotBtn.style.borderColor).toContain("--v4-line-200");

    act(() => {
      fireEvent.click(hotBtn);
    });
    // Active border shifts onto the per-meta color (HOT uses --v4-acc).
    expect(hotBtn.style.borderColor).toContain("--v4-acc");
    expect(hotBtn.style.borderColor).not.toContain("--v4-line-200");
  });
});
