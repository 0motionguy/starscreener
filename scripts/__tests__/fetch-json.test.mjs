import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchJsonWithRetry,
  HttpStatusError,
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
