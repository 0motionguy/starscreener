import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApifyQuotaError,
  ApifyTokenInvalidError,
  GithubInvalidTokenError,
  GithubPoolExhaustedError,
  GithubRateLimitError,
  GithubRecoverableError,
  NitterAllInstancesDownError,
  NitterInstanceDownError,
  RateLimitRecoverableError,
  RedditBlockedError,
  RedditPoolExhaustedError,
  RedditRateLimitError,
  RedditRecoverableError,
  TwitterAllSourcesFailedError,
} from "../errors";

test("GitHub engine errors expose category, source, and metadata", () => {
  const cases = [
    {
      err: new GithubRateLimitError("rate limited", { reset: 123 }),
      category: "quarantine",
    },
    {
      err: new GithubInvalidTokenError("invalid token", { status: 401 }),
      category: "quarantine",
    },
    {
      err: new GithubPoolExhaustedError("pool exhausted", { keys: 0 }),
      category: "fatal",
    },
    {
      err: new GithubRecoverableError("temporary failure", { status: 503 }),
      category: "recoverable",
    },
  ] as const;

  for (const { err, category } of cases) {
    assert.equal(err.category, category);
    assert.equal(err.source, "github");
    assert.equal(err.name, err.constructor.name);
    assert.ok(err instanceof Error);
    assert.equal(typeof err.metadata, "object");
  }
});

test("Reddit engine errors expose category, source, and metadata", () => {
  const cases = [
    {
      err: new RedditRateLimitError("rate limited", { retryAfterMs: 1000 }),
      category: "quarantine",
    },
    {
      err: new RedditBlockedError("blocked", { status: 403 }),
      category: "quarantine",
    },
    {
      err: new RedditPoolExhaustedError("pool exhausted", { count: 5 }),
      category: "fatal",
    },
    {
      err: new RedditRecoverableError("temporary failure", { status: 503 }),
      category: "recoverable",
    },
  ] as const;

  for (const { err, category } of cases) {
    assert.equal(err.category, category);
    assert.equal(err.source, "reddit");
    assert.equal(err.name, err.constructor.name);
    assert.ok(err instanceof Error);
    assert.equal(typeof err.metadata, "object");
  }
});

test("Twitter engine errors expose category, source, and metadata", () => {
  const cases = [
    {
      err: new ApifyQuotaError("apify quota exceeded", { status: 429 }),
      category: "quarantine",
      source: "twitter-apify",
    },
    {
      err: new ApifyTokenInvalidError("apify token invalid", { status: 401 }),
      category: "quarantine",
      source: "twitter-apify",
    },
    {
      err: new NitterInstanceDownError("nitter instance down", { status: 503 }),
      category: "quarantine",
      source: "twitter-nitter",
    },
    {
      err: new NitterAllInstancesDownError("all nitter instances down", {
        checked: 5,
      }),
      category: "fatal",
      source: "twitter-nitter",
    },
    {
      err: new TwitterAllSourcesFailedError("all twitter sources failed", {
        repoFullName: "owner/repo",
      }),
      category: "fatal",
      source: "twitter",
    },
  ] as const;

  for (const { err, category, source } of cases) {
    assert.equal(err.category, category);
    assert.equal(err.source, source);
    assert.equal(err.name, err.constructor.name);
    assert.ok(err instanceof Error);
    assert.equal(typeof err.metadata, "object");
  }
});

test("Rate-limit engine errors expose category, source, and metadata", () => {
  const err = new RateLimitRecoverableError("rate-limit backend degraded", {
    operation: "incrementWithTtl",
  });
  assert.equal(err.category, "recoverable");
  assert.equal(err.source, "rate-limit");
  assert.equal(err.name, err.constructor.name);
  assert.ok(err instanceof Error);
  assert.equal(typeof err.metadata, "object");
});
