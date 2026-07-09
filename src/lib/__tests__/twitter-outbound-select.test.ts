// Tests for the daily-breakouts selection tiers and the OAuth2
// refresh-token rotation manager:
//   - pickDailyBreakouts (tier ordering, tie-breaks, quality floor,
//     cooldown exclusion, dedupe, graceful <count)
//   - recentlyFeaturedRepos (window math, pre-upgrade rows)
//   - TwitterOAuthTokenManager (refresh call shape, rotated-token
//     persistence, expiry reuse, single-flight)

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Repo } from "../types";

import {
  DAILY_BREAKOUT_COUNT,
  pickDailyBreakouts,
  recentlyFeaturedRepos,
} from "../twitter/outbound/select";
import {
  OAUTH_STATE_FILE,
  TwitterOAuthTokenManager,
  readTwitterOAuthConfigFromEnv,
} from "../twitter/outbound/oauth";
import {
  listOutboundRuns,
  recordOutboundRun,
  zipRunPosts,
} from "../twitter/outbound/audit";
import type { OutboundRunRecord } from "../twitter/outbound/types";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  return {
    id: partial.fullName.replace("/", "--"),
    fullName: partial.fullName,
    name: partial.fullName.split("/")[1] ?? "",
    owner: partial.fullName.split("/")[0] ?? "",
    ownerAvatarUrl: "",
    description: partial.description ?? "",
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
    momentumScore: partial.momentumScore ?? 50,
    movementStatus: partial.movementStatus ?? "stable",
    rank: 100,
    categoryRank: 10,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    channelsFiring: partial.channelsFiring,
    crossSignalScore: partial.crossSignalScore,
    starsDelta24hMissing: partial.starsDelta24hMissing,
  };
}

