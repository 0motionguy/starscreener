import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import {
  AllTrendingTabs,
  buildTrendingRowsDto,
} from "@/components/reddit-trending/AllTrendingTabs";
import type { RedditAllPost } from "@/lib/reddit-all";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reddit/trending",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    return function MockDynamicTab({
      posts,
    }: {
      posts?: Array<{ id?: string }>;
    }) {
      return (
        <ul data-testid="mock-tab-rows">
          {(posts ?? []).map((post, index) => (
            <li key={post.id ?? `row-${index}`}>row</li>
          ))}
        </ul>
      );
    };
  },
}));

const PAGE_SIZE = 50;
const HTML_BUDGET_BYTES = 200 * 1024;

function makePost(index: number, nowSec: number): RedditAllPost {
  return {
    id: `post-${index}`,
    subreddit: `sub${(index % 12) + 1}`,
    title: `Synthetic Reddit Post ${index} with deterministic payload`,
    url: `https://example.com/post/${index}`,
    permalink: `/r/test/comments/post-${index}`,
    score: 1200 - index,
    numComments: 200 - (index % 40),
    createdUtc: nowSec - (index % 20) * 3600,
    author: `author${index}`,
    repoFullName: index % 3 === 0 ? `owner/repo-${index}` : null,
    baselineRatio: 1.2,
    baselineTier: "above-average",
    baselineConfidence: "high",
    ageHours: index % 20,
    velocity: 50 - (index % 7),
    trendingScore: 2000 - index,
    content_tags: ["shipped"],
    value_score: 2,
    selftext: "Deterministic body",
  };
}

function makePosts(total: number): RedditAllPost[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return Array.from({ length: total }, (_, i) => makePost(i + 1, nowSec));
}

describe("AllTrendingTabs pagination + SSR-size guard", () => {
  it("renders only one page of rows and keeps markup under 200KB budget", () => {
    const posts = makePosts(300);
    const { container } = render(
      <AllTrendingTabs posts={posts} pathname="/reddit/trending" />,
    );

    const rows = container.querySelectorAll("[data-testid='mock-tab-rows'] > li");
    expect(rows.length).toBe(PAGE_SIZE);
    expect(screen.getByLabelText("Reddit trending pagination")).toBeTruthy();

    const renderedBytes = new TextEncoder().encode(container.innerHTML).byteLength;
    expect(renderedBytes).toBeLessThan(HTML_BUDGET_BYTES);
  });

  it("supports page query without expanding rendered row count", () => {
    const posts = makePosts(300);
    const { container } = render(
      <AllTrendingTabs
        posts={posts}
        pathname="/reddit/trending"
        searchParams={{ page: "2", tab: "trending-now" }}
      />,
    );

    const rows = container.querySelectorAll("[data-testid='mock-tab-rows'] > li");
    expect(rows.length).toBe(PAGE_SIZE);

    const renderedBytes = new TextEncoder().encode(container.innerHTML).byteLength;
    expect(renderedBytes).toBeLessThan(HTML_BUDGET_BYTES);
  });

  it("builds a compact DTO (50 rows max) for server-to-client payloads", () => {
    const posts = makePosts(300);
    const dtoPage1 = buildTrendingRowsDto(posts, { tab: "trending-now" });
    const dtoPage2 = buildTrendingRowsDto(posts, { tab: "trending-now", page: "2" });

    expect(dtoPage1.rows.length).toBe(PAGE_SIZE);
    expect(dtoPage2.rows.length).toBe(PAGE_SIZE);

    const dtoPage1Bytes = new TextEncoder().encode(JSON.stringify(dtoPage1)).byteLength;
    const dtoPage2Bytes = new TextEncoder().encode(JSON.stringify(dtoPage2)).byteLength;
    expect(dtoPage1Bytes).toBeLessThan(HTML_BUDGET_BYTES);
    expect(dtoPage2Bytes).toBeLessThan(HTML_BUDGET_BYTES);
  });
});
