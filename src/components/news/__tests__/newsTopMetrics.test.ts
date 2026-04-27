// Vitest tests for src/components/news/newsTopMetrics.ts.
//
// 635 LOC of pure data transforms — the per-source builders all share
// the same shape (3 cards [snapshot/bars/bars] + ≤3 hero stories) and
// all read through `compactNumber`, `topicBars`, and `activityBars`.
// This file pins the shape with one fixture per builder + edge-case
// matrices for the three helpers.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  compactNumber,
  topicBars,
  activityBars,
  buildHackerNewsHeader,
  buildBlueskyHeader,
  buildDevtoHeader,
  buildDevtoHeaderFromArticles,
  buildProductHuntHeader,
  buildRedditHeader,
  buildLobstersHeader,
} from "../newsTopMetrics";

// ---------------------------------------------------------------------------
// compactNumber
// ---------------------------------------------------------------------------

describe("compactNumber", () => {
  it("formats zero", () => {
    expect(compactNumber(0)).toBe("0");
  });

  it("formats sub-thousand integers via toLocaleString", () => {
    expect(compactNumber(999)).toBe("999");
  });

  it("formats values in [1_000, 10_000) with one decimal K", () => {
    expect(compactNumber(1_000)).toBe("1.0K");
    expect(compactNumber(9_999)).toBe("10.0K");
  });

  it("formats values in [10_000, 1_000_000) as rounded K integers", () => {
    expect(compactNumber(10_000)).toBe("10K");
    expect(compactNumber(123_456)).toBe("123K");
  });

  it("formats values >= 1_000_000 as M with one decimal", () => {
    expect(compactNumber(1_000_000)).toBe("1.0M");
    expect(compactNumber(2_500_000)).toBe("2.5M");
  });

  it("formats negative numbers without crashing", () => {
    // Branch uses Math.abs() to pick the bucket then divides the signed
    // value, so the magnitude logic still applies and the result keeps
    // the sign.
    expect(compactNumber(-1500)).toBe("-1.5K");
  });

  it('returns "0" for non-finite inputs (NaN, Infinity)', () => {
    expect(compactNumber(Number.NaN)).toBe("0");
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(compactNumber(Number.NEGATIVE_INFINITY)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// topicBars
// ---------------------------------------------------------------------------

describe("topicBars", () => {
  it("returns an empty array for empty input", () => {
    expect(topicBars([])).toEqual([]);
  });

  it("returns an empty array when every word is a stop-word", () => {
    expect(topicBars(["the and or", "a is the"])).toEqual([]);
  });

  it("filters out tokens with count < 2", () => {
    // "kafka" appears once → dropped. "redis" twice → kept.
    const bars = topicBars(["kafka redis news", "redis update"]);
    expect(bars.map((b) => b.label)).toEqual(["REDIS"]);
    expect(bars[0].value).toBe(2);
  });

  it("truncates to the top N rows", () => {
    // Five distinct tokens, each appearing twice — top 2 must come back.
    const bars = topicBars(
      [
        "alpha beta gamma delta epsilon",
        "alpha beta gamma delta epsilon",
      ],
      2,
    );
    expect(bars).toHaveLength(2);
  });

  it("cycles through the 8-colour palette when N > 8", () => {
    // Build 9 tokens each appearing twice. Bar 8 (zero-indexed) must
    // wrap back to the same colour as bar 0.
    const tokens = [
      "alpha", "bravo", "charlie", "delta", "echo",
      "foxtrot", "golf", "hotel", "india",
    ];
    const repeated = tokens.join(" ");
    const bars = topicBars([repeated, repeated], 9);
    expect(bars).toHaveLength(9);
    expect(bars[8].color).toBe(bars[0].color);
  });
});

// ---------------------------------------------------------------------------
// activityBars
// ---------------------------------------------------------------------------

describe("activityBars", () => {
  // Pin Date.now so window math is deterministic.
  const NOW_MS = Date.parse("2026-01-15T12:00:00Z");
  const NOW_SEC = NOW_MS / 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 6 buckets even for empty input", () => {
    const bars = activityBars([]);
    expect(bars).toHaveLength(6);
    for (const bar of bars) {
      expect(bar.value).toBe(0);
      expect(bar.hintLabel).toBe("—");
    }
  });

  it("filters items outside the 24h window", () => {
    // 25h ago = outside; 30s in the future = outside.
    const items = [
      { tsSec: NOW_SEC - 25 * 3600, weight: 100 },
      { tsSec: NOW_SEC + 30, weight: 50 },
    ];
    const bars = activityBars(items);
    expect(bars.every((b) => b.value === 0)).toBe(true);
  });

  it("ignores non-finite timestamps", () => {
    const items = [
      { tsSec: Number.NaN, weight: 10 },
      { tsSec: Number.POSITIVE_INFINITY, weight: 10 },
    ];
    const bars = activityBars(items);
    expect(bars.every((b) => b.value === 0)).toBe(true);
  });

  it("places a current-window event into the first (top) row", () => {
    // 5 minutes ago — sits in the [0,4)h bucket which renders at the
    // top of the chart.
    const items = [{ tsSec: NOW_SEC - 5 * 60, weight: 42 }];
    const bars = activityBars(items);
    expect(bars[0].label).toBe("0–4H");
    expect(bars[0].value).toBe(1);
    // hintLabel is the compactNumber'd weight sum.
    expect(bars[0].hintLabel).toBe("42");
  });

  it("places an older-window event into a later row", () => {
    // 21h ago → [20,24)h bucket → row 5 (last).
    const items = [{ tsSec: NOW_SEC - 21 * 3600, weight: 7 }];
    const bars = activityBars(items);
    expect(bars[0].value).toBe(0);
    expect(bars[5].label).toBe("20–24H");
    expect(bars[5].value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Per-source builders — one small fixture each, snapshot the shape
// (not the exact prose). The snapshots live inline so the fixture
// stays readable next to the test.
// ---------------------------------------------------------------------------

const NOW_MS = Date.parse("2026-01-15T12:00:00Z");
const NOW_SEC = NOW_MS / 1000;

function withFixedTime<T>(fn: () => T): T {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_MS));
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

describe("buildHackerNewsHeader", () => {
  it("returns 3 cards in the expected variant order with the right hero count", () => {
    const result = withFixedTime(() =>
      buildHackerNewsHeader(
        {
          fetchedAt: "2026-01-15T11:00:00Z",
          windowHours: 24,
          scannedTotal: 2,
          firebaseCount: 2,
          algoliaCount: 0,
          stories: [
            {
              id: 1,
              title: "Show HN: rust scanner",
              url: "https://example.com/a",
              by: "alice",
              score: 100,
              descendants: 12,
              createdUtc: NOW_SEC - 2 * 3600,
              everHitFrontPage: true,
            },
            {
              id: 2,
              title: "Ask HN: about rust",
              url: "https://example.com/b",
              by: "bob",
              score: 50,
              descendants: 4,
              createdUtc: NOW_SEC - 5 * 3600,
              everHitFrontPage: false,
            },
          ],
        },
        [
          {
            id: 1,
            title: "Show HN: rust scanner",
            url: "https://example.com/a",
            by: "alice",
            score: 100,
            descendants: 12,
            createdUtc: NOW_SEC - 2 * 3600,
            everHitFrontPage: true,
            ageHours: 2,
          },
        ],
      ),
    );

    expect(result.cards).toHaveLength(3);
    expect(result.cards[0].variant).toBe("snapshot");
    expect(result.cards[1].variant).toBe("bars");
    expect(result.cards[2].variant).toBe("bars");
    if (result.cards[0].variant === "snapshot") {
      expect(result.cards[0].value).toBe("2");
      expect(result.cards[0].rows).toHaveLength(3);
    }
    if (result.cards[1].variant === "bars") {
      expect(result.cards[1].bars).toHaveLength(6);
    }
    expect(result.topStories).toHaveLength(1);
    expect(result.topStories[0].sourceCode).toBe("HN");
    expect(result.topStories[0].external).toBe(true);
    expect(result.topStories[0].byline).toBe("@alice");
  });
});

describe("buildBlueskyHeader", () => {
  it("returns the cards/topStories shape and truncates long post text in the hero title", () => {
    const longText = "x".repeat(200);
    const result = withFixedTime(() =>
      buildBlueskyHeader(
        {
          fetchedAt: "2026-01-15T11:00:00Z",
          keywords: ["rust"],
          keywordCounts: { rust: 1 },
          queries: ["rust"],
          queryCounts: { rust: 1 },
          scannedPosts: 1,
          posts: [
            {
              uri: "at://abc",
              cid: "cid1",
              bskyUrl: "https://bsky.app/profile/x/post/1",
              text: longText,
              author: { handle: "x.bsky.social" } as never,
              likeCount: 5,
              repostCount: 2,
              replyCount: 1,
              createdAt: "2026-01-15T11:30:00Z",
              createdUtc: NOW_SEC - 1800,
            },
          ],
        },
        [
          {
            uri: "at://abc",
            cid: "cid1",
            bskyUrl: "https://bsky.app/profile/x/post/1",
            text: longText,
            author: { handle: "x.bsky.social" } as never,
            likeCount: 5,
            repostCount: 2,
            replyCount: 1,
            createdAt: "2026-01-15T11:30:00Z",
            createdUtc: NOW_SEC - 1800,
          },
        ],
      ),
    );

    expect(result.cards).toHaveLength(3);
    expect(result.cards[0].variant).toBe("snapshot");
    expect(result.topStories).toHaveLength(1);
    expect(result.topStories[0].sourceCode).toBe("BS");
    // 200-char body → truncated to 110 chars + ellipsis.
    expect(result.topStories[0].title.endsWith("…")).toBe(true);
    expect(result.topStories[0].title.length).toBeLessThanOrEqual(111);
  });
});

describe("buildDevtoHeaderFromArticles", () => {
  it("dedupes by URL and sorts hero by reactionsCount desc", () => {
    const result = withFixedTime(() =>
      buildDevtoHeaderFromArticles(
        [
          {
            id: 1,
            title: "Why rust is great",
            description: "",
            url: "https://dev.to/a",
            author: { username: "alice", name: "Alice", profileImage: "" },
            reactionsCount: 5,
            commentsCount: 1,
            readingTime: 3,
            publishedAt: "2026-01-15T10:00:00Z",
            tags: ["rust"],
            trendingScore: 0,
            linkedRepos: [],
          },
          {
            // Duplicate URL — must be dropped from dedupe set.
            id: 2,
            title: "Why rust is great",
            description: "",
            url: "https://dev.to/a",
            author: { username: "alice", name: "Alice", profileImage: "" },
            reactionsCount: 5,
            commentsCount: 1,
            readingTime: 3,
            publishedAt: "2026-01-15T10:00:00Z",
            tags: ["rust"],
            trendingScore: 0,
            linkedRepos: [],
          },
          {
            id: 3,
            title: "Other rust article",
            description: "",
            url: "https://dev.to/b",
            author: { username: "bob", name: "Bob", profileImage: "" },
            reactionsCount: 50,
            commentsCount: 8,
            readingTime: 5,
            publishedAt: "2026-01-15T11:00:00Z",
            tags: ["rust"],
            trendingScore: 0,
            linkedRepos: [],
          },
        ],
        [{ fullName: "rust-lang/rust", count7d: 5, reactionsSum7d: 100 }],
      ),
    );

    expect(result.cards).toHaveLength(3);
    if (result.cards[0].variant === "snapshot") {
      // Two unique URLs after dedupe.
      expect(result.cards[0].value).toBe("2");
    }
    expect(result.topStories).toHaveLength(2);
    // Highest reactions first.
    expect(result.topStories[0].title).toBe("Other rust article");
    expect(result.topStories[0].sourceCode).toBe("DV");
  });
});

describe("buildDevtoHeader (mention-bucket wrapper)", () => {
  it("flattens mentions buckets and forwards to buildDevtoHeaderFromArticles", () => {
    const result = withFixedTime(() =>
      buildDevtoHeader(
        {
          fetchedAt: "2026-01-15T11:00:00Z",
          windowDays: 7,
          scannedArticles: 2,
          bodyFetchMode: "description-only",
          mentions: {
            "rust-lang/rust": {
              count7d: 1,
              reactionsSum7d: 5,
              commentsSum7d: 1,
              topArticle: null,
              articles: [
                {
                  id: 1,
                  title: "Rust 2026",
                  description: "",
                  url: "https://dev.to/r",
                  author: {
                    username: "alice",
                    name: "Alice",
                    profileImage: "",
                  },
                  reactionsCount: 5,
                  commentsCount: 1,
                  readingTime: 3,
                  publishedAt: "2026-01-15T10:00:00Z",
                  tags: ["rust"],
                  trendingScore: 0,
                  linkedRepos: [],
                },
              ],
            },
          },
          leaderboard: [],
        },
        [],
      ),
    );

    expect(result.cards).toHaveLength(3);
    expect(result.topStories).toHaveLength(1);
    expect(result.topStories[0].title).toBe("Rust 2026");
  });
});

describe("buildProductHuntHeader", () => {
  it("returns 3 cards and at most 3 hero launches", () => {
    const launch = {
      id: "p1",
      name: "Widgetly",
      tagline: "ship widgets",
      description: "",
      url: "https://www.producthunt.com/posts/widgetly",
      website: null,
      votesCount: 42,
      commentsCount: 3,
      createdAt: "2026-01-15T10:00:00Z",
      thumbnail: null,
      topics: ["ai"],
      makers: [{ name: "Maya", username: "maya" }],
      githubUrl: null,
      linkedRepo: null,
      daysSinceLaunch: 0,
    };
    const result = withFixedTime(() =>
      buildProductHuntHeader(
        {
          lastFetchedAt: "2026-01-15T11:00:00Z",
          windowDays: 7,
          launches: [launch],
        },
        [launch],
      ),
    );
    expect(result.cards).toHaveLength(3);
    if (result.cards[0].variant === "snapshot") {
      expect(result.cards[0].value).toBe("1");
      expect(result.cards[0].hint).toBe("7D WINDOW");
    }
    expect(result.topStories).toHaveLength(1);
    expect(result.topStories[0].sourceCode).toBe("PH");
    expect(result.topStories[0].title).toBe("Widgetly — ship widgets");
    expect(result.topStories[0].byline).toBe("by Maya");
  });
});

describe("buildRedditHeader", () => {
  it("sorts hero stories by score desc and emits R sourceCode", () => {
    const result = withFixedTime(() =>
      buildRedditHeader(
        [
          {
            id: "p1",
            subreddit: "rust",
            title: "Low-score post",
            url: "https://reddit.com/p1",
            permalink: "/r/rust/comments/p1",
            score: 5,
            numComments: 1,
            createdUtc: NOW_SEC - 3600,
            author: "alice",
            repoFullName: null,
          },
          {
            id: "p2",
            subreddit: "rust",
            title: "High-score post",
            url: "https://reddit.com/p2",
            permalink: "/r/rust/comments/p2",
            score: 500,
            numComments: 100,
            createdUtc: NOW_SEC - 7200,
            author: "bob",
            repoFullName: null,
          },
        ],
        {
          totalPosts: 2,
          breakouts24h: 1,
          topicsSurfaced: 0,
          postsWithLinkedRepos: 0,
        },
      ),
    );

    expect(result.cards).toHaveLength(3);
    expect(result.topStories).toHaveLength(2);
    expect(result.topStories[0].title).toBe("High-score post");
    expect(result.topStories[0].sourceCode).toBe("R");
    expect(result.topStories[0].byline).toBe("r/rust");
  });
});

describe("buildLobstersHeader", () => {
  it("returns the cards/topStories shape and emits LZ sourceCode", () => {
    const story = {
      shortId: "abc",
      title: "Reading the kernel source",
      url: "https://lobste.rs/s/abc",
      commentsUrl: "https://lobste.rs/s/abc/comments",
      by: "alice",
      score: 33,
      commentCount: 7,
      createdUtc: NOW_SEC - 7200,
      ageHours: 2,
    };
    const result = withFixedTime(() =>
      buildLobstersHeader(
        {
          fetchedAt: "2026-01-15T11:00:00Z",
          windowHours: 24,
          scannedTotal: 1,
          stories: [story],
        },
        [story],
      ),
    );
    expect(result.cards).toHaveLength(3);
    if (result.cards[0].variant === "snapshot") {
      expect(result.cards[0].hint).toBe("24H WINDOW");
    }
    expect(result.topStories).toHaveLength(1);
    expect(result.topStories[0].sourceCode).toBe("LZ");
    expect(result.topStories[0].byline).toBe("@alice");
  });
});
