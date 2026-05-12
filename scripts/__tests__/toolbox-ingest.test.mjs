import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hnMentionsToEvents,
  redditMentionsToEvents,
  postToolboxEvents,
} from "../_toolbox-ingest.mjs";

const FAKE_HN_PAYLOAD = {
  fetchedAt: "2026-05-12T04:00:00Z",
  mentions: {
    "vercel/next.js": {
      count7d: 5,
      scoreSum7d: 1234,
      everHitFrontPage: true,
      topStory: { id: 1, title: "Show HN: Next.js" },
      stories: [
        { id: 1, title: "Show HN: Next.js", score: 600 },
        { id: 2, title: "Next.js 15 released", score: 400 },
      ],
    },
    "ollama/ollama": {
      count7d: 2,
      scoreSum7d: 300,
      everHitFrontPage: false,
      stories: [],
    },
  },
};

const FAKE_REDDIT_PAYLOAD = {
  mentions: {
    "anthropics/claude-code": {
      count7d: 8,
      scoreSum7d: 2200,
      topPost: { id: "r1", title: "Claude Code is amazing", score: 800 },
      posts: [{ id: "r1", title: "Claude Code is amazing", score: 800 }],
    },
  },
};

test("hnMentionsToEvents — emits one event per repo with correct shape", () => {
  const events = hnMentionsToEvents(FAKE_HN_PAYLOAD);
  assert.equal(events.length, 2);

  const next = events.find((e) =>
    e.target_url.includes("vercel/next.js"),
  );
  assert.ok(next);
  assert.equal(next.signal_type, "trending.hn.mentions");
  assert.equal(next.target_url, "https://github.com/vercel/next.js");
  assert.equal(next.produced_by, "trendingrepo-hn");
  // Confidence is 1.0 for every normalized entry.
  for (const n of next.normalized) {
    assert.equal(n.confidence, 1.0);
  }
  // Verify key contents.
  const keys = next.normalized.map((n) => n.key);
  assert.ok(keys.includes("count_7d"));
  assert.ok(keys.includes("score_sum_7d"));
  assert.ok(keys.includes("ever_hit_front_page"));
  assert.ok(keys.includes("top_story"));
  assert.ok(keys.includes("stories_top10"));
  // Stories should be capped (we passed 2, within 10).
  const stories = next.normalized.find((n) => n.key === "stories_top10").value;
  assert.equal(stories.length, 2);
});

test("hnMentionsToEvents — caps stories at 10 per repo", () => {
  const fattyPayload = {
    mentions: {
      "owner/repo": {
        count7d: 99,
        scoreSum7d: 99999,
        stories: Array.from({ length: 50 }, (_, i) => ({
          id: i,
          title: `story-${i}`,
        })),
      },
    },
  };
  const events = hnMentionsToEvents(fattyPayload);
  const stories = events[0].normalized.find((n) => n.key === "stories_top10").value;
  assert.equal(stories.length, 10);
});

test("hnMentionsToEvents — skips malformed mentions", () => {
  const bad = {
    mentions: {
      "no-slash-here": { count7d: 1 }, // invalid full_name (no '/')
      "owner/repo": null, // null value
      "valid/repo": { count7d: 3, scoreSum7d: 100 }, // valid
    },
  };
  const events = hnMentionsToEvents(bad);
  assert.equal(events.length, 1);
  assert.ok(events[0].target_url.endsWith("valid/repo"));
});

test("hnMentionsToEvents — returns empty array on missing payload", () => {
  assert.deepEqual(hnMentionsToEvents(null), []);
  assert.deepEqual(hnMentionsToEvents({}), []);
  assert.deepEqual(hnMentionsToEvents({ mentions: null }), []);
});

test("redditMentionsToEvents — emits one event per repo", () => {
  const events = redditMentionsToEvents(FAKE_REDDIT_PAYLOAD);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.reddit.mentions");
  assert.equal(
    events[0].target_url,
    "https://github.com/anthropics/claude-code",
  );
  assert.equal(events[0].produced_by, "trendingrepo-reddit");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("count_7d"));
  assert.ok(keys.includes("score_sum_7d"));
  assert.ok(keys.includes("top_post"));
  assert.ok(keys.includes("posts_top10"));
});

test("postToolboxEvents — returns skipped when env unset", async () => {
  const prevUrl = process.env.TOOLBOX_INGEST_URL;
  const prevSecret = process.env.TOOLBOX_INGEST_HMAC_SECRET;
  delete process.env.TOOLBOX_INGEST_URL;
  delete process.env.TOOLBOX_INGEST_HMAC_SECRET;
  try {
    const result = await postToolboxEvents([{ scan_id: "x" }]);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "env_unset");
  } finally {
    if (prevUrl !== undefined) process.env.TOOLBOX_INGEST_URL = prevUrl;
    if (prevSecret !== undefined)
      process.env.TOOLBOX_INGEST_HMAC_SECRET = prevSecret;
  }
});

test("postToolboxEvents — returns skipped on empty events array", async () => {
  process.env.TOOLBOX_INGEST_URL = "https://example.test/v1/signals/ingest";
  process.env.TOOLBOX_INGEST_HMAC_SECRET = "fake";
  try {
    const result = await postToolboxEvents([]);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "no_events");
  } finally {
    delete process.env.TOOLBOX_INGEST_URL;
    delete process.env.TOOLBOX_INGEST_HMAC_SECRET;
  }
});
