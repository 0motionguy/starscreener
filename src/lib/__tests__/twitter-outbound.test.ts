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
  BlueskyOutboundAdapter,
  ConsoleOutboundAdapter,
  NullOutboundAdapter,
  ToolboxOutboundAdapter,
} from "../twitter/outbound/adapters";
import { linkFacet } from "../twitter/outbound/adapters/bluesky";
import { _resetSharedTwitterOAuthManagerForTests } from "../twitter/outbound/oauth";
import { partialPublishedRepos } from "../twitter/outbound/audit";
import { FatalConfigError, TransientHttpError } from "../errors";
import type { OutboundTokenProvider } from "../twitter/outbound/types";

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

test("composeDailyBreakouts emits one item per breakout, capped at 10", () => {
  const breakouts = Array.from({ length: 13 }, (_, i) =>
    makeRepo({
      fullName: `acme/repo${i}`,
      starsDelta24h: 100 + i,
      channelsFiring: 3,
    }),
  );
  const thread = composeDailyBreakouts({ breakouts, topIdea: null });
  // Intro + 10 items = 11 posts, no idea spotlight.
  assert.equal(thread.length, 11);
  for (let i = 1; i <= 10; i++) {
    assert.equal(thread[i]!.kind, "daily_breakouts_item");
  }
});

test("composeDailyBreakouts gives every repo item its trendingrepo link", () => {
  const breakouts = Array.from({ length: 10 }, (_, i) =>
    makeRepo({
      fullName: `acme/repo${i}`,
      starsDelta24h: 100 + i,
      channelsFiring: 2,
    }),
  );
  const thread = composeDailyBreakouts({ breakouts, topIdea: null });
  const items = thread.filter((p) => p.kind === "daily_breakouts_item");
  assert.equal(items.length, 10);
  for (let i = 0; i < items.length; i++) {
    assert.ok(
      items[i]!.url?.endsWith(`/repo/acme/repo${i}`),
      `item ${i} url is ${items[i]!.url}`,
    );
  }
});

test("composeDailyBreakouts includes the description and skips a zero delta", () => {
  const repo = makeRepo({
    fullName: "acme/quiet-mover",
    starsDelta24h: 0,
    channelsFiring: 3,
  });
  repo.description = "Local-first vector DB for agents";
  const thread = composeDailyBreakouts({ breakouts: [repo], topIdea: null });
  const line = thread[1]!.text;
  assert.ok(!line.includes("stars in 24h"), `line advertises a zero delta: ${line}`);
  assert.match(line, /3 signals firing/);
  assert.match(line, /Local-first vector DB/);
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
    topBreakouts: [],
    topIdea: null,
    ideasPublishedThisWeek: 0,
    breakoutsThisWeek: 0,
  });
  assert.equal(empty.length, 1);
  assert.equal(empty[0]!.kind, "weekly_recap_intro");

  const populated = composeWeeklyRecap({
    topBreakouts: [makeRepo({ fullName: "vercel/next.js", starsDelta7d: 800 })],
    topIdea: makeIdea({ id: "y" }),
    ideasPublishedThisWeek: 12,
    breakoutsThisWeek: 3,
  });
  assert.equal(populated.length, 3);
});

