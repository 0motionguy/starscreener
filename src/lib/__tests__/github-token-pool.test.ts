// StarScreener — github-token-pool tests.
//
// Verifies the per-token rate-limit accounting promised by the jsdoc on
// github-token-pool.ts:
//   1. Empty pool → throws on getNextToken
//   2. 3-token pool, all healthy → round-robin distribution
//   3. 1 token exhausted (remaining=0, reset in future) → skipped
//   4. All exhausted → throws GitHubTokenPoolExhaustedError
//   5. Reset time passed → token is reusable
//
// Bonus coverage:
//   - Highest remaining wins among healthy tokens
//   - GITHUB_TOKEN + GITHUB_TOKEN_POOL parsing
//   - Duplicate tokens across the two env vars are deduped
//   - parseRateLimitHeaders behaviour
//   - recordRateLimit ignores tokens not in the pool
//
// Run with:
//   npx tsx --test src/lib/__tests__/github-token-pool.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_GITHUB_QUOTA,
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  createGitHubTokenPool,
  parseRateLimitHeaders,
  redactToken,
} from "../github-token-pool";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeNow(seedMs: number): { now: () => number; advance: (ms: number) => void } {
  let cur = seedMs;
  return {
    now: () => cur,
    advance: (ms: number) => {
      cur += ms;
    },
  };
}

const FIXED_NOW_MS = 1_700_000_000_000; // 2023-11-14T22:13:20Z, plenty of digits
const FIXED_NOW_SEC = Math.floor(FIXED_NOW_MS / 1000);

// ---------------------------------------------------------------------------
// 1. Empty pool
// ---------------------------------------------------------------------------

test("empty pool throws GitHubTokenPoolEmptyError on getNextToken", () => {
  const pool = createGitHubTokenPool({ env: {}, now: () => FIXED_NOW_MS });
  assert.equal(pool.size(), 0);
  assert.throws(() => pool.getNextToken(), GitHubTokenPoolEmptyError);
});

test("empty pool calls onEmpty hook exactly once at construction", () => {
  let calls = 0;
  createGitHubTokenPool({
    env: {},
    now: () => FIXED_NOW_MS,
    onEmpty: () => {
      calls += 1;
    },
  });
  assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------
// 2. Healthy 3-token pool round-robin
// ---------------------------------------------------------------------------

test("3-token pool with all-healthy state distributes round-robin", () => {
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      GITHUB_TOKEN_POOL: "tok-b-bbbbbbbbbbbbbbbbbbbb,tok-c-cccccccccccccccccccc",
    },
    now: () => FIXED_NOW_MS,
  });
  assert.equal(pool.size(), 3);

  // Six picks across three healthy tokens: each should appear exactly twice.
  const counts = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const t = pool.getNextToken();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  assert.equal(counts.size, 3, `expected 3 unique tokens, got ${counts.size}`);
  for (const [tok, n] of counts) {
    assert.equal(n, 2, `token ${redactToken(tok)} appeared ${n} times, expected 2`);
  }
});

// ---------------------------------------------------------------------------
// 3. Exhausted token is skipped
// ---------------------------------------------------------------------------

test("1 exhausted token is skipped; healthy tokens are picked", () => {
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      GITHUB_TOKEN_POOL: "tok-b-bbbbbbbbbbbbbbbbbbbb,tok-c-cccccccccccccccccccc",
    },
    now: () => FIXED_NOW_MS,
  });

  // Mark tok-a exhausted with reset 10 minutes in the future.
  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", 0, FIXED_NOW_SEC + 600);

  // 20 picks — none should be the exhausted token.
  const picked = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const t = pool.getNextToken();
    assert.notEqual(t, "tok-a-aaaaaaaaaaaaaaaaaaaa");
    picked.add(t);
  }
  // The two healthy tokens are both used.
  assert.equal(picked.size, 2);
  assert.ok(picked.has("tok-b-bbbbbbbbbbbbbbbbbbbb"));
  assert.ok(picked.has("tok-c-cccccccccccccccccccc"));
});

