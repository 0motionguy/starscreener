import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

function postRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("POST /api/repo-submissions: 403 TURNSTILE_REQUIRED when token is missing", async () => {
  process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-test";

  const { POST } = await import("../../../app/api/repo-submissions/route");
  const res = await POST(
    postRequest("http://localhost/api/repo-submissions", {
      repo: "vercel/next.js",
    }),
  );

  assert.equal(res.status, 403);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.code, "TURNSTILE_REQUIRED");
});

test("POST /api/repo-submissions: 503 TURNSTILE_NOT_CONFIGURED when token is present but secret is unset", async () => {
  delete process.env.TURNSTILE_SECRET_KEY;

  const { POST } = await import("../../../app/api/repo-submissions/route");
  const res = await POST(
    postRequest("http://localhost/api/repo-submissions", {
      repo: "vercel/next.js",
      turnstileToken: "dummy-token",
    }),
  );

  assert.equal(res.status, 503);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.code, "TURNSTILE_NOT_CONFIGURED");
});

test("POST /api/repo-submissions: 429 RATE_LIMITED after repeated submissions from same IP", async () => {
  const { POST } = await import("../../../app/api/repo-submissions/route");
  let last = await POST(
    postRequest(
      "http://localhost/api/repo-submissions",
      { repo: "vercel/next.js" },
      { "x-forwarded-for": "198.51.100.24" },
    ),
  );

  for (let i = 0; i < 10; i += 1) {
    last = await POST(
      postRequest(
        "http://localhost/api/repo-submissions",
        { repo: "vercel/next.js" },
        { "x-forwarded-for": "198.51.100.24" },
      ),
    );
    if (last.status === 429) break;
  }

  assert.equal(last.status, 429);
  const retryAfter = Number(last.headers.get("Retry-After"));
  assert.ok(Number.isFinite(retryAfter));
  assert.ok(retryAfter > 0);
  const body = (await last.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.code, "RATE_LIMITED");
});

test("POST /api/submissions/revenue: rejects unauthenticated submission before body validation", async () => {
  const { POST } = await import("../../../app/api/submissions/revenue/route");
  const res = await POST(
    postRequest("http://localhost/api/submissions/revenue", {
      repo: "vercel/next.js",
    }),
  );

  assert.equal(res.status, 403);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.code, "TURNSTILE_REQUIRED");
});
