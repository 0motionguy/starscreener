// Tests for the outbound Twitter surface:
//   - composer (thread structure, length budgeting, truncation)
//   - share URL builder (URL encoding, via handle)
//   - adapter selection by env
//   - api-v2 adapter (fetch mocking — verifies reply chaining + errors)
//
// Pure modules only — no storage setup required for composer/share/
// adapter tests. The audit-row writer lives in src/lib/twitter/outbound/audit
// and is exercised via the cron route integration path, not here.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../types";
import type { PublicIdea } from "../ideas";

import {
  composeDailyBreakouts,
  composeIdeaPublishedPost,
  composeWeeklyRecap,
  effectiveLength,
  isoWeekLabel,
  truncate,
} from "../twitter/outbound/composer";
import { buildShareToXUrl } from "../twitter/outbound/share";
import {
  selectOutboundAdapter,
  ApiV2OutboundAdapter,
  ConsoleOutboundAdapter,
  NullOutboundAdapter,
} from "../twitter/outbound/adapters";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  return {
    id: partial.fullName.replace("/", "--"),
    fullName: partial.fullName,
    name: partial.fullName.split("/")[1] ?? "",
    owner: partial.fullName.split("/")[0] ?? "",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/${partial.fullName}`,
    language: null,
    topics: [],
    categoryId: "devtools",
    stars: partial.stars ?? 1000,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2022-01-01T00:00:00.000Z",
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 100,
    categoryRank: 10,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    channelsFiring: partial.channelsFiring,
    crossSignalScore: partial.crossSignalScore,
  };
}

function makeIdea(partial: Partial<PublicIdea> & { id: string }): PublicIdea {
  return {
    id: partial.id,
    authorHandle: partial.authorHandle ?? "mirko",
    title: partial.title ?? "Ship an MCP wrapper for GitHub diff digests",
    pitch:
      partial.pitch ??
      "A one-line wrapper that turns any repo into a daily diff digest in Telegram and WhatsApp for active forkers.",
    body: partial.body ?? null,
    status: partial.status ?? "published",
    buildStatus: partial.buildStatus ?? "exploring",
    shippedRepoUrl: null,
    targetRepos: partial.targetRepos ?? [],
    category: null,
    tags: [],
    createdAt: partial.createdAt ?? new Date().toISOString(),
    publishedAt: partial.publishedAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// truncate + effectiveLength
// ---------------------------------------------------------------------------

test("truncate returns the input when already short enough", () => {
  assert.equal(truncate("abc", 10), "abc");
});

test("truncate appends a single-char ellipsis when shortening", () => {
  const out = truncate("abcdefghij", 5);
  assert.equal(out.length, 5);
  assert.ok(out.endsWith("…"));
});

test("truncate handles the maxChars=0/1 degenerate cases", () => {
  assert.equal(truncate("anything", 1), "…");
});

test("effectiveLength counts a URL as 24 chars regardless of length", () => {
  const shortUrl = effectiveLength({
    kind: "idea_published",
    text: "abc",
    url: "https://x.co/1",
  });
  const longUrl = effectiveLength({
    kind: "idea_published",
    text: "abc",
    url: "https://trendingrepo.com/ideas/super-long-slug-that-would-blow-out-a-tweet",
  });
  assert.equal(shortUrl, 3 + 24);
  assert.equal(longUrl, 3 + 24);
});

// ---------------------------------------------------------------------------
// composeDailyBreakouts
// ---------------------------------------------------------------------------

test("composeDailyBreakouts always returns at least one intro post", () => {
  const thread = composeDailyBreakouts({ breakouts: [], topIdea: null });
  assert.ok(thread.length >= 1);
  assert.equal(thread[0]!.kind, "daily_breakouts_intro");
});

test("composeDailyBreakouts emits one item per breakout, capped at 3", () => {
  const breakouts = Array.from({ length: 5 }, (_, i) =>
    makeRepo({
      fullName: `acme/repo${i}`,
      starsDelta24h: 100 + i,
      channelsFiring: 3,
    }),
  );
  const thread = composeDailyBreakouts({ breakouts, topIdea: null });
  // Intro + 3 items = 4 posts, no idea spotlight.
  assert.equal(thread.length, 4);
  assert.equal(thread[1]!.kind, "daily_breakouts_item");
  assert.equal(thread[2]!.kind, "daily_breakouts_item");
  assert.equal(thread[3]!.kind, "daily_breakouts_item");
});

test("composeDailyBreakouts adds idea spotlight as the last post", () => {
  const thread = composeDailyBreakouts({
    breakouts: [],
    topIdea: makeIdea({ id: "abc" }),
  });
  assert.equal(thread.length, 2); // intro + spotlight
  assert.equal(thread[1]!.kind, "daily_breakouts_idea_spotlight");
  assert.match(thread[1]!.text, /Top idea/);
  assert.ok(thread[1]!.url?.endsWith("/ideas/abc"));
});

test("composeDailyBreakouts every post is within Twitter's 280-char budget", () => {
  const breakouts = [
    makeRepo({
      fullName: "a/very-long-repo-name-that-approaches-the-practical-github-limit-because-sometimes-people-do-this",
      starsDelta24h: 12345,
      channelsFiring: 3,
    }),
  ];
  const longIdea = makeIdea({
    id: "x",
    title:
      "A deliberately extremely long idea title to see what happens when the composer has to truncate for the spotlight format aggressively",
  });
  const thread = composeDailyBreakouts({
    breakouts,
    topIdea: longIdea,
  });
  for (const post of thread) {
    assert.ok(
      effectiveLength(post) <= 280,
      `post kind=${post.kind} is ${effectiveLength(post)} chars > 280`,
    );
  }
});

test("composeDailyBreakouts formats a breakout line with k-style delta and signal count", () => {
  const breakouts = [
    makeRepo({
      fullName: "vercel/next.js",
      starsDelta24h: 1200,
      channelsFiring: 3,
    }),
  ];
  const thread = composeDailyBreakouts({ breakouts, topIdea: null });
  const line = thread[1]!.text;
  assert.match(line, /1\//);
  assert.match(line, /vercel\/next\.js/);
  assert.match(line, /\+1\.2K/);
  assert.match(line, /3 signals firing/);
});

// ---------------------------------------------------------------------------
// composeWeeklyRecap
// ---------------------------------------------------------------------------

test("composeWeeklyRecap always returns an intro; optional top items follow", () => {
  const empty = composeWeeklyRecap({
    topBreakout: null,
    topIdea: null,
    ideasPublishedThisWeek: 0,
    breakoutsThisWeek: 0,
  });
  assert.equal(empty.length, 1);
  assert.equal(empty[0]!.kind, "weekly_recap_intro");

  const populated = composeWeeklyRecap({
    topBreakout: makeRepo({ fullName: "vercel/next.js", starsDelta7d: 800 }),
    topIdea: makeIdea({ id: "y" }),
    ideasPublishedThisWeek: 12,
    breakoutsThisWeek: 3,
  });
  assert.equal(populated.length, 3);
});

test("isoWeekLabel returns YYYY-Wnn format", () => {
  const jan4 = new Date("2026-01-04T12:00:00Z"); // week 1 of 2026
  assert.match(isoWeekLabel(jan4), /^\d{4}-W\d{2}$/);
});

// ---------------------------------------------------------------------------
// composeIdeaPublishedPost
// ---------------------------------------------------------------------------

test("composeIdeaPublishedPost fits in 280 chars after URL shortening", () => {
  const idea = makeIdea({
    id: "z",
    pitch:
      "A pitch that is exactly at the 280-char upper limit minus the URL budget minus the prefix will require the composer to truncate and still land below the cap. " +
      "More padding here to push the pitch to the maximum the composer will accept without breaking the tweet.",
  });
  const post = composeIdeaPublishedPost(idea);
  assert.ok(
    effectiveLength(post) <= 280,
    `idea_published post is ${effectiveLength(post)} chars`,
  );
});

test("composeIdeaPublishedPost leaves short pitches verbatim", () => {
  const idea = makeIdea({
    id: "short",
    pitch: "Short pitch that easily fits within the budget.",
  });
  const post = composeIdeaPublishedPost(idea);
  assert.ok(post.text.includes("Short pitch"));
  assert.equal(post.text.endsWith("…"), false);
});

// ---------------------------------------------------------------------------
// buildShareToXUrl
// ---------------------------------------------------------------------------

test("buildShareToXUrl URL-encodes text and url params", () => {
  const url = buildShareToXUrl({
    text: "Hello world & friends",
    url: "https://trendingrepo.com/ideas/abc?x=1",
  });
  assert.match(url, /text=Hello\+world\+%26\+friends/);
  assert.match(url, /url=https%3A%2F%2Ftrendingrepo\.com%2Fideas%2Fabc%3Fx%3D1/);
});

test("buildShareToXUrl strips leading @ from via handle", () => {
  const url = buildShareToXUrl({
    text: "hi",
    url: "https://trendingrepo.com",
    via: ["@@trendingrepo"],
  });
  assert.match(url, /via=trendingrepo/);
  assert.ok(!url.includes("via=%40"));
});

test("buildShareToXUrl omits via when the handle is empty", () => {
  const url = buildShareToXUrl({
    text: "hi",
    url: "https://trendingrepo.com",
    via: [""],
  });
  assert.ok(!url.includes("via="));
});

// ---------------------------------------------------------------------------
// Adapter selection
// ---------------------------------------------------------------------------

// `process.env.NODE_ENV` is typed as readonly `'development' | 'production'
// | 'test'` in recent @types/node, so we mutate via a loose cast. The
// tests swap it in/out per-case to cover the dev vs prod selection rules.
const ENV_KEYS = [
  "TWITTER_OUTBOUND_MODE",
  "TWITTER_OAUTH2_USER_TOKEN",
  "TWITTER_USERNAME",
  "NODE_ENV",
] as const;
const savedEnv: Record<string, string | undefined> = {};

type MutableEnv = Record<string, string | undefined>;

beforeEach(() => {
  const env = process.env as MutableEnv;
  for (const k of ENV_KEYS) {
    savedEnv[k] = env[k];
    delete env[k];
  }
});

afterEach(() => {
  const env = process.env as MutableEnv;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete env[k];
    } else {
      env[k] = savedEnv[k];
    }
  }
});