test("composeWeeklyRecap emits up to 3 breakout items, each linked and in budget", () => {
  const breakouts = Array.from({ length: 5 }, (_, i) =>
    makeRepo({ fullName: `acme/weekly${i}`, starsDelta7d: 1000 - i }),
  );
  const thread = composeWeeklyRecap({
    topBreakouts: breakouts,
    topIdea: null,
    ideasPublishedThisWeek: 4,
    breakoutsThisWeek: 9,
  });
  const items = thread.filter((p) => p.kind === "weekly_recap_item");
  assert.equal(items.length, 3);
  for (let i = 0; i < items.length; i++) {
    assert.ok(
      items[i]!.url?.endsWith(`/repo/acme/weekly${i}`),
      `item ${i} url is ${items[i]!.url}`,
    );
    assert.ok(effectiveLength(items[i]!) <= 280);
  }
  assert.match(items[0]!.text, /🥇/);
  assert.match(items[0]!.text, /\+1\.0K stars this week/);
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
  "TWITTER_OAUTH2_CLIENT_ID",
  "TWITTER_OAUTH2_CLIENT_SECRET",
  "TWITTER_OAUTH2_REFRESH_TOKEN",
  "TWITTER_USERNAME",
  "TOOLBOX_REACH_URL",
  "TOOLBOX_REACH_API_KEY",
  "BLUESKY_IDENTIFIER",
  "BLUESKY_APP_PASSWORD",
  "BLUESKY_SERVICE",
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
  _resetSharedTwitterOAuthManagerForTests();
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

test("selectOutboundAdapter prefers the toolbox engine over every direct X credential", () => {
  (process.env as MutableEnv).TOOLBOX_REACH_URL = "https://api.aiso.tools/v1/reach/publish";
  (process.env as MutableEnv).TOOLBOX_REACH_API_KEY = "tbk";
  (process.env as MutableEnv).TWITTER_OAUTH2_CLIENT_ID = "cid";
  (process.env as MutableEnv).TWITTER_OAUTH2_CLIENT_SECRET = "csecret";
  (process.env as MutableEnv).TWITTER_OAUTH2_REFRESH_TOKEN = "rt";
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "static-token";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ToolboxOutboundAdapter);
  assert.equal(adapter.name, "toolbox_reach");
  assert.equal(adapter.publishes, true);
});

test("selectOutboundAdapter TWITTER_OUTBOUND_MODE=toolbox throws loudly without the env pair", () => {
  (process.env as MutableEnv).TWITTER_OUTBOUND_MODE = "toolbox";
  assert.throws(() => selectOutboundAdapter(), /TOOLBOX_REACH_URL/);
});

test("selectOutboundAdapter TWITTER_OUTBOUND_MODE=bluesky selects Bluesky with creds, throws without", () => {
  (process.env as MutableEnv).TWITTER_OUTBOUND_MODE = "bluesky";
  assert.throws(() => selectOutboundAdapter(), /BLUESKY_IDENTIFIER/);
  (process.env as MutableEnv).BLUESKY_IDENTIFIER = "trendingrepo.bsky.social";
  (process.env as MutableEnv).BLUESKY_APP_PASSWORD = "app-pw";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof BlueskyOutboundAdapter);
  assert.equal(adapter.name, "bluesky");
  assert.equal(adapter.publishes, true);
});

test("selectOutboundAdapter TWITTER_OUTBOUND_MODE=null still wins over toolbox env", () => {
  (process.env as MutableEnv).TOOLBOX_REACH_URL = "https://api.aiso.tools/v1/reach/publish";
  (process.env as MutableEnv).TOOLBOX_REACH_API_KEY = "tbk";
  (process.env as MutableEnv).TWITTER_OUTBOUND_MODE = "null";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof NullOutboundAdapter);
});

test("selectOutboundAdapter prefers the OAuth2 rotation trio over a static token", () => {
  (process.env as MutableEnv).TWITTER_OAUTH2_CLIENT_ID = "cid";
  (process.env as MutableEnv).TWITTER_OAUTH2_CLIENT_SECRET = "csecret";
  (process.env as MutableEnv).TWITTER_OAUTH2_REFRESH_TOKEN = "rt";
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "static-token";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ApiV2OutboundAdapter);
  assert.equal(adapter.publishes, true);
});

