import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hnMentionsToEvents,
  redditMentionsToEvents,
  bskyMentionsToEvents,
  devtoMentionsToEvents,
  producthuntLaunchesToEvents,
  huggingfaceModelsToEvents,
  huggingfaceSpacesToEvents,
  huggingfaceDatasetsToEvents,
  npmPackagesToEvents,
  openaiRssToEvents,
  deltasToEvents,
  ossInsightTrendingToEvents,
  npmDependentsToEvents,
  fundingNewsToEvents,
  fundingSecFormdToEvents,
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

test("bskyMentionsToEvents — emits one event per repo with bluesky-specific metrics", () => {
  const payload = {
    mentions: {
      "vercel/next.js": {
        count7d: 3,
        likesSum7d: 50,
        repostsSum7d: 12,
        repliesSum7d: 8,
        topPost: { bskyUrl: "https://bsky.app/profile/x/post/y", text: "Wow Next.js" },
        posts: [{ bskyUrl: "https://bsky.app/profile/x/post/y" }],
      },
    },
  };
  const events = bskyMentionsToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.bluesky.mentions");
  assert.equal(events[0].target_url, "https://github.com/vercel/next.js");
  assert.equal(events[0].produced_by, "trendingrepo-bluesky");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("count_7d"));
  assert.ok(keys.includes("likes_sum_7d"));
  assert.ok(keys.includes("reposts_sum_7d"));
  assert.ok(keys.includes("replies_sum_7d"));
  assert.ok(keys.includes("top_post"));
  assert.ok(keys.includes("posts_top10"));
});

test("devtoMentionsToEvents — emits one event per repo with devto-specific metrics", () => {
  const payload = {
    mentions: {
      "ollama/ollama": {
        count7d: 4,
        reactionsSum7d: 120,
        commentsSum7d: 15,
        topArticle: { id: 1, title: "Running Ollama locally", reactions: 80 },
        articles: [{ id: 1, title: "Running Ollama locally" }],
      },
    },
  };
  const events = devtoMentionsToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.devto.mentions");
  assert.equal(events[0].target_url, "https://github.com/ollama/ollama");
  assert.equal(events[0].produced_by, "trendingrepo-devto");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("count_7d"));
  assert.ok(keys.includes("reactions_sum_7d"));
  assert.ok(keys.includes("comments_sum_7d"));
  assert.ok(keys.includes("top_article"));
  assert.ok(keys.includes("articles_top10"));
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

test("producthuntLaunchesToEvents — emits one event per launch with PH metrics", () => {
  const payload = {
    launches: [
      {
        id: 12345,
        name: "Cool Product",
        tagline: "Does cool things",
        url: "https://www.producthunt.com/posts/cool-product",
        website: "https://cool.example",
        votesCount: 250,
        commentsCount: 30,
        createdAt: "2026-05-12T00:00:00Z",
        topics: ["AI", "Productivity"],
        makers: [{ name: "Alice" }],
        thumbnail: "https://ph.example/img.png",
      },
    ],
  };
  const events = producthuntLaunchesToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.producthunt.launches");
  assert.equal(events[0].target_url, "https://www.producthunt.com/posts/cool-product");
  assert.equal(events[0].produced_by, "trendingrepo-producthunt");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("votes_count"));
  assert.ok(keys.includes("comments_count"));
  assert.ok(keys.includes("topics"));
  assert.ok(keys.includes("makers"));
});

test("huggingfaceModelsToEvents — emits one event per model, caps at 100", () => {
  const payload = {
    models: Array.from({ length: 150 }, (_, i) => ({
      rank: i,
      id: `author${i}/model${i}`,
      author: `author${i}`,
      url: `https://huggingface.co/author${i}/model${i}`,
      downloads: i * 100,
      likes: i * 5,
      trendingScore: i * 0.5,
      pipelineTag: "text-generation",
      tags: ["llm", "transformer"],
    })),
  };
  const events = huggingfaceModelsToEvents(payload);
  assert.equal(events.length, 100); // capped
  assert.equal(events[0].signal_type, "trending.huggingface.models");
  assert.ok(events[0].target_url.startsWith("https://huggingface.co/"));
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("downloads"));
  assert.ok(keys.includes("pipeline_tag"));
  assert.ok(keys.includes("trending_score"));
});

