import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
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
  lastCommitAt: "2026-05-04T00:00:00.000Z",
  sources: { gh: 1, x: 2 },
};

const categories: CategoryFacet[] = [
  { id: "devtools", label: "DEVTOOLS", count: 1 },
];

describe("LiveTopTable", () => {
  it("renders the stars value as a strong starred number", () => {
    const { container } = render(
      <LiveTopTable rows={[row]} categories={categories} />,
    );

    const stars = container.querySelector("td.stars-num");

    expect(stars?.textContent).toContain("35.1k");
    expect(stars?.querySelector(".stars-main svg")).not.toBeNull();
  });

  it("shows per-row source indicator freshness state with 7d mention tooltip copy", () => {
    const { container, getByLabelText } = render(
      <LiveTopTable rows={[row]} categories={categories} />,
    );

    const xIndicator = getByLabelText("X / Twitter: 2 mentions (7d)");
    const ghIndicator = getByLabelText("GitHub: 1 mention (7d)");
    const hfIndicator = getByLabelText("HuggingFace: no mentions");

    expect(xIndicator.className).toContain("on");
    expect(ghIndicator.className).toContain("on");
    expect(hfIndicator.className).toContain("off");
    expect(container.querySelectorAll(".mentions-pills .sd.on").length).toBe(2);
  });

  it("shows a transparency tooltip explaining why a repo is at its current rank (TRENDING — AGN-524)", () => {
    const { getByLabelText } = render(
      <LiveTopTable rows={[row]} categories={categories} />,
    );

    // 152 (Δ24h) + 9 mentions × 8 (MENTION_WEIGHT) = 224
    expect(
      getByLabelText(
        "Why #01: trending 224. Signals: n/a (1h), n/a (6h), +152 (24h), +699 (7d), 9 mentions.",
      ),
    ).toBeTruthy();
  });

  it("colors freshness tags by age threshold", () => {
    const freshRow: LiveRow = {
      ...row,
      id: "repo-fresh",
      fullName: "owner/fresh",
      href: "/repo/owner/fresh",
      lastCommitAt: "2026-05-05T11:45:00.000Z",
    };
    const staleRow: LiveRow = {
      ...row,
      id: "repo-stale",
      fullName: "owner/stale",
      href: "/repo/owner/stale",
      lastCommitAt: "2026-05-05T09:30:00.000Z",
    };

    const { container } = render(
      <LiveTopTable rows={[freshRow, staleRow]} categories={categories} />,
    );

    expect(container.querySelectorAll(".freshness-tag--fresh").length).toBe(1);
    expect(container.querySelectorAll(".freshness-tag--stale").length).toBe(1);
  });

  // AGN-524 ranking-formula behaviour is asserted in
  // src/lib/__tests__/live-top-ranking.test.ts (pure unit, no jsdom/router).
});
