import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LiveTopTable } from "@/components/home/LiveTopTable";
import type { Repo } from "@/lib/types";

afterEach(() => {
  cleanup();
});

// Minimal fixture for the new repos[]-keyed API. Cast as Repo since the
// component only reads a small subset of fields for rendering.
const repo = {
  id: "repo-1",
  fullName: "owner/repo",
  owner: "owner",
  name: "repo",
  ownerAvatarUrl: "",
  description: "",
  url: "https://github.com/owner/repo",
  language: "TypeScript",
  topics: [],
  categoryId: "devtools",
  stars: 35123,
  forks: 4123,
  contributors: 0,
  openIssues: 0,
  lastCommitAt: "2026-01-01T00:00:00Z",
  lastReleaseAt: null,
  lastReleaseTag: null,
  createdAt: "2024-01-01T00:00:00Z",
  starsDelta24h: 152,
  starsDelta7d: 699,
  starsDelta30d: 2300,
  forksDelta7d: 0,
  contributorsDelta30d: 0,
  momentumScore: 88,
  movementStatus: "rising",
  rank: 1,
  categoryRank: 1,
  sparklineData: [100, 120, 160, 210],
  socialBuzzScore: 0,
  mentionCount24h: 9,
} as unknown as Repo;

describe("LiveTopTable", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <LiveTopTable repos={[repo]} skills={[]} mcps={[]} limit={1} />,
    );
    // Component should render at least one row containing the repo name.
    expect(container.textContent).toContain("owner/repo");
  });
});