// ---------------------------------------------------------------------------
// 4. All exhausted → throws
// ---------------------------------------------------------------------------

test("all exhausted tokens throws GitHubTokenPoolExhaustedError with soonest reset", () => {
  const clock = freezeNow(FIXED_NOW_MS);
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      GITHUB_TOKEN_POOL: "tok-b-bbbbbbbbbbbbbbbbbbbb,tok-c-cccccccccccccccccccc",
    },
    now: clock.now,
  });

  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", 0, FIXED_NOW_SEC + 1200);
  pool.recordRateLimit("tok-b-bbbbbbbbbbbbbbbbbbbb", 0, FIXED_NOW_SEC + 300);
  pool.recordRateLimit("tok-c-cccccccccccccccccccc", 0, FIXED_NOW_SEC + 900);

  let caught: unknown = null;
  try {
    pool.getNextToken();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof GitHubTokenPoolExhaustedError,
    `expected GitHubTokenPoolExhaustedError, got: ${String(caught)}`,
  );
  assert.equal(
    (caught as GitHubTokenPoolExhaustedError).resetsAtUnixSec,
    FIXED_NOW_SEC + 300,
    "soonest reset should be tok-b's",
  );
});

// ---------------------------------------------------------------------------
// 5. Reset time passed → token reusable
// ---------------------------------------------------------------------------

test("token whose reset has passed is reusable", () => {
  const clock = freezeNow(FIXED_NOW_MS);
  const pool = createGitHubTokenPool({
    env: { GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa" },
    now: clock.now,
  });

  // Mark the (only) token exhausted with reset 60s away.
  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", 0, FIXED_NOW_SEC + 60);

  assert.throws(() => pool.getNextToken(), GitHubTokenPoolExhaustedError);

  // Advance the clock past the reset.
  clock.advance(61_000);

  const t = pool.getNextToken();
  assert.equal(t, "tok-a-aaaaaaaaaaaaaaaaaaaa");
});

// ---------------------------------------------------------------------------
// Bonus: highest-remaining wins among healthy tokens
// ---------------------------------------------------------------------------

test("highest remaining quota wins when tokens have different known quotas", () => {
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      GITHUB_TOKEN_POOL: "tok-b-bbbbbbbbbbbbbbbbbbbb,tok-c-cccccccccccccccccccc",
    },
    now: () => FIXED_NOW_MS,
  });

  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", 100, FIXED_NOW_SEC + 1000);
  pool.recordRateLimit("tok-b-bbbbbbbbbbbbbbbbbbbb", 50, FIXED_NOW_SEC + 1000);
  pool.recordRateLimit("tok-c-cccccccccccccccccccc", 4_000, FIXED_NOW_SEC + 1000);

  // Multiple consecutive picks should all return tok-c (no tie to break).
  for (let i = 0; i < 5; i++) {
    assert.equal(pool.getNextToken(), "tok-c-cccccccccccccccccccc");
  }
});

test("unknown-remaining tokens are treated as healthy at the optimistic max", () => {
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      GITHUB_TOKEN_POOL: "tok-b-bbbbbbbbbbbbbbbbbbbb",
    },
    now: () => FIXED_NOW_MS,
  });

  // Mark only tok-a, leaving tok-b at unknown.
  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", 200, FIXED_NOW_SEC + 1000);

  // tok-b should win because unknown ≡ DEFAULT_GITHUB_QUOTA = 5000 > 200.
  for (let i = 0; i < 3; i++) {
    assert.equal(pool.getNextToken(), "tok-b-bbbbbbbbbbbbbbbbbbbb");
  }
  assert.equal(DEFAULT_GITHUB_QUOTA, 5000); // sanity-check the published constant
});

// ---------------------------------------------------------------------------
// Env parsing
// ---------------------------------------------------------------------------