test("selectOutboundAdapter ignores a partial OAuth2 trio and falls back to the static token", () => {
  (process.env as MutableEnv).TWITTER_OAUTH2_CLIENT_ID = "cid";
  // secret + refresh token missing
  (process.env as MutableEnv).TWITTER_OAUTH2_USER_TOKEN = "static-token";
  const adapter = selectOutboundAdapter();
  assert.ok(adapter instanceof ApiV2OutboundAdapter);
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
// ToolboxOutboundAdapter — fetch mocking
// ---------------------------------------------------------------------------

test("ToolboxOutboundAdapter POSTs the whole thread once with bearer auth", async () => {
  const calls: Array<{ url: string; auth: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: input.toString(),
      auth:
        (init?.headers as Record<string, string> | undefined)?.Authorization ??
        "",
      body: (init?.body as string) ?? "",
    });
    return new Response(
      JSON.stringify({
        ok: true,
        threadUrl: "https://twitter.com/trendingrepo/status/1",
        posts: [
          { remoteId: "1", url: "https://twitter.com/trendingrepo/status/1", status: "published" },
          { remoteId: "2", url: "https://twitter.com/trendingrepo/status/2", status: "published" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const adapter = new ToolboxOutboundAdapter({
    endpointUrl: "https://api.aiso.tools/v1/reach/publish",
    apiKey: "tbk_test",
    fetchImpl,
  });
  const result = await adapter.postThread([
    { kind: "daily_breakouts_intro", text: "intro", url: "https://trendingrepo.com/breakouts" },
    { kind: "daily_breakouts_item", text: "item" },
  ]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.auth, "Bearer tbk_test");
  const body = JSON.parse(calls[0]!.body) as {
    kind: string;
    posts: Array<{ kind: string; text: string; url: string | null }>;
  };
  assert.equal(body.kind, "thread");
  assert.equal(body.posts.length, 2);
  assert.equal(body.posts[0]!.url, "https://trendingrepo.com/breakouts");
  assert.equal(body.posts[1]!.url, null);
  assert.equal(result.threadUrl, "https://twitter.com/trendingrepo/status/1");
  assert.equal(result.posts[1]!.remoteId, "2");
});

test("ToolboxOutboundAdapter tolerates a bare {ok:true} response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const adapter = new ToolboxOutboundAdapter({
    endpointUrl: "https://api.aiso.tools/v1/reach/publish",
    apiKey: "tbk_test",
    fetchImpl,
  });
  const result = await adapter.postThread([
    { kind: "daily_breakouts_intro", text: "intro" },
    { kind: "daily_breakouts_item", text: "item" },
  ]);
  assert.equal(result.posts.length, 2);
  assert.ok(result.posts.every((p) => p.status === "published"));
  assert.equal(result.threadUrl, null);
});

test("ToolboxOutboundAdapter surfaces non-2xx and ok:false responses", async () => {
  const adapter503 = new ToolboxOutboundAdapter({
    endpointUrl: "https://api.aiso.tools/v1/reach/publish",
    apiKey: "tbk_test",
    fetchImpl: async () => new Response("upstream down", { status: 503 }),
  });
  await assert.rejects(
    () =>
      adapter503.postThread([{ kind: "daily_breakouts_intro", text: "x" }]),
    /Toolbox reach endpoint 503/,
  );

  const adapterNotOk = new ToolboxOutboundAdapter({
    endpointUrl: "https://api.aiso.tools/v1/reach/publish",
    apiKey: "tbk_test",
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: false, error: "rate budget spent" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(
    () =>
      adapterNotOk.postThread([{ kind: "daily_breakouts_intro", text: "x" }]),
    /rate budget spent/,
  );
});

// ---------------------------------------------------------------------------
// BlueskyOutboundAdapter — AT Protocol, fetch mocking
// ---------------------------------------------------------------------------

// A fake AT Proto server: one createSession, then N createRecord calls with
// reply-chaining. Returns at:// uris the adapter maps to bsky.app URLs.
function makeBlueskyFetch(opts?: { failRecordOn?: number; sessionStatus?: number }) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  let recordN = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();
    const body = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>;
    calls.push({ path: url, body });
    if (url.includes("createSession")) {
      if (opts?.sessionStatus && opts.sessionStatus >= 400) {
        return new Response("bad", { status: opts.sessionStatus });
      }
      return new Response(
        JSON.stringify({ accessJwt: "jwt-1", did: "did:plc:abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // createRecord
    recordN += 1;
    if (opts?.failRecordOn && recordN === opts.failRecordOn) {
      return new Response("boom", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        uri: `at://did:plc:abc/app.bsky.feed.post/rkey${recordN}`,
        cid: `cid${recordN}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { fetchImpl, calls: () => calls };
}

test("linkFacet computes UTF-8 byte offsets for the url in the text", () => {
  const url = "https://trendingrepo.com/breakouts";
  const facet = linkFacet(`1/ acme/x\n${url}`, url);
  assert.ok(facet);
  const prefixBytes = new TextEncoder().encode("1/ acme/x\n").length;
  assert.equal(facet!.index.byteStart, prefixBytes);
  assert.equal(facet!.index.byteEnd, prefixBytes + url.length);
  assert.equal(facet!.features[0]!.uri, url);
});

test("BlueskyOutboundAdapter auths once then chains the thread with reply refs", async () => {
  const { fetchImpl, calls } = makeBlueskyFetch();
  const adapter = new BlueskyOutboundAdapter({
    identifier: "trendingrepo.bsky.social",
    appPassword: "app-pw",
    fetchImpl,
  });
  const result = await adapter.postThread([
    { kind: "daily_breakouts_intro", text: "intro", url: "https://trendingrepo.com/breakouts" },
    { kind: "daily_breakouts_item", text: "1/ acme/x", url: "https://trendingrepo.com/repo/acme/x" },
  ]);

  const c = calls();
  assert.equal(c.filter((x) => x.path.includes("createSession")).length, 1);
  const records = c.filter((x) => x.path.includes("createRecord"));
  assert.equal(records.length, 2);
  // First record is the root (no reply); second replies to the first.
  assert.equal(records[0]!.body.reply, undefined);
  const reply = (records[1]!.body.record as Record<string, unknown>).reply as
    | { root: { uri: string }; parent: { uri: string } }
    | undefined;
  assert.equal(reply?.root.uri, "at://did:plc:abc/app.bsky.feed.post/rkey1");
  assert.equal(reply?.parent.uri, "at://did:plc:abc/app.bsky.feed.post/rkey1");
  // Facet attached for the url.
  const rec0 = records[0]!.body.record as Record<string, unknown>;
  assert.ok(Array.isArray(rec0.facets));
  // Result maps at:// → bsky.app profile URL.
  assert.equal(
    result.threadUrl,
    "https://bsky.app/profile/did:plc:abc/post/rkey1",
  );
  assert.ok(result.posts.every((p) => p.status === "published"));
});

test("BlueskyOutboundAdapter re-auths once on a 401 mid-thread", async () => {
  let recordN = 0;
  let sessions = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input.toString();
    if (url.includes("createSession")) {
      sessions += 1;
      return new Response(
        JSON.stringify({ accessJwt: `jwt-${sessions}`, did: "did:plc:abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    recordN += 1;
    const auth = (init?.headers as Record<string, string>).Authorization;
    if (recordN === 1 && auth === "Bearer jwt-1") {
      return new Response("expired", { status: 401 });
    }
    return new Response(
      JSON.stringify({ uri: `at://did:plc:abc/app.bsky.feed.post/r${recordN}`, cid: `c${recordN}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const adapter = new BlueskyOutboundAdapter({
    identifier: "h", appPassword: "p", fetchImpl,
  });
  const result = await adapter.postThread([{ kind: "daily_breakouts_intro", text: "intro" }]);
  assert.equal(sessions, 2); // re-authed once
  assert.equal(result.posts[0]!.status, "published");
});

test("BlueskyOutboundAdapter classifies a 400 session failure as fatal, 503 as transient", async () => {
  const fatal = new BlueskyOutboundAdapter({
    identifier: "h", appPassword: "bad",
    fetchImpl: makeBlueskyFetch({ sessionStatus: 400 }).fetchImpl,
  });
  await assert.rejects(
    () => fatal.postThread([{ kind: "daily_breakouts_intro", text: "x" }]),
    (err: unknown) => err instanceof FatalConfigError,
  );
  const transient = new BlueskyOutboundAdapter({
    identifier: "h", appPassword: "p",
    fetchImpl: makeBlueskyFetch({ sessionStatus: 503 }).fetchImpl,
  });
  await assert.rejects(
    () => transient.postThread([{ kind: "daily_breakouts_intro", text: "x" }]),
    (err: unknown) => err instanceof TransientHttpError,
  );
});

test("BlueskyOutboundAdapter attaches partialPosts when a thread fails mid-way", async () => {
  const { fetchImpl } = makeBlueskyFetch({ failRecordOn: 3 });
  const adapter = new BlueskyOutboundAdapter({ identifier: "h", appPassword: "p", fetchImpl });
  const thread = [
    { kind: "daily_breakouts_intro" as const, text: "intro" },
    { kind: "daily_breakouts_item" as const, text: "1/ acme/one" },
    { kind: "daily_breakouts_item" as const, text: "2/ acme/two" },
  ];
  const breakouts = [{ fullName: "acme/one" }, { fullName: "acme/two" }];
  let caught: unknown;
  try {
    await adapter.postThread(thread);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught);
  // intro (0) + item0 (1) published; item1 (record #3) 429'd. breakouts[0]
  // maps to record index 1 → published.
  assert.deepEqual(partialPublishedRepos(caught, breakouts), ["acme/one"]);
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

test("ApiV2OutboundAdapter attaches partialPosts, and partialPublishedRepos maps them to picks", async () => {
  // Publish intro + item0 + item1, then 429 on item2. The error must carry
  // the 3 published posts so the cron route can still cool-down the 2 repos
  // that actually posted (thread: [intro, item0, item1, item2] → items map
  // to breakouts[0..]).
  let n = 0;
  const fetchImpl: typeof fetch = async () => {
    n += 1;
    if (n <= 3) {
      return new Response(
        JSON.stringify({ data: { id: `id-${n}`, text: "ok" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("rate limited", { status: 429 });
  };
  const adapter = new ApiV2OutboundAdapter({ bearerToken: "t", fetchImpl });
  const thread = [
    { kind: "daily_breakouts_intro" as const, text: "intro" },
    { kind: "daily_breakouts_item" as const, text: "1/ acme/one" },
    { kind: "daily_breakouts_item" as const, text: "2/ acme/two" },
    { kind: "daily_breakouts_item" as const, text: "3/ acme/three" },
  ];
  const breakouts = [
    { fullName: "acme/one" },
    { fullName: "acme/two" },
    { fullName: "acme/three" },
  ];

  let caught: unknown;
  try {
    await adapter.postThread(thread);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "expected postThread to throw");
  // intro published (index 0) + item0 (index 1) + item1 (index 2) → the two
  // items map to breakouts[0] and breakouts[1]; item2/breakouts[2] never
  // posted.
  const featured = partialPublishedRepos(caught, breakouts);
  assert.deepEqual(featured, ["acme/one", "acme/two"]);
});

test("partialPublishedRepos returns empty for a non-partial error", () => {
  assert.deepEqual(partialPublishedRepos(new Error("boom"), [{ fullName: "a/b" }]), []);
});

test("ApiV2OutboundAdapter retries once with a refreshed token on 401", async () => {
  const tokensSeen: string[] = [];
  let refreshes = 0;
  const provider: OutboundTokenProvider = {
    getAccessToken: async () => "expired-token",
    invalidateAndRefresh: async () => {
      refreshes += 1;
      return "fresh-token";
    },
  };
  const fetchImpl: typeof fetch = async (_input, init) => {
    const auth =
      (init?.headers as Record<string, string> | undefined)?.Authorization ??
      "";
    tokensSeen.push(auth.replace("Bearer ", ""));
    if (auth.includes("expired-token")) {
      return new Response("unauthorized", { status: 401 });
    }
    return new Response(
      JSON.stringify({ data: { id: "id-1", text: "ok" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const adapter = new ApiV2OutboundAdapter({
    tokenProvider: provider,
    username: "trendingrepo",
    fetchImpl,
  });
  const result = await adapter.postThread([
    { kind: "daily_breakouts_intro", text: "intro" },
  ]);

  assert.equal(refreshes, 1);
  assert.deepEqual(tokensSeen, ["expired-token", "fresh-token"]);
  assert.equal(result.posts[0]!.status, "published");
});

test("ApiV2OutboundAdapter surfaces the error when the post-refresh retry also 401s", async () => {
  const provider: OutboundTokenProvider = {
    getAccessToken: async () => "t1",
    invalidateAndRefresh: async () => "t2",
  };
  const fetchImpl: typeof fetch = async () =>
    new Response("unauthorized", { status: 401 });
  const adapter = new ApiV2OutboundAdapter({
    tokenProvider: provider,
    fetchImpl,
  });
  await assert.rejects(
    () =>
      adapter.postThread([{ kind: "daily_breakouts_intro", text: "intro" }]),
    /Twitter API 401/,
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
