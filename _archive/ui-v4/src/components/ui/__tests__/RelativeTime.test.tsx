import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelativeTime } from "@/components/ui/RelativeTime";

describe("RelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a time element and refreshes after mount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T00:00:00.000Z"));

    const { getByText } = render(
      <RelativeTime iso="2026-05-14T23:55:00.000Z" />,
    );

    expect(getByText("5m ago").tagName).toBe("TIME");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(getByText("6m ago")).toBeTruthy();
  });
});
