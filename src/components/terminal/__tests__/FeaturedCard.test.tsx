import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { FeaturedCard } from "@/components/terminal/FeaturedCard";
import type {
  FeaturedCard as FeaturedCardType,
  FeaturedLabel,
  Repo,
} from "@/lib/types";

afterEach(() => {
  // Each render attaches to document.body until cleanup() — without it,
  // queries from one test see leftover DOM from prior renders.
  cleanup();
});

// Build a minimally-typed Repo. The Repo interface has many optional
// fields we don't exercise; we cast through unknown so the fixture stays
// readable rather than padding 30 properties of zero.
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

describe("FeaturedCard", () => {
  it("renders without crashing for a minimal card", () => {
    const { container } = render(<FeaturedCard card={makeCard()} />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it("renders the repo full name in the body", () => {
    const { getByText } = render(<FeaturedCard card={makeCard()} />);
    expect(getByText("vercel/next.js")).toBeTruthy();
  });

  it("renders the OWNER/NAME slug uppercased in the terminal-bar header", () => {
    const { getByText } = render(<FeaturedCard card={makeCard()} />);
    // headerSlug = `${owner}/${name}`.toUpperCase()
    expect(getByText("VERCEL/NEXT.JS")).toBeTruthy();
  });

  it("formats the star count using formatNumber (12345 -> 12.3k)", () => {
    const { getByText } = render(<FeaturedCard card={makeCard()} />);
    // formatNumber emits lowercase 'k', the component appends a space + ★
    expect(getByText(/12\.3k\s*★/)).toBeTruthy();
  });

  it("renders the 24h delta with a + sign and a + percent", () => {
    const { getByText } = render(<FeaturedCard card={makeCard()} />);
    // gain=100 (no k), pct = 100/12345*100 ≈ 0.8 — rendered as "+0.8%".
    expect(getByText(/^\+100\s*★$/)).toBeTruthy();
    expect(getByText(/^\+0\.8%$/)).toBeTruthy();
  });

  it("renders a negative delta without a leading + and with a minus percent", () => {
    const card = makeCard({}, { starsDelta24h: -50 });
    const { getByText } = render(<FeaturedCard card={card} />);
    // formatNumber(-50) === "-50"; gainSign is "" for gain<0 so the literal
    // text is "-50 ★". pct = -50/12345*100 ≈ -0.4 → "-0.4%".
    expect(getByText(/^-50\s*★$/)).toBeTruthy();
    expect(getByText(/^-0\.4%$/)).toBeTruthy();
  });

  it("top-rank cards (NUMBER_ONE_TODAY) carry the v2-bracket class", () => {
    const card = makeCard({ label: "NUMBER_ONE_TODAY" });
    const { container } = render(<FeaturedCard card={card} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("v2-bracket");
  });

  it("non-top-rank cards do NOT carry the v2-bracket class", () => {
    const { container } = render(
      <FeaturedCard card={makeCard({ label: "BREAKOUT" })} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("v2-bracket");
  });

  it("renders the labelDisplay as the brand-variant tag", () => {
    // Use a labelDisplay unique from the hard-coded "BRK" tag a non-top-rank
    // card also renders, so getByText finds exactly one match.
    const card = makeCard({ labelDisplay: "QK" });
    const { getByText } = render(<FeaturedCard card={card} />);
    expect(getByText("QK")).toBeTruthy();
  });

  it("non-top-rank cards render an extra static BRK tag (top-rank suppresses it)", () => {
    // Use a labelDisplay distinct from "BRK" so we can count BRKs cleanly.
    const card = makeCard({ labelDisplay: "RANK" });
    const { queryAllByText } = render(<FeaturedCard card={card} />);
    // Body row 3: labelDisplay tag + a hard-coded "BRK" tag for non-top-rank.
    expect(queryAllByText("BRK")).toHaveLength(1);
    expect(queryAllByText("RANK")).toHaveLength(1);
  });

  it("top-rank cards suppress the extra BRK tag", () => {
    const card = makeCard({
      label: "NUMBER_ONE_TODAY",
      labelDisplay: "#1",
    });
    const { queryAllByText } = render(<FeaturedCard card={card} />);
    // Only the labelDisplay tag remains; BRK is hidden behind isTopRank.
    expect(queryAllByText("BRK")).toHaveLength(0);
    expect(queryAllByText("#1")).toHaveLength(1);
  });

  it("link href points at /repo/{owner}/{name}", () => {
    const { container } = render(<FeaturedCard card={makeCard()} />);
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/repo/vercel/next.js");
  });

  it("forks and contributors are rendered through formatNumber", () => {
    const { getByText } = render(<FeaturedCard card={makeCard()} />);
    // forks=6789 -> "6.8k"; contributors=100 -> "100".
    expect(getByText("6.8k")).toBeTruthy();
    expect(getByText("100")).toBeTruthy();
  });
});