test("selectOutboundAdapter returns NullOutboundAdapter in prod with no token", () => {
  (process.env as MutableEnv).NODE_ENV = "production";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof NullOutboundAdapter);
  assert.equal(adapter.publishes, false);
});

test("selectOutboundAdapter returns ConsoleOutboundAdapter in dev with no token", () => {
  (process.env as MutableEnv).NODE_ENV = "development";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ConsoleOutboundAdapter);
  assert.equal(adapter.publishes, false);
});

test("selectOutboundAdapter returns ApiV2OutboundAdapter when token is set", () => {
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "test-token";
  (process.env as MutableEnv).TWITTER_USERNAME = "trendingrepo";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ApiV2OutboundAdapter);
  assert.equal(adapter.publishes, true);
});

test("selectOutboundAdapter TWITTER_OUTBOUND_MODE=null overrides token", () => {
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "test-token";
  (process.env as MutableEnv).TWITTER_OUTBOUND_MODE = "null";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof NullOutboundAdapter);
});

test("selectOutboundAdapter TWITTER_OUTBOUND_MODE=console overrides token", () => {
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "test-token";
  (process.env as MutableEnv).TWITTER_OUTBOUND_MODE = "console";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ConsoleOutboundAdapter);
});

// ---------------------------------------------------------------------------
// ApiV2OutboundAdapter — fetch mocking
// ---------------------------------------------------------------------------

