import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchRedditJson,
  getRedditAuthMode,
  getRedditFetchRuntime,
  getRedditUserAgent,
  hasRedditOAuthCreds,
  resetRedditAuthCacheForTests,
  resolveRedditApiUrl,
} from "../_reddit-shared.mjs";

function withEnv(overrides, fn) {
  const prev = {
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
    REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT,
    REDDIT_USER_AGENTS: process.env.REDDIT_USER_AGENTS,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  resetRedditAuthCacheForTests();

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(prev)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
      resetRedditAuthCacheForTests();
    });
}

test("reddit shared: defaults to public-json without oauth creds", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: null,
      REDDIT_CLIENT_SECRET: null,
      REDDIT_USER_AGENT: null,
    },
    async () => {
      assert.equal(hasRedditOAuthCreds(), false);
      assert.equal(getRedditAuthMode(), "public-json");
      // T4.2 / 2026-04-23 anti-bot fix: default UA was changed from
      // "StarScreener/0.1 …" to a real-browser Chrome UA after Reddit
      // started 403'ing the original from GitHub Actions IPs. The test
      // assertion now matches the Chrome UA family; setting
      // REDDIT_USER_AGENT explicitly still overrides per the OAuth tests.
      assert.match(getRedditUserAgent(), /Mozilla\/5\.0.+Chrome/);
      assert.equal(
        resolveRedditApiUrl("https://www.reddit.com/r/OpenAI/new.json?limit=3"),
        "https://www.reddit.com/r/OpenAI/new.json?limit=3",
      );
    },
  );
});

test("reddit shared: rotates REDDIT_USER_AGENTS when no single-UA override is set", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: null,
      REDDIT_CLIENT_SECRET: null,
      REDDIT_USER_AGENT: null,
      REDDIT_USER_AGENTS: "PoolUA/1, PoolUA/2\nPoolUA/3",
    },
    async () => {
      assert.equal(getRedditUserAgent(), "PoolUA/1");
      assert.equal(getRedditUserAgent(), "PoolUA/2");
      assert.equal(getRedditUserAgent(), "PoolUA/3");
      assert.equal(getRedditUserAgent(), "PoolUA/1");
    },
  );
});

test("reddit shared: REDDIT_USER_AGENT keeps exact stable override over pool", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: null,
      REDDIT_CLIENT_SECRET: null,
      REDDIT_USER_AGENT: "ExactUA/1",
      REDDIT_USER_AGENTS: "PoolUA/1,PoolUA/2",
    },
    async () => {
      assert.equal(getRedditUserAgent(), "ExactUA/1");
      assert.equal(getRedditUserAgent(), "ExactUA/1");
    },
  );
});

test("reddit shared: switches reddit.com API URLs to oauth host when creds exist", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "StarScreener/Test",
    },
    async () => {
      assert.equal(hasRedditOAuthCreds(), true);
      assert.equal(getRedditAuthMode(), "oauth");
      assert.equal(
        resolveRedditApiUrl("https://www.reddit.com/r/OpenAI/new.json?limit=3"),
        "https://oauth.reddit.com/r/OpenAI/new.json?limit=3",
      );
      assert.equal(
        resolveRedditApiUrl("https://oauth.reddit.com/r/OpenAI/new.json?limit=3"),
        "https://oauth.reddit.com/r/OpenAI/new.json?limit=3",
      );
    },
  );
});

test("reddit shared: fetchRedditJson uses public endpoint without oauth creds", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: null,
      REDDIT_CLIENT_SECRET: null,
      REDDIT_USER_AGENT: null,
    },
    async () => {
      // T4.2: use a non-listing URL (`/about.json`) so we exercise the
      // direct old.reddit.com JSON fallback rather than the RSS branch
      // that listing URLs (`/new.json`) now route through. The intent of
      // this test is "no oauth creds → no Authorization header"; the RSS
      // path exercises the same auth invariant + is covered separately.
      const calls = [];
      const body = await fetchRedditJson(
        "https://www.reddit.com/r/OpenAI/about.json",
        {
          fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return Response.json({ data: { children: [] } });
          },
        },
      );

      // Listing URLs (`/r/X/new.json`) are routed through the RSS variant
      // (`/r/X/new/.rss`) on the public-json path — the JSON listing endpoint
      // is blocked at the Reddit edge for GH Actions IPs while the RSS feed
      // serves the same listing unauthenticated. parseRedditAtomFeed is
      // tolerant of non-Atom input and returns the empty-children shape.
      assert.deepEqual(body, { data: { children: [], after: null, before: null } });
      assert.equal(calls.length, 1);
      // 2026-04-23 anti-bot fix: public-JSON path now hits old.reddit.com
      // (markedly more permissive than www.reddit.com from cron IPs).
      assert.equal(
        calls[0].url,
        "https://old.reddit.com/r/OpenAI/about.json",
      );
      assert.equal(calls[0].init.headers.Authorization, undefined);
      assert.match(calls[0].init.headers["User-Agent"], /Mozilla\/5\.0.+Chrome/);
    },
  );
});

