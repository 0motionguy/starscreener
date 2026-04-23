import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchJsonWithRetry,
  HttpStatusError,
  parseRetryAfterMs,
} from "../_fetch-json.mjs";

test("fetchJsonWithRetry: retries transient HTTP statuses", async () => {
  let calls = 0;
  const body = await fetchJsonWithRetry("https://example.test/api", {
    attempts: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("nope", { status: 503 });
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(body, { ok: true });
});

test("fetchJsonWithRetry: exposes status on permanent HTTP failure", async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      fetchJsonWithRetry("https://example.test/missing", {
        attempts: 2,
        retryDelayMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      }),
    (err) => err instanceof HttpStatusError && err.status === 404,
  );
  assert.equal(calls, 1);
});

test("parseRetryAfterMs: supports seconds and HTTP-date formats", () => {
  const now = Date.parse("2026-04-22T12:00:00.000Z");

  assert.equal(parseRetryAfterMs("2.5", now), 2500);
  assert.equal(
    parseRetryAfterMs("Wed, 22 Apr 2026 12:00:10 GMT", now),
    10000,
  );
  assert.equal(parseRetryAfterMs("Wed, 22 Apr 2026 11:59:00 GMT", now), 0);
  assert.equal(parseRetryAfterMs("not-a-date", now), null);
});