function makeRun(
  partial: Partial<OutboundRunRecord> & { startedAt: string },
): OutboundRunRecord {
  return {
    id: "run-1",
    kind: "daily_breakouts",
    adapterName: "twitter_api_v2",
    status: "published",
    threadUrl: null,
    postCount: 12,
    finishedAt: partial.startedAt,
    errorMessage: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// pickDailyBreakouts
// ---------------------------------------------------------------------------

test("pickDailyBreakouts returns up to 10 by default", () => {
  const repos = Array.from({ length: 25 }, (_, i) =>
    makeRepo({ fullName: `acme/repo${i}`, starsDelta24h: 100 + i }),
  );
  const picked = pickDailyBreakouts(repos);
  assert.equal(picked.length, DAILY_BREAKOUT_COUNT);
  assert.equal(DAILY_BREAKOUT_COUNT, 10);
});

test("pickDailyBreakouts puts multi-signal repos first, regardless of star delta", () => {
  const repos = [
    makeRepo({ fullName: "c/star-monster", starsDelta24h: 9999 }),
    makeRepo({
      fullName: "a/multi-signal",
      starsDelta24h: 10,
      channelsFiring: 3,
      crossSignalScore: 2.4,
    }),
    makeRepo({
      fullName: "b/hot-repo",
      starsDelta24h: 500,
      movementStatus: "hot",
      momentumScore: 80,
    }),
  ];
  const picked = pickDailyBreakouts(repos);
  assert.deepEqual(
    picked.map((r) => r.fullName),
    ["a/multi-signal", "b/hot-repo", "c/star-monster"],
  );
});

test("pickDailyBreakouts breaks cross-signal ties with momentum, not array order", () => {
  const repos = [
    makeRepo({
      fullName: "a/first-in-array",
      channelsFiring: 2,
      crossSignalScore: 2.0,
      momentumScore: 40,
    }),
    makeRepo({
      fullName: "b/stronger-momentum",
      channelsFiring: 2,
      crossSignalScore: 2.0,
      momentumScore: 90,
    }),
  ];
  const picked = pickDailyBreakouts(repos);
  assert.equal(picked[0]!.fullName, "b/stronger-momentum");
});

test("pickDailyBreakouts is deterministic when every score ties", () => {
  const repos = [
    makeRepo({ fullName: "b/beta", starsDelta24h: 50 }),
    makeRepo({ fullName: "a/alpha", starsDelta24h: 50 }),
  ];
  const first = pickDailyBreakouts(repos).map((r) => r.fullName);
  const second = pickDailyBreakouts([...repos].reverse()).map(
    (r) => r.fullName,
  );
  assert.deepEqual(first, second);
});

test("pickDailyBreakouts never pads with repos that have no movement", () => {
  const repos = [
    makeRepo({ fullName: "a/mover", starsDelta24h: 10 }),
    makeRepo({ fullName: "b/dead", starsDelta24h: 0, starsDelta7d: 0 }),
    makeRepo({ fullName: "c/negative", starsDelta24h: -5, starsDelta7d: 0 }),
  ];
  const picked = pickDailyBreakouts(repos, { count: 10 });
  assert.deepEqual(
    picked.map((r) => r.fullName),
    ["a/mover"],
  );
});

test("pickDailyBreakouts lets a flat-delta multi-signal repo through the floor", () => {
  const repos = [
    makeRepo({
      fullName: "a/social-only",
      starsDelta24h: 0,
      starsDelta7d: 0,
      channelsFiring: 3,
    }),
  ];
  assert.equal(pickDailyBreakouts(repos).length, 1);
});

test("pickDailyBreakouts excludes recently featured repos case-insensitively", () => {
  const repos = [
    makeRepo({ fullName: "Acme/Featured", starsDelta24h: 500 }),
    makeRepo({ fullName: "acme/new", starsDelta24h: 100 }),
  ];
  const picked = pickDailyBreakouts(repos, {
    exclude: new Set(["acme/featured"]),
  });
  assert.deepEqual(
    picked.map((r) => r.fullName),
    ["acme/new"],
  );
});

test("pickDailyBreakouts dedupes repeated fullNames across the input", () => {
  const repos = [
    makeRepo({ fullName: "acme/dup", starsDelta24h: 100 }),
    makeRepo({ fullName: "acme/dup", starsDelta24h: 90 }),
  ];
  assert.equal(pickDailyBreakouts(repos).length, 1);
});

test("pickDailyBreakouts skips Tier C repos whose 24h delta is missing", () => {
  const repos = [
    makeRepo({
      fullName: "a/backfilled-delta",
      starsDelta24h: 100,
      starsDelta7d: 300,
      starsDelta24hMissing: true,
    }),
    makeRepo({ fullName: "b/real-delta", starsDelta24h: 10 }),
  ];
  const picked = pickDailyBreakouts(repos);
  assert.deepEqual(
    picked.map((r) => r.fullName),
    ["b/real-delta"],
  );
});

test('window "7d" ranks Tier C by weekly delta and floors on it', () => {
  const repos = [
    makeRepo({
      fullName: "a/daily-spike",
      starsDelta24h: 300,
      starsDelta7d: 320,
    }),
    makeRepo({
      fullName: "b/weekly-grinder",
      starsDelta24h: 5,
      starsDelta7d: 900,
    }),
    makeRepo({
      fullName: "c/no-weekly-movement",
      starsDelta24h: 50,
      starsDelta7d: 0,
    }),
  ];
  const weekly = pickDailyBreakouts(repos, { count: 3, window: "7d" });
  assert.deepEqual(
    weekly.map((r) => r.fullName),
    // Tier C sorted by 7d delta; c/no-weekly-movement has starsDelta7d=0
    // so it fails the 7d Tier C filter (still passes the global floor via
    // its 24h delta but lands in no tier).
    ["b/weekly-grinder", "a/daily-spike"],
  );

  const daily = pickDailyBreakouts(repos, { count: 3 });
  assert.equal(daily[0]!.fullName, "a/daily-spike");
  assert.equal(daily.length, 3);
});

test('window "7d" ignores the 24h backfill marker', () => {
  const repos = [
    makeRepo({
      fullName: "a/weekly-only",
      starsDelta24h: 0,
      starsDelta7d: 400,
      starsDelta24hMissing: true,
    }),
  ];
  assert.equal(pickDailyBreakouts(repos, { window: "7d" }).length, 1);
  assert.equal(pickDailyBreakouts(repos, { window: "24h" }).length, 0);
});

// ---------------------------------------------------------------------------
// recentlyFeaturedRepos
// ---------------------------------------------------------------------------

test("recentlyFeaturedRepos returns lowercased names inside the window only", () => {
  const now = new Date("2026-07-09T14:00:00Z");
  const runs = [
    makeRun({
      startedAt: "2026-07-08T14:00:00Z",
      featuredRepos: ["Acme/Yesterday"],
    }),
    makeRun({
      startedAt: "2026-06-20T14:00:00Z",
      featuredRepos: ["acme/ancient"],
    }),
  ];
  const featured = recentlyFeaturedRepos(runs, { days: 7, now });
  assert.deepEqual([...featured], ["acme/yesterday"]);
});

test("recentlyFeaturedRepos kinds filter scopes the cooldown per thread type", () => {
  const now = new Date("2026-07-09T14:00:00Z");
  const runs = [
    makeRun({
      startedAt: "2026-07-08T14:00:00Z",
      kind: "daily_breakouts",
      featuredRepos: ["acme/from-daily"],
    }),
    makeRun({
      startedAt: "2026-07-04T16:00:00Z",
      kind: "weekly_recap",
      featuredRepos: ["acme/from-weekly"],
    }),
  ];
  const dailyOnly = recentlyFeaturedRepos(runs, {
    now,
    kinds: ["daily_breakouts"],
  });
  assert.deepEqual([...dailyOnly], ["acme/from-daily"]);
  const all = recentlyFeaturedRepos(runs, { now });
  assert.equal(all.size, 2);
});

test("recentlyFeaturedRepos tolerates pre-upgrade rows without featuredRepos", () => {
  const runs = [makeRun({ startedAt: new Date().toISOString() })];
  assert.equal(recentlyFeaturedRepos(runs).size, 0);
});

// ---------------------------------------------------------------------------
// TwitterOAuthTokenManager
// ---------------------------------------------------------------------------

let dataDir: string | null = null;
let savedDataDir: string | undefined;

beforeEach(async () => {
  savedDataDir = process.env.STARSCREENER_DATA_DIR;
  dataDir = await mkdtemp(path.join(tmpdir(), "twitter-oauth-test-"));
  process.env.STARSCREENER_DATA_DIR = dataDir;
});

afterEach(async () => {
  if (savedDataDir === undefined) {
    delete process.env.STARSCREENER_DATA_DIR;
  } else {
    process.env.STARSCREENER_DATA_DIR = savedDataDir;
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = null;
});

function tokenResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("readTwitterOAuthConfigFromEnv requires the full trio", () => {
  delete process.env.TWITTER_OAUTH2_CLIENT_ID;
  delete process.env.TWITTER_OAUTH2_CLIENT_SECRET;
  delete process.env.TWITTER_OAUTH2_REFRESH_TOKEN;
  assert.equal(readTwitterOAuthConfigFromEnv(), null);
  process.env.TWITTER_OAUTH2_CLIENT_ID = "cid";
  assert.equal(readTwitterOAuthConfigFromEnv(), null);
  process.env.TWITTER_OAUTH2_CLIENT_SECRET = "csecret";
  process.env.TWITTER_OAUTH2_REFRESH_TOKEN = "rt";
  assert.deepEqual(readTwitterOAuthConfigFromEnv(), {
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt",
  });
  delete process.env.TWITTER_OAUTH2_CLIENT_ID;
  delete process.env.TWITTER_OAUTH2_CLIENT_SECRET;
  delete process.env.TWITTER_OAUTH2_REFRESH_TOKEN;
});

test("TwitterOAuthTokenManager exchanges the seed refresh token with Basic auth", async () => {
  const calls: Array<{ url: string; auth: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: input.toString(),
      auth:
        (init?.headers as Record<string, string> | undefined)?.Authorization ??
        "",
      body: (init?.body as string) ?? "",
    });
    return tokenResponse({
      access_token: "at-1",
      refresh_token: "rt-2",
      expires_in: 7200,
    });
  };
  const manager = new TwitterOAuthTokenManager({
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt-1",
    fetchImpl,
  });

  const token = await manager.getAccessToken();
  assert.equal(token, "at-1");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /api\.twitter\.com\/2\/oauth2\/token/);
  assert.equal(
    calls[0]!.auth,
    `Basic ${Buffer.from("cid:csecret").toString("base64")}`,
  );
  const params = new URLSearchParams(calls[0]!.body);
  assert.equal(params.get("grant_type"), "refresh_token");
  assert.equal(params.get("refresh_token"), "rt-1");
});

