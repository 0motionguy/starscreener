import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Anchor "now" so the relative-time math is deterministic regardless of
// when the suite runs. classifyFreshness reads Date.now() by default.
const NOW = new Date("2026-05-04T12:00:00.000Z").getTime();

function setNow(ms: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ms));
}

describe("FreshnessBadge", () => {
  it("renders 'live' for an age under one minute", () => {
    setNow(NOW);
    const fetchedAt = new Date(NOW - 30 * 1000).toISOString();
    const { container } = render(
      <FreshnessBadge lastUpdatedAt={fetchedAt} source="reddit" />,
    );
    // Badge content is "<TONE> · <ageLabel>". formatScrapeAge returns "live"
    // when the age is < 60s (see src/lib/news/freshness.ts).
    expect(container.textContent).toContain("· live");
    expect(container.textContent).toContain("FRESH");
  });

  it("renders '{m}m' for a sub-hour age", () => {
    setNow(NOW);
    const fetchedAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <FreshnessBadge lastUpdatedAt={fetchedAt} source="reddit" />,
    );
    expect(container.textContent).toContain("· 2m");
  });

  it("renders '{h}h' for a sub-day age", () => {
    setNow(NOW);
    // 4h is past reddit's stale threshold (cold), but the ageLabel formatter
    // only cares about magnitude, not status. Pick the slow-cron `npm`
    // source so the badge is still warn-leaning instead of cold.
    const fetchedAt = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <FreshnessBadge lastUpdatedAt={fetchedAt} source="npm" />,
    );
    expect(container.textContent).toContain("· 4h");
  });

  it("renders '—' when lastUpdatedAt is missing", () => {
    setNow(NOW);
    const { container } = render(
      <FreshnessBadge lastUpdatedAt={null} source="reddit" />,
    );
    expect(container.textContent).toContain("· —");
    // No fetchedAt → classifyFreshness returns status:"cold" → COLD label.
    expect(container.textContent).toContain("COLD");
  });
});