test("reddit shared: fetchRedditJson gets and caches oauth bearer token", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "StarScreener/Test",
    },
    async () => {
      const calls = [];
      const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (url === "https://www.reddit.com/api/v1/access_token") {
          assert.equal(init.method, "POST");
          assert.equal(
            init.headers.Authorization,
            `Basic ${Buffer.from("client-id:client-secret", "utf8").toString("base64")}`,
          );
          return Response.json({
            access_token: "oauth-token",
            token_type: "bearer",
            expires_in: 3600,
          });
        }

        assert.equal(
          url,
          "https://oauth.reddit.com/r/OpenAI/new.json?limit=3",
        );
        assert.equal(init.headers.Authorization, "Bearer oauth-token");
        assert.equal(init.headers["User-Agent"], "StarScreener/Test");
        return Response.json({ data: { children: [] } });
      };

      const first = await fetchRedditJson(
        "https://www.reddit.com/r/OpenAI/new.json?limit=3",
        { fetchImpl },
      );
      const second = await fetchRedditJson(
        "https://www.reddit.com/r/OpenAI/new.json?limit=3",
        { fetchImpl },
      );

      assert.deepEqual(first, { data: { children: [] } });
      assert.deepEqual(second, { data: { children: [] } });
      assert.equal(
        calls.filter((call) => call.url === "https://www.reddit.com/api/v1/access_token").length,
        1,
      );
      assert.equal(
        calls.filter((call) => call.url === "https://oauth.reddit.com/r/OpenAI/new.json?limit=3").length,
        2,
      );
      assert.deepEqual(getRedditFetchRuntime(), {
        preferredMode: "oauth",
        activeMode: "oauth",
        fallbackUsed: false,
        oauthFailures: 0,
        oauthRequests: 2,
        publicRequests: 0,
        lastOauthError: null,
      });
    },
  );
});

test("reddit shared: falls back to public JSON when oauth path fails", async () => {
  await withEnv(
    {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "StarScreener/Test",
    },
    async () => {
      const calls = [];
      const body = await fetchRedditJson(
        "https://www.reddit.com/r/OpenAI/new.json?limit=3",
        {
          fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (url === "https://www.reddit.com/api/v1/access_token") {
              return Response.json({
                access_token: "oauth-token",
                token_type: "bearer",
                expires_in: 3600,
              });
            }
            if (url === "https://oauth.reddit.com/r/OpenAI/new.json?limit=3") {
              return new Response("forbidden", {
                status: 403,
                statusText: "Forbidden",
              });
            }
            // T4.2: public-JSON fallback rewrites to old.reddit.com.
            assert.equal(
              url,
              "https://old.reddit.com/r/OpenAI/new.json?limit=3",
            );
            assert.equal(init.headers.Authorization, undefined);
            return Response.json({ data: { children: [{ id: "public-hit" }] } });
          },
        },
      );

      assert.deepEqual(body, { data: { children: [{ id: "public-hit" }] } });
      assert.equal(calls.length, 3);
      assert.equal(
        calls[1].url,
        "https://oauth.reddit.com/r/OpenAI/new.json?limit=3",
      );
      // T4.2: public-JSON fallback now rewrites to old.reddit.com (more
      // permissive than www. for cron IPs — see _reddit-shared.mjs L29).
      assert.equal(
        calls[2].url,
        "https://old.reddit.com/r/OpenAI/new.json?limit=3",
      );
      assert.deepEqual(getRedditFetchRuntime(), {
        preferredMode: "oauth",
        activeMode: "public-json",
        fallbackUsed: true,
        oauthFailures: 1,
        oauthRequests: 1,
        publicRequests: 1,
        lastOauthError:
          "HTTP 403 Forbidden - https://oauth.reddit.com/r/OpenAI/new.json?limit=3 - forbidden",
      });
    },
  );
});