test("TwitterOAuthTokenManager persists the rotated refresh token and reuses a live one", async () => {
  let exchanges = 0;
  const fetchImpl: typeof fetch = async () => {
    exchanges += 1;
    return tokenResponse({
      access_token: `at-${exchanges}`,
      refresh_token: `rt-${exchanges + 1}`,
      expires_in: 7200,
    });
  };
  const manager = new TwitterOAuthTokenManager({
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt-1",
    fetchImpl,
  });

  const first = await manager.getAccessToken();
  const second = await manager.getAccessToken();
  assert.equal(first, "at-1");
  assert.equal(second, "at-1"); // still fresh — no second exchange
  assert.equal(exchanges, 1);

  const persisted = await readFile(
    path.join(dataDir!, OAUTH_STATE_FILE),
    "utf8",
  );
  const row = JSON.parse(persisted.trim()) as { refreshToken: string };
  assert.equal(row.refreshToken, "rt-2");
});

test("a new manager instance resumes from the persisted rotated token, not the seed", async () => {
  const seenRefreshTokens: string[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const params = new URLSearchParams((init?.body as string) ?? "");
    seenRefreshTokens.push(params.get("refresh_token") ?? "");
    return tokenResponse({
      access_token: `at-${seenRefreshTokens.length}`,
      refresh_token: `rt-${seenRefreshTokens.length + 1}`,
      // Expire immediately so the second manager must exchange again.
      expires_in: 1,
    });
  };
  const config = {
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt-1",
    fetchImpl,
  };

  await new TwitterOAuthTokenManager(config).getAccessToken();
  await new TwitterOAuthTokenManager(config).getAccessToken();

  assert.deepEqual(seenRefreshTokens, ["rt-1", "rt-2"]);
});