test("huggingfaceSpacesToEvents — emits one event per space, caps at 50", () => {
  const payload = {
    spaces: [
      {
        rank: 1,
        id: "user/space",
        author: "user",
        url: "https://huggingface.co/spaces/user/space",
        likes: 200,
        trendingScore: 75.5,
        sdk: "gradio",
        models: ["meta-llama/Llama-3"],
        tags: ["chatbot"],
      },
    ],
  };
  const events = huggingfaceSpacesToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.huggingface.spaces");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("sdk"));
  assert.ok(keys.includes("models"));
});

test("huggingfaceDatasetsToEvents — emits one event per dataset", () => {
  const payload = {
    datasets: [
      {
        rank: 1,
        id: "user/dataset",
        author: "user",
        url: "https://huggingface.co/datasets/user/dataset",
        downloads: 10000,
        likes: 500,
        trendingScore: 95.0,
        tags: ["text", "english"],
      },
    ],
  };
  const events = huggingfaceDatasetsToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.huggingface.datasets");
});

test("npmPackagesToEvents — emits one event per package, captures linkedRepo", () => {
  const payload = {
    packages: [
      {
        name: "react",
        npmUrl: "https://www.npmjs.com/package/react",
        description: "React",
        latestVersion: "18.0.0",
        publishedAt: "2026-05-01",
        repositoryUrl: "https://github.com/facebook/react",
        linkedRepo: "facebook/react",
        homepage: "https://react.dev",
        downloads: { weekly: 20000000 },
        keywords: ["react", "library"],
      },
    ],
  };
  const events = npmPackagesToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.npm.packages");
  assert.equal(events[0].target_url, "https://www.npmjs.com/package/react");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("linked_repo"));
  assert.ok(keys.includes("repository_url"));
  assert.ok(keys.includes("downloads"));
});

test("openaiRssToEvents — emits one event per RSS item", () => {
  const payload = {
    items: [
      {
        id: "openai-1",
        title: "Introducing GPT-5",
        url: "https://openai.com/blog/gpt-5",
        summary: "We're announcing GPT-5...",
        publishedAt: "2026-05-12T00:00:00Z",
        author: "OpenAI",
        category: "announcement",
        source: "openai.com",
      },
    ],
  };
  const events = openaiRssToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "content.openai.announcements");
  assert.equal(events[0].target_url, "https://openai.com/blog/gpt-5");
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

// --- batch4: deltas, ossinsight-trending, npm-dependents, funding-news, sec-form-d ---

const FAKE_DELTAS_PAYLOAD = {
  computedAt: "2026-05-12T07:00:00Z",
  windows: ["1h", "24h", "7d", "30d"],
  repos: {
    "10270250": {
      stars_now: 235000,
      delta_1h: { value: 4, basis: "exact" },
      delta_24h: { value: 80, basis: "exact" },
      delta_7d: { value: 600, basis: "nearest" },
      delta_30d: { value: 2400, basis: "nearest" },
    },
    "9999999": {
      stars_now: 100,
      delta_1h: { value: 0, basis: "nearest" },
    },
  },
};

// Mirrors production data/repo-metadata.json shape (items[] with githubId+fullName).
const FAKE_REPO_METADATA = {
  fetchedAt: "2026-05-12T07:00:00Z",
  sourceCount: 1,
  items: [
    { githubId: 10270250, fullName: "facebook/react" },
    // 9999999 deliberately not in metadata — should be skipped
  ],
};

// Also test the legacy `{ repos: [{ id, full_name }] }` shape for backward-compat.
const FAKE_REPO_METADATA_LEGACY = {
  repos: [{ id: 10270250, full_name: "facebook/react" }],
};

test("deltasToEvents — emits stars-velocity event per mapped repo", () => {
  const events = deltasToEvents(FAKE_DELTAS_PAYLOAD, FAKE_REPO_METADATA);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "trending.github.stars.velocity");
  assert.equal(events[0].target_url, "https://github.com/facebook/react");
  assert.equal(events[0].produced_by, "trendingrepo-deltas");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("stars_now"));
  assert.ok(keys.includes("delta_24h"));
  // Confidence 1.0 for exact basis, 0.7 for nearest.
  const d24 = events[0].normalized.find((n) => n.key === "delta_24h");
  assert.equal(d24.confidence, 1.0);
  const d7 = events[0].normalized.find((n) => n.key === "delta_7d");
  assert.equal(d7.confidence, 0.7);
});

