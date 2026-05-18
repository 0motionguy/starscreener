// Security coverage for assertSameOriginRequest.
//
// Run:
//   npx tsx --test src/lib/api/__tests__/csrf.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { assertSameOriginRequest } from "../csrf";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("https://trendingrepo.com/api/profile", {
      method: "POST",
      headers,
    }),
  );
}

async function readError(response: Response): Promise<{
  ok: boolean;
  error: string;
  message: string;
}> {
  return (await response.json()) as {
    ok: boolean;
    error: string;
    message: string;
  };
}

test("assertSameOriginRequest: accepts first-party Sec-Fetch-Site values", () => {
  for (const fetchSite of ["same-origin", "none"]) {
    const response = assertSameOriginRequest(
      makeRequest({ "sec-fetch-site": fetchSite }),
    );
    assert.equal(response, null, `${fetchSite} should be accepted`);
  }
});

test("assertSameOriginRequest: requires Origin fallback for same-site requests", async () => {
  assert.equal(
    assertSameOriginRequest(
      makeRequest({
        "sec-fetch-site": "same-site",
        origin: "https://preview-123.vercel.app",
      }),
    ),
    null,
  );

  const response = assertSameOriginRequest(
    makeRequest({
      "sec-fetch-site": "same-site",
      origin: "https://attacker.example",
    }),
  );

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.deepEqual(await readError(response), {
    ok: false,
    error: "untrusted_origin",
    message: "Origin not in CSRF allowlist",
  });
});

test("assertSameOriginRequest: rejects cross-site request without Origin", async () => {
  const response = assertSameOriginRequest(
    makeRequest({ "sec-fetch-site": "cross-site" }),
  );

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await readError(response), {
    ok: false,
    error: "missing_origin",
    message: "Origin header missing on POST/PATCH",
  });
});

test("assertSameOriginRequest: accepts allowlisted Origin when Sec-Fetch-Site is absent", () => {
  const allowedOrigins = [
    "https://trendingrepo.com",
    "https://app.starscreener.dev",
    "https://preview-123.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3024",
  ];

  for (const origin of allowedOrigins) {
    assert.equal(
      assertSameOriginRequest(makeRequest({ origin })),
      null,
      `${origin} should be accepted`,
    );
  }
});

test("assertSameOriginRequest: rejects untrusted Origin when Sec-Fetch-Site is absent", async () => {
  const response = assertSameOriginRequest(
    makeRequest({ origin: "https://attacker.example" }),
  );

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.deepEqual(await readError(response), {
    ok: false,
    error: "untrusted_origin",
    message: "Origin not in CSRF allowlist",
  });
});

test("assertSameOriginRequest: rejects allowlist suffix tricks", async () => {
  const origins = [
    "https://eviltrendingrepo.com",
    "https://trendingrepo.com.evil.example",
    "https://evil-localhost",
  ];

  for (const origin of origins) {
    const response = assertSameOriginRequest(makeRequest({ origin }));
    assert.ok(response, `${origin} should be rejected`);
    assert.equal(response.status, 403);
    assert.equal((await readError(response)).error, "untrusted_origin");
  }
});

test("assertSameOriginRequest: rejects malformed Origin", async () => {
  const response = assertSameOriginRequest(makeRequest({ origin: "not a url" }));

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.deepEqual(await readError(response), {
    ok: false,
    error: "invalid_origin",
    message: "Origin header is not a valid URL",
  });
});