test("GITHUB_TOKEN_POOL is comma-split, trimmed, and deduped against GITHUB_TOKEN", () => {
  const pool = createGitHubTokenPool({
    env: {
      GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa",
      // Whitespace, an empty entry, and a duplicate of tok-a — all noise.
      GITHUB_TOKEN_POOL: "  tok-b-bbbbbbbbbbbbbbbbbbbb , ,tok-a-aaaaaaaaaaaaaaaaaaaa,tok-c-cccccccccccccccccccc",
    },
    now: () => FIXED_NOW_MS,
  });

  assert.equal(pool.size(), 3, "duplicates and empties must be dropped");
  const tokens = pool.snapshot().map((s) => s.token);
  assert.deepEqual(tokens, [
    "tok-a-aaaaaaaaaaaaaaaaaaaa",
    "tok-b-bbbbbbbbbbbbbbbbbbbb",
    "tok-c-cccccccccccccccccccc",
  ]);
});

test("only GITHUB_TOKEN_POOL set still produces a working pool", () => {
  const pool = createGitHubTokenPool({
    env: { GITHUB_TOKEN_POOL: "tok-only-aaaaaaaaaaaaaaaaaaaa" },
    now: () => FIXED_NOW_MS,
  });
  assert.equal(pool.size(), 1);
  assert.equal(pool.getNextToken(), "tok-only-aaaaaaaaaaaaaaaaaaaa");
});

// ---------------------------------------------------------------------------
// recordRateLimit edge cases
// ---------------------------------------------------------------------------

test("recordRateLimit ignores tokens that are not in the pool", () => {
  const pool = createGitHubTokenPool({
    env: { GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa" },
    now: () => FIXED_NOW_MS,
  });

  // Should not throw, should not mutate state.
  pool.recordRateLimit("tok-foreign", 0, FIXED_NOW_SEC + 999);
  const states = pool.snapshot();
  assert.equal(states.length, 1);
  assert.equal(states[0].remaining, null);
  assert.equal(states[0].resetUnixSec, null);
});

test("recordRateLimit with negative remaining clamps to 0", () => {
  const pool = createGitHubTokenPool({
    env: { GITHUB_TOKEN: "tok-a-aaaaaaaaaaaaaaaaaaaa" },
    now: () => FIXED_NOW_MS,
  });

  pool.recordRateLimit("tok-a-aaaaaaaaaaaaaaaaaaaa", -5, FIXED_NOW_SEC + 60);
  const [s] = pool.snapshot();
  assert.equal(s.remaining, 0);
});

// ---------------------------------------------------------------------------
// parseRateLimitHeaders
// ---------------------------------------------------------------------------

test("parseRateLimitHeaders returns null when either header is missing", () => {
  assert.equal(parseRateLimitHeaders(new Headers()), null);
  const onlyOne = new Headers({ "x-ratelimit-remaining": "100" });
  assert.equal(parseRateLimitHeaders(onlyOne), null);
});

test("parseRateLimitHeaders parses well-formed headers", () => {
  const headers = new Headers({
    "x-ratelimit-remaining": "4321",
    "x-ratelimit-reset": "1700000060",
  });
  const result = parseRateLimitHeaders(headers);
  assert.deepEqual(result, { remaining: 4321, resetUnixSec: 1700000060 });
});

test("parseRateLimitHeaders returns null on garbage values", () => {
  const headers = new Headers({
    "x-ratelimit-remaining": "abc",
    "x-ratelimit-reset": "1700000060",
  });
  assert.equal(parseRateLimitHeaders(headers), null);
});

// ---------------------------------------------------------------------------
// redactToken
// ---------------------------------------------------------------------------

test("redactToken masks the secret in the middle", () => {
  const r = redactToken("ghp_1234567890ABCDEFGHIJKLMNOP");
  assert.ok(r.startsWith("ghp_"), `expected prefix, got: ${r}`);
  assert.ok(r.endsWith("MNOP"), `expected suffix, got: ${r}`);
  assert.ok(!r.includes("1234567890"), "middle must be masked");
});

test("redactToken fully masks short tokens", () => {
  assert.equal(redactToken("short"), "***");
});
