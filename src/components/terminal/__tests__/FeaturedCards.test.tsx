import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// next/navigation's useRouter throws "invariant expected app router to be
// mounted" outside of an App Router runtime — happy-dom has no such runtime.
// Mocking the whole module is the standard escape hatch (the no-mock rule
// in the test brief is for next/link, next/image, and the legacy next/router
// — App Router hooks are different and need a stub).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { FeaturedCards } from "@/components/terminal/FeaturedCards";
import type {
  FeaturedCard as FeaturedCardType,
  FeaturedLabel,
  Repo,
} from "@/lib/types";

afterEach(() => {
  cleanup();
});

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "vercel--next-js",
    fullName: "vercel/next.js",
    name: "next.js",
    owner: "vercel",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
    description: "The React Framework",
    url: "https://github.com/vercel/next.js",
    language: "TypeScript",
    topics: [],
    categoryId: "devtools",
    stars: 12345,
    forks: 6789,
    contributors: 100,
    openIssues: 0,
    lastCommitAt: "2026-04-26T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2016-10-25T00:00:00.000Z",
    starsDelta24h: 100,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 1,
    categoryRank: 1,
    sparklineData: [1, 2, 3, 4, 5, 6, 7],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    ...overrides,
  };
}

function makeCard(
  overrides: Partial<FeaturedCardType> = {},
  repoOverrides: Partial<Repo> = {},
): FeaturedCardType {
  return {
    repo: makeRepo(repoOverrides),
    label: "BREAKOUT" as FeaturedLabel,
    labelDisplay: "BRK",
    reason: "+5% stars 24h",
    deltaPercent: 5,
    rankDelta: 0,
    sparkline: [1, 2, 3, 4, 5, 6, 7],
    ...overrides,
  };
}

describe("FeaturedCards", () => {
  it("renders the empty state when initialCards is an empty array", () => {
    // Passing initialCards (even []) flips loading to false on mount, so the
    // empty branch shows immediately and the fetch-on-mount path is skipped.
    const { getByText } = render(<FeaturedCards initialCards={[]} />);
    expect(getByText("NO TRENDING REPOS YET")).toBeTruthy();
  });

  it("renders the default header title 'FEATURED NOW'", () => {
    const { getByText } = render(<FeaturedCards initialCards={[]} />);
    // The h2 emits `// FEATURED NOW` (the prefix is part of the same span).
    expect(getByText(/\/\/ FEATURED NOW/)).toBeTruthy();
  });

  it("renders a custom title prop, uppercased", () => {
    const { getByText } = render(
      <FeaturedCards initialCards={[]} title="hot this week" />,
    );
    expect(getByText(/\/\/ HOT THIS WEEK/)).toBeTruthy();
  });

  it("renders one card per item when initialCards has entries", () => {
    const cards: FeaturedCardType[] = [
      makeCard({ labelDisplay: "BRK" }, { id: "vercel--next-js" }),
      makeCard(
        { labelDisplay: "HOT" },
        {
          id: "facebook--react",
          owner: "facebook",
          name: "react",
          fullName: "facebook/react",
          stars: 230000,
        },
      ),
    ];
    const { getByText } = render(<FeaturedCards initialCards={cards} />);
    expect(getByText("vercel/next.js")).toBeTruthy();
    expect(getByText("facebook/react")).toBeTruthy();
  });

  it("does NOT render the empty state when cards are present", () => {
    const cards: FeaturedCardType[] = [makeCard()];
    const { queryByText } = render(<FeaturedCards initialCards={cards} />);
    expect(queryByText("NO TRENDING REPOS YET")).toBeNull();
  });

  it("rendered cards link to /repo/{owner}/{name}", () => {
    const cards: FeaturedCardType[] = [
      makeCard(
        {},
        {
          id: "facebook--react",
          owner: "facebook",
          name: "react",
          fullName: "facebook/react",
        },
      ),
    ];
    const { container } = render(<FeaturedCards initialCards={cards} />);
    const link = container.querySelector(
      'a[href="/repo/facebook/react"]',
    );
    expect(link).toBeTruthy();
  });

  it("header carries the FEATURED-NOW prefix even with cards present", () => {
    const cards: FeaturedCardType[] = [makeCard()];
    const { getByText } = render(<FeaturedCards initialCards={cards} />);
    expect(getByText(/\/\/ FEATURED NOW/)).toBeTruthy();
  });
});