test("invalidateAndRefresh forces a new exchange even before expiry", async () => {
  let exchanges = 0;
  const fetchImpl: typeof fetch = async () => {
    exchanges += 1;
    return tokenResponse({
      access_token: `at-${exchanges}`,
      refresh_token: `rt-${exchanges + 1}`,
      expires_in: 7200,
    });
  };
  const manager = new TwitterOAuthTokenManager({
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt-1",
    fetchImpl,
  });

  await manager.getAccessToken();
  const refreshed = await manager.invalidateAndRefresh();
  assert.equal(refreshed, "at-2");
  assert.equal(exchanges, 2);
});

test("audit rows round-trip the composed posts for dry-run review", async () => {
  const thread = [
    {
      kind: "daily_breakouts_intro" as const,
      text: "🔥 Top 2 trending repos",
      url: "https://trendingrepo.com/breakouts",
    },
    { kind: "daily_breakouts_item" as const, text: "1/ acme/repo" },
  ];
  const posts = zipRunPosts(thread, {
    posts: [
      { remoteId: null, url: null, status: "logged" },
      { remoteId: null, url: null, status: "logged" },
    ],
    threadUrl: null,
  });
  await recordOutboundRun({
    kind: "daily_breakouts",
    adapterName: "console",
    status: "logged",
    threadUrl: null,
    postCount: thread.length,
    startedAt: new Date().toISOString(),
    featuredRepos: ["acme/repo"],
    posts,
  });

  const runs = await listOutboundRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.posts?.length, 2);
  assert.equal(runs[0]!.posts?.[0]?.text, "🔥 Top 2 trending repos");
  assert.equal(runs[0]!.posts?.[0]?.url, "https://trendingrepo.com/breakouts");
  assert.equal(runs[0]!.posts?.[1]?.url, null);
  assert.equal(runs[0]!.posts?.[1]?.status, "logged");
  assert.deepEqual(runs[0]!.featuredRepos, ["acme/repo"]);
});

test("zipRunPosts marks unattempted posts as skipped when a thread aborts mid-way", () => {
  const posts = zipRunPosts(
    [
      { kind: "daily_breakouts_intro", text: "intro" },
      { kind: "daily_breakouts_item", text: "item" },
    ],
    {
      posts: [{ remoteId: "1", url: null, status: "published" }],
      threadUrl: null,
    },
  );
  assert.equal(posts[0]!.status, "published");
  assert.equal(posts[1]!.status, "skipped");
});

test("TwitterOAuthTokenManager surfaces token-endpoint failures", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("invalid_request", { status: 400 });
  const manager = new TwitterOAuthTokenManager({
    clientId: "cid",
    clientSecret: "csecret",
    seedRefreshToken: "rt-dead",
    fetchImpl,
  });
  await assert.rejects(
    () => manager.getAccessToken(),
    /token refresh failed with 400/,
  );
});