test("deltasToEvents — skips repos missing from metadata", () => {
  const events = deltasToEvents(FAKE_DELTAS_PAYLOAD, FAKE_REPO_METADATA);
  // Only 10270250 is mapped; 9999999 is dropped.
  assert.equal(events.filter((e) => e.signal_type === "trending.github.stars.velocity").length, 1);
});

test("deltasToEvents — emits fork-velocity event when forks_now present", () => {
  const payload = {
    repos: {
      "10270250": {
        stars_now: 100,
        forks_now: 50,
        fork_delta_24h: { value: 5 },
      },
    },
  };
  const events = deltasToEvents(payload, FAKE_REPO_METADATA);
  assert.equal(events.length, 2);
  const fork = events.find((e) => e.signal_type === "trending.github.fork.velocity");
  assert.ok(fork);
  const keys = fork.normalized.map((n) => n.key);
  assert.ok(keys.includes("forks_now"));
  assert.ok(keys.includes("fork_delta_24h"));
});

test("deltasToEvents — returns empty on missing payload or metadata", () => {
  assert.deepEqual(deltasToEvents(null, FAKE_REPO_METADATA), []);
  assert.deepEqual(deltasToEvents(FAKE_DELTAS_PAYLOAD, null), []);
});

test("deltasToEvents — accepts legacy { repos: [{ id, full_name }] } shape", () => {
  const events = deltasToEvents(FAKE_DELTAS_PAYLOAD, FAKE_REPO_METADATA_LEGACY);
  assert.equal(events.length, 1);
  assert.equal(events[0].target_url, "https://github.com/facebook/react");
});

test("ossInsightTrendingToEvents — flattens buckets, dedupes by repo", () => {
  const payload = {
    buckets: {
      past_24_hours: {
        All: [
          { repo_name: "vercel/next.js", stars: 130000, total_score: 99 },
          { repo_name: "ollama/ollama", stars: 90000, total_score: 88 },
        ],
        TypeScript: [
          { repo_name: "vercel/next.js", stars: 130000, total_score: 95 },
        ],
      },
      past_week: {
        All: [
          { repo_name: "vercel/next.js", stars: 130001, total_score: 70 },
        ],
      },
    },
  };
  const events = ossInsightTrendingToEvents(payload);
  // 2 unique repos.
  assert.equal(events.length, 2);
  assert.equal(events[0].signal_type, "trending.github.repos");
  // next.js should appear first (3 appearances vs 1 for ollama).
  assert.ok(events[0].target_url.endsWith("vercel/next.js"));
  const appearances = events[0].normalized.find((n) => n.key === "appearances_count").value;
  assert.equal(appearances, 3);
});

test("ossInsightTrendingToEvents — caps at 200 unique repos", () => {
  const buckets = { past_24_hours: { All: [] } };
  for (let i = 0; i < 300; i++) {
    buckets.past_24_hours.All.push({
      repo_name: `owner${i}/repo${i}`,
      stars: 1000 - i,
      total_score: 100 - i,
    });
  }
  const events = ossInsightTrendingToEvents({ buckets });
  assert.equal(events.length, 200);
});

test("npmDependentsToEvents — emits one event per package, skips null counts", () => {
  const payload = {
    fetchedAt: "2026-05-12T07:00:00Z",
    dependents: {
      "react": { count: 250000, fetchedAt: "2026-05-12T06:00:00Z" },
      "lodash": { count: null }, // skipped
      "express": { count: 80000 },
    },
  };
  const events = npmDependentsToEvents(payload);
  assert.equal(events.length, 2);
  const react = events.find((e) => e.target_url.endsWith("/react"));
  assert.ok(react);
  assert.equal(react.signal_type, "trending.npm.dependents");
  assert.equal(react.target_url, "https://www.npmjs.com/package/react");
  assert.equal(react.produced_by, "trendingrepo-npm-dependents");
  const dc = react.normalized.find((n) => n.key === "dependents_count");
  assert.equal(dc.value, 250000);
});

