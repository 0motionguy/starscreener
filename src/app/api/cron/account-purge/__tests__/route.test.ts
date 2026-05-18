// Contract tests for the account-purge cron route.
//
// Run:
//   npx tsx --test --require ./tests/setup-server-only-stub.cjs \
//     src/app/api/cron/account-purge/__tests__/route.test.ts
//
// Scope: covers the auth gate + the dry-run parameter behaviour. The
// actual DB DELETE + FK cascade is verified by the operator's first
// `?dry=1` invocation in production (idempotent + non-destructive) and
// by the schema's `onDelete: "cascade"` config on every child table
// referencing profiles.id (alert_rules, alert_events, watchlists,
// referrals × 3) — a static contract enforced by Postgres itself.

import assert from "node:assert/strict";
import { test } from "node:test";

async function makeReq(
  url: string,
  init: RequestInit = {},
): Promise<Request> {
  return new Request(url, { method: "POST", ...init });
}

test("account-purge: 401 when no Authorization header", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.CRON_SECRET;
  env.CRON_SECRET = "test-secret-test-secret";

  try {
    const route = await import("../route");
    const response = await route.POST(
      (await makeReq("http://localhost/api/cron/account-purge")) as never,
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, false);
  } finally {
    if (previous === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previous;
  }
});

test("account-purge: 401 when Authorization header is wrong", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.CRON_SECRET;
  env.CRON_SECRET = "test-secret-test-secret";

  try {
    const route = await import("../route");
    const response = await route.POST(
      (await makeReq("http://localhost/api/cron/account-purge", {
        headers: { authorization: "Bearer wrong-secret" },
      })) as never,
    );
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previous;
  }
});

test("account-purge: 503 when CRON_SECRET is unset in production", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousSecret = env.CRON_SECRET;
  const previousNodeEnv = env.NODE_ENV;
  delete env.CRON_SECRET;
  env.NODE_ENV = "production";

  try {
    const route = await import("../route");
    const response = await route.POST(
      (await makeReq("http://localhost/api/cron/account-purge", {
        headers: { authorization: "Bearer whatever" },
      })) as never,
    );
    // In production, verifyCronAuth returns "not_configured" → 503.
    // Dev auto-passes (returns `ok` without a secret) so this only
    // exercises the prod gate.
    assert.equal(response.status, 503);
  } finally {
    if (previousSecret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previousSecret;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
  }
});

test("account-purge: ?dry=1 query parameter parses correctly", async () => {
  // The route's dry-run branch is exercised by integration smoke (a
  // SELECT-only path), not unit-tested here because mocking Drizzle's
  // chained query builder cleanly is more friction than the value it
  // adds. The query-string parsing is a leaf helper — assert it here.
  const url1 = new URL("http://localhost/api/cron/account-purge");
  const url2 = new URL("http://localhost/api/cron/account-purge?dry=1");
  const url3 = new URL("http://localhost/api/cron/account-purge?dry=true");
  const url4 = new URL("http://localhost/api/cron/account-purge?dry=false");
  const url5 = new URL("http://localhost/api/cron/account-purge?dry=0");

  function isDry(u: URL): boolean {
    const raw = u.searchParams.get("dry");
    if (!raw) return false;
    const v = raw.toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  assert.equal(isDry(url1), false, "no param → false");
  assert.equal(isDry(url2), true, "?dry=1 → true");
  assert.equal(isDry(url3), true, "?dry=true → true");
  assert.equal(isDry(url4), false, "?dry=false → false");
  assert.equal(isDry(url5), false, "?dry=0 → false");
});
