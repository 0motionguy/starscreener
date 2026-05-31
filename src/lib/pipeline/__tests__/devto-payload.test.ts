import { test } from "node:test";
import { strict as assert } from "node:assert";

import { isUsableDevtoMentionsPayload } from "../../devto";
import { isUsableDevtoTrendingPayload } from "../../devto-trending";

test("dev.to mentions payload quality rejects cold or empty Redis payloads", () => {
  assert.equal(
    isUsableDevtoMentionsPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      windowDays: 7,
      scannedArticles: 0,
      bodyFetchMode: "description-only",
      mentions: {},
      leaderboard: [],
    }),
    false,
  );
  assert.equal(
    isUsableDevtoMentionsPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      windowDays: 7,
      scannedArticles: 42,
      bodyFetchMode: "full",
      mentions: {
        "cached/project": {
          count7d: 1,
          reactionsSum7d: 10,
          commentsSum7d: 2,
          topArticle: null,
          articles: [],
        },
      },
      leaderboard: [{ fullName: "cached/project", count7d: 1, reactionsSum7d: 10 }],
    }),
    true,
  );
});

test("dev.to trending payload quality rejects cold article lists", () => {
  assert.equal(
    isUsableDevtoTrendingPayload({
      fetchedAt: "1970-01-01T00:00:00.000Z",
      windowDays: 7,
      scannedArticles: 0,
      bodyFetchMode: "description-only",
      articles: [],
    }),
    false,
  );
  assert.equal(
    isUsableDevtoTrendingPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      windowDays: 7,
      scannedArticles: 42,
      bodyFetchMode: "full",
      articles: [
        {
          id: 1,
          title: "Agent writeup",
          description: "cached article",
          url: "https://dev.to/example/agent-writeup",
          author: { username: "example", name: "Example", profileImage: "" },
          reactionsCount: 10,
          commentsCount: 1,
          readingTime: 4,
          publishedAt: "2026-06-01T00:00:00.000Z",
          tags: ["ai"],
          trendingScore: 10,
          linkedRepos: [],
        },
      ],
    }),
    true,
  );
});
