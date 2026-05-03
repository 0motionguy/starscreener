import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GithubInvalidTokenError,
  GithubPoolExhaustedError,
  GithubRateLimitError,
  GithubRecoverableError,
  RedditBlockedError,
  RedditPoolExhaustedError,
  RedditRateLimitError,
  RedditRecoverableError,
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
