import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAccountsFromEnv,
  parseSearchTimelineResponse,
  TwitterWebProvider,
} from "../_twitter-web-provider";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures/twitter-search-timeline.json");
const fixture: unknown = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function makeFetchResponse({
  status = 200,
  body,
  headers = {},
}: {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}): Response {
  const h = new Headers(headers);
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: h,
  });
}

type EnvMap = Record<string, string | undefined>;

test("loadAccountsFromEnv throws when unset", () => {
  const env: EnvMap = {};
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /unset/,
  );
});

test("loadAccountsFromEnv throws on invalid JSON", () => {
  const env: EnvMap = { TWITTER_WEB_ACCOUNTS_JSON: "not json" };
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /not valid JSON/,
  );
});

test("loadAccountsFromEnv throws when non-array", () => {
  const env: EnvMap = {
    TWITTER_WEB_ACCOUNTS_JSON: JSON.stringify({ authToken: "x", ct0: "y" }),
  };
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /must be a JSON array/,
  );
});

test("loadAccountsFromEnv throws on empty array", () => {
  const env: EnvMap = { TWITTER_WEB_ACCOUNTS_JSON: "[]" };
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /empty array/,
  );
});

test("loadAccountsFromEnv throws on missing authToken", () => {
  const env: EnvMap = {
    TWITTER_WEB_ACCOUNTS_JSON: JSON.stringify([{ ct0: "abc" }]),
  };
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /authToken/,
  );
});

test("loadAccountsFromEnv throws on missing ct0", () => {
  const env: EnvMap = {
    TWITTER_WEB_ACCOUNTS_JSON: JSON.stringify([{ authToken: "abc" }]),
  };
  assert.throws(
    () => loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env),
    /ct0/,
  );
});

test("loadAccountsFromEnv parses valid array", () => {
  const env: EnvMap = {
    TWITTER_WEB_ACCOUNTS_JSON: JSON.stringify([
      { authToken: "a".repeat(40), ct0: "c".repeat(32) },
      { authToken: "b".repeat(40), ct0: "d".repeat(32) },
    ]),
  };
  const accounts = loadAccountsFromEnv("TWITTER_WEB_ACCOUNTS_JSON", env);
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].authToken, "a".repeat(40));
  assert.equal(accounts[1].ct0, "d".repeat(32));
});

test("parseSearchTimelineResponse extracts tweets from fixture", () => {
  const posts = parseSearchTimelineResponse(fixture, "vercel/next.js");
  // fixture has 4 entries: 1 Tweet + 1 SelfThread (filtered) + 1 Cursor (filtered) + 1 Tweet with visibility wrap
  assert.equal(posts.length, 2, `expected 2 posts, got ${posts.length}`);

  const first = posts[0];
  assert.equal(first.id, "1900000000000000001");
  assert.equal(first.authorHandle, "alice_dev");
  assert.equal(first.authorName, "Alice Dev");
  assert.equal(first.url, "https://x.com/alice_dev/status/1900000000000000001");
  assert.equal(first.likeCount, 42);
  assert.equal(first.repostCount, 7);
  assert.equal(first.replyCount, 3);
  assert.equal(first.quoteCount, 1);
  assert.equal(first.viewCount, 12345);
  assert.equal(first.matchedQuery, "vercel/next.js");
  assert.ok(first.content.includes("vercel/next.js"));
  assert.ok(new Date(first.postedAt).getTime() > 0);

  const second = posts[1];
  assert.equal(second.id, "1900000000000000003");
  assert.equal(second.authorHandle, "bob_codes");
  assert.equal(second.likeCount, 100);
});

test("parseSearchTimelineResponse returns [] on empty body", () => {
  assert.deepEqual(parseSearchTimelineResponse({}, "q"), []);
  assert.deepEqual(parseSearchTimelineResponse(null, "q"), []);
  assert.deepEqual(
    parseSearchTimelineResponse(
      {
        data: {
          search_by_raw_query: { search_timeline: { timeline: { instructions: [] } } },
        },
      },
      "q",
    ),
    [],
  );
});

