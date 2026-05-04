import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";

afterEach(() => {
  cleanup();
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
});