test("fundingNewsToEvents — emits one event per signal + cross-link to GitHub (real shape)", () => {
  // Mirrors production data/funding-news.json shape: extracted.companyName,
  // extracted.amount, extracted.roundType (NOT company / amountUsd / stage).
  const payload = {
    signals: [
      {
        id: "fn-1",
        headline: "Acme raises $20M",
        sourceUrl: "https://techcrunch.com/2026/05/12/acme-series-a",
        publishedAt: "2026-05-12T00:00:00Z",
        sourcePlatform: "techcrunch",
        extracted: {
          companyName: "Acme",
          companyWebsite: "https://acme.example",
          roundType: "Series A",
          amount: 20,
          amountDisplay: "$20M",
          currency: "USD",
          investors: ["Sequoia", "a16z"],
          confidence: "high",
          githubUrl: "https://github.com/acme/acme",
        },
      },
      {
        id: "fn-2",
        headline: "Beta seed round",
        sourceUrl: "https://news.example/beta-seed",
        publishedAt: "2026-05-11T00:00:00Z",
        sourcePlatform: "news",
        extracted: {
          companyName: "Beta",
          roundType: "Seed",
          amount: 1.5,
          investors: ["Y Combinator"],
        },
      },
    ],
  };
  const events = fundingNewsToEvents(payload);
  // 2 signals, 1 has cross-link → 3 events.
  assert.equal(events.length, 3);
  assert.equal(events[0].signal_type, "funding.startup");
  assert.equal(events[0].target_url, "https://techcrunch.com/2026/05/12/acme-series-a");
  // Cross-link event present.
  const crossLink = events.find((e) => e.target_url === "https://github.com/acme/acme");
  assert.ok(crossLink);
  // Beta has no cross-link.
  const beta = events.filter((e) => e.target_url.includes("beta-seed"));
  assert.equal(beta.length, 1);
  // Real keys present.
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("company"));
  assert.ok(keys.includes("amount_usd"));
  assert.ok(keys.includes("round_stage"));
  assert.ok(keys.includes("currency"));
});

test("fundingNewsToEvents — null-valued fields are stripped (jsonb NOT NULL)", () => {
  const payload = {
    signals: [
      {
        sourceUrl: "https://news.example/x",
        headline: "X raised some money",
        publishedAt: "2026-05-12T00:00:00Z",
        // extracted is missing entirely — only headline + published_at survive
      },
    ],
  };
  const events = fundingNewsToEvents(payload);
  assert.equal(events.length, 1);
  // headline + published_at; NO null amount_usd / company / etc.
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("headline"));
  assert.ok(keys.includes("published_at"));
  assert.ok(!keys.includes("amount_usd"));
  assert.ok(!keys.includes("company"));
});

test("fundingSecFormdToEvents — emits one event per signal, no cross-link (real shape)", () => {
  const payload = {
    signals: [
      {
        id: "sec-1",
        headline: "Form D filed by Foo Inc",
        sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001234567",
        publishedAt: "2026-05-12T00:00:00Z",
        extracted: {
          companyName: "Foo Inc",
          amount: 5_000_000,
          amountDisplay: "$5M",
          currency: "USD",
          roundType: "undisclosed",
          industryGroup: "SaaS",
          confidence: "high",
        },
      },
    ],
  };
  const events = fundingSecFormdToEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].signal_type, "funding.sec.formd");
  assert.equal(events[0].produced_by, "trendingrepo-sec");
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("industry_group"));
  assert.ok(keys.includes("amount_usd"));
  assert.ok(keys.includes("currency"));
  assert.ok(keys.includes("company"));
});

test("deltasToEvents — strips null delta values (jsonb NOT NULL)", () => {
  const payload = {
    repos: {
      "10270250": {
        stars_now: 100,
        delta_1h: { value: null, basis: "repo-not-tracked" },
        delta_24h: { value: 5, basis: "exact" },
        // delta_7d / 30d missing entirely
      },
    },
  };
  const events = deltasToEvents(payload, FAKE_REPO_METADATA);
  assert.equal(events.length, 1);
  const keys = events[0].normalized.map((n) => n.key);
  assert.ok(keys.includes("stars_now"));
  assert.ok(keys.includes("delta_24h"));
  // Null delta_1h.value gets stripped, but basis is still kept.
  assert.ok(!keys.includes("delta_1h"));
  assert.ok(keys.includes("delta_1h_basis"));
  assert.ok(!keys.includes("delta_7d"));
});