test("TwitterWebProvider.search rotates on 429 and returns from second account", async () => {
  let call = 0;
  const fetchImpl = (async (_url: string): Promise<Response> => {
    call += 1;
    if (call === 1) {
      return makeFetchResponse({
        status: 429,
        body: { errors: [{ code: 88, message: "Rate limit" }] },
        headers: { "x-rate-limit-reset": String(Math.floor(Date.now() / 1000) + 900) },
      });
    }
    return makeFetchResponse({ status: 200, body: fixture });
  }) as unknown as typeof fetch;

  const provider = new TwitterWebProvider({
    accounts: [
      { authToken: "a".repeat(40), ct0: "c".repeat(32) },
      { authToken: "b".repeat(40), ct0: "d".repeat(32) },
    ],
    fetchImpl,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const posts = await provider.search({ query: "vercel/next.js" });
  assert.equal(posts.length, 2);
  assert.equal(call, 2, "expected 2 fetches (rotate on 429)");
  const stats = provider.getStats();
  assert.equal(stats.accountsRateLimited, 1);
  assert.equal(stats.accountsHealthy, 1);
});

test("TwitterWebProvider.search rotates on 401 and marks account dead", async () => {
  let call = 0;
  const fetchImpl = (async (): Promise<Response> => {
    call += 1;
    if (call === 1) {
      return makeFetchResponse({ status: 401, body: { errors: [{ code: 32 }] } });
    }
    return makeFetchResponse({ status: 200, body: fixture });
  }) as unknown as typeof fetch;

  const provider = new TwitterWebProvider({
    accounts: [
      { authToken: "a".repeat(40), ct0: "c".repeat(32) },
      { authToken: "b".repeat(40), ct0: "d".repeat(32) },
    ],
    fetchImpl,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const posts = await provider.search({ query: "anthropic/claude-code" });
  assert.equal(posts.length, 2);
  const stats = provider.getStats();
  assert.equal(stats.accountsHealthy, 1, "one account should remain healthy");
});

test("TwitterWebProvider.search returns [] when all accounts return 401 (throws all-dead)", async () => {
  const fetchImpl = (async (): Promise<Response> => {
    return makeFetchResponse({ status: 401, body: { errors: [{ code: 32 }] } });
  }) as unknown as typeof fetch;

  const provider = new TwitterWebProvider({
    accounts: [
      { authToken: "a".repeat(40), ct0: "c".repeat(32) },
      { authToken: "b".repeat(40), ct0: "d".repeat(32) },
    ],
    fetchImpl,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  await assert.rejects(
    () => provider.search({ query: "foo/bar" }),
    /All Twitter web accounts exhausted/,
  );
});

test("TwitterWebProvider.search returns posts on first-healthy-account success", async () => {
  let call = 0;
  const fetchImpl = (async (): Promise<Response> => {
    call += 1;
    return makeFetchResponse({ status: 200, body: fixture });
  }) as unknown as typeof fetch;

  const provider = new TwitterWebProvider({
    accounts: [{ authToken: "a".repeat(40), ct0: "c".repeat(32) }],
    fetchImpl,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const posts = await provider.search({ query: "vercel/next.js", limit: 10 });
  assert.equal(posts.length, 2);
  assert.equal(call, 1, "should succeed on first call");

  const stats = provider.getStats();
  assert.equal(stats.requests, 1);
  assert.equal(stats.errors, 0);
  assert.equal(stats.accountsHealthy, 1);
});

test("TwitterWebProvider.search returns [] when all accounts exhausted this round but some still healthy on later calls", async () => {
  // Simulate: both accounts return HTTP 500 (all attempted fail this round) — state retains failure counter.
  let call = 0;
  const fetchImpl = (async (): Promise<Response> => {
    call += 1;
    return makeFetchResponse({ status: 500, body: "oops" });
  }) as unknown as typeof fetch;

  const provider = new TwitterWebProvider({
    accounts: [
      { authToken: "a".repeat(40), ct0: "c".repeat(32) },
      { authToken: "b".repeat(40), ct0: "d".repeat(32) },
    ],
    fetchImpl,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const posts = await provider.search({ query: "foo/bar" });
  // Each account makes 1 primary call + 1 retry = 4 total fetches, but no throw because accounts are not "dead" yet (failures < 3).
  assert.deepEqual(posts, []);
  assert.ok(call >= 2, `expected at least 2 fetches, got ${call}`);
});

test("TwitterWebProvider.search handles HTTP 404 query-not-found", async () => {
  const fetchImpl = (async (): Promise<Response> => {
    return makeFetchResponse({ status: 404, body: "not found" });
  }) as unknown as typeof fetch;

  let errorLog = "";
  const provider = new TwitterWebProvider({
    accounts: [{ authToken: "a".repeat(40), ct0: "c".repeat(32) }],
    fetchImpl,
    logger: {
      info: () => {},
      warn: () => {},
      error: (msg) => {
        errorLog += msg;
      },
    },
  });

  const posts = await provider.search({ query: "foo/bar" });
  assert.deepEqual(posts, []);
  assert.ok(
    errorLog.includes("queryId"),
    `expected error log to mention queryId, got: ${errorLog}`,
  );
});