test("ApiV2OutboundAdapter chains replies for multi-post threads", async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({
      url,
      body: (init?.body as string) ?? "",
    });
    const id = `id-${calls.length}`;
    return new Response(
      JSON.stringify({ data: { id, text: `tweet ${calls.length}` } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const adapter = new ApiV2OutboundAdapter({
    bearerToken: "t",
    username: "trendingrepo",
    fetchImpl,
  });
  const result = await adapter.postThread([
    { kind: "daily_breakouts_intro", text: "intro" },
    { kind: "daily_breakouts_item", text: "item 1" },
    { kind: "daily_breakouts_item", text: "item 2" },
  ]);

  assert.equal(calls.length, 3);
  assert.equal(result.posts.length, 3);

  const secondBody = JSON.parse(calls[1]!.body) as {
    reply?: { in_reply_to_tweet_id: string };
  };
  const thirdBody = JSON.parse(calls[2]!.body) as {
    reply?: { in_reply_to_tweet_id: string };
  };
  assert.equal(secondBody.reply?.in_reply_to_tweet_id, "id-1");
  assert.equal(thirdBody.reply?.in_reply_to_tweet_id, "id-2");

  assert.equal(result.threadUrl, "https://twitter.com/trendingrepo/status/id-1");
});

test("ApiV2OutboundAdapter surfaces API errors", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("rate limited", { status: 429 });
  const adapter = new ApiV2OutboundAdapter({
    bearerToken: "t",
    fetchImpl,
  });
  await assert.rejects(
    () =>
      adapter.postThread([
        { kind: "daily_breakouts_intro", text: "intro" },
      ]),
    /Twitter API 429/,
  );
});

test("ApiV2OutboundAdapter refuses to post a body that exceeds 280 after URL shortening", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ data: { id: "x", text: "" } }));
  const adapter = new ApiV2OutboundAdapter({
    bearerToken: "t",
    fetchImpl,
  });
  await assert.rejects(
    () =>
      adapter.postThread([
        {
          kind: "daily_breakouts_intro",
          text: "x".repeat(270),
          url: "https://trendingrepo.com",
        },
      ]),
    /over Twitter's 280 cap/,
  );
});
