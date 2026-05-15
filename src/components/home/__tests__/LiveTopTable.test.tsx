import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: () => {}, push: () => {}, replace: () => {} }),
}));

import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";

// Production hides FreshnessChip via NEXT_PUBLIC_HIDE_FRESHNESS_BADGES;
// this test asserts the rendered "Updated 1h ago" chip, so the flag has
// to be flipped off explicitly for the chip to render.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_HIDE_FRESHNESS_BADGES", "false");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const row: LiveRow = {
  id: "repo-1",
  fullName: "owner/repo",
  owner: "owner",
  name: "repo",
  href: "/repo/owner/repo",
  categoryId: "devtools",
  categoryLabel: "DEVTOOLS",
  language: "TypeScript",
  stars: 35123,
  starsDelta24h: 152,
  starsDelta7d: 699,
  starsDelta30d: 2300,
  forks: 4123,
  sparklineData: [100, 120, 160, 210],
  momentumScore: 88,
  mentionCount24h: 9,
  sources: { gh: 1, x: 2 },
  updatedAt: "2026-05-04T11:00:00.000Z",
};

const categories: CategoryFacet[] = [
  { id: "devtools", label: "DEVTOOLS", count: 1 },
];

describe("LiveTopTable", () => {
  it("renders the stars value as a strong starred number", () => {
    const { container } = render(
      <LiveTopTable
        rows={[row]}
        categories={categories}
        lastUpdatedAt="2026-05-04T11:00:00.000Z"
        freshnessNowMs={new Date("2026-05-04T12:00:00.000Z").getTime()}
      />,
    );

    const stars = container.querySelector("td.stars-num");

    expect(stars?.textContent).toContain("35.1k");
    expect(stars?.querySelector(".stars-main svg")).not.toBeNull();
    expect(container.textContent).toContain("Updated 1h ago");
  });
});
