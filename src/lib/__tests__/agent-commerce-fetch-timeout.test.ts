import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchWithTimeout } from "../agent-commerce/fetch-timeout";

test("fetchWithTimeout aborts a slow upstream request", async () => {
  const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    })) as typeof fetch;

  await assert.rejects(
    () =>
      fetchWithTimeout("https://example.test/slow", {
        fetcher,
        timeoutMs: 1,
      }),
    /AbortError|aborted/,
  );
});

test("fetchWithTimeout clears timeout and returns successful responses", async () => {
  const fetcher = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  const response = await fetchWithTimeout("https://example.test/ok", {
    fetcher,
    timeoutMs: 50,
  });

  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { ok: true });
});
