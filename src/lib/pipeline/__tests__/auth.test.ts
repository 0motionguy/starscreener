// StarScreener — auth helper tests.
//
// Phase 2 P-103 (F-QA-002) + P-108 (F-SENT-001 / F-SENT-008).
//
// Locks the tri-state contract of verifyCronAuth and the constant-time
// equality used for the bearer-token compare.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyCronAuth,
  authFailureResponse,
  timingSafeEqualStr,
  type AuthVerdict,
} from "../../api/auth";

// Minimal shim — verifyCronAuth only touches request.headers.get.
function mkRequest(headers: Record<string, string> = {}): Parameters<typeof verifyCronAuth>[0] {
  const h = new Headers(headers);
  return { headers: h } as unknown as Parameters<typeof verifyCronAuth>[0];
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) prior[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// timingSafeEqualStr
// ---------------------------------------------------------------------------

test("timingSafeEqualStr matches identical strings", () => {
  assert.equal(timingSafeEqualStr("hunter2", "hunter2"), true);
});

test("timingSafeEqualStr rejects different strings of same length", () => {
  assert.equal(timingSafeEqualStr("hunter2", "hunter3"), false);
});

test("timingSafeEqualStr short-circuits on length mismatch", () => {
  assert.equal(timingSafeEqualStr("hunter2", "hunter22"), false);
  assert.equal(timingSafeEqualStr("", "hunter2"), false);
  assert.equal(timingSafeEqualStr("hunter2", ""), false);
});

test("timingSafeEqualStr handles non-ASCII (emoji) content", () => {
  assert.equal(timingSafeEqualStr("🔑abc", "🔑abc"), true);
  assert.equal(timingSafeEqualStr("🔑abc", "🔑abd"), false);
});

// ---------------------------------------------------------------------------
// verifyCronAuth — tri-state contract
// ---------------------------------------------------------------------------

test("verifyCronAuth: dev + CRON_SECRET unset returns ok", async () => {
  await withEnv({ CRON_SECRET: undefined, NODE_ENV: "development" }, () => {
    const v = verifyCronAuth(mkRequest());
    assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
  });
});

test("verifyCronAuth: prod + CRON_SECRET unset returns not_configured", async () => {
  await withEnv({ CRON_SECRET: undefined, NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest());
    assert.deepEqual(v, { kind: "not_configured" } as AuthVerdict);
  });
});

test("verifyCronAuth: no Authorization header returns unauthorized", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest());
    assert.deepEqual(v, { kind: "unauthorized" } as AuthVerdict);
  });
});

test("verifyCronAuth: wrong raw secret returns unauthorized", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest({ authorization: "nope" }));
    assert.deepEqual(v, { kind: "unauthorized" } as AuthVerdict);
  });
});

test("verifyCronAuth: correct raw secret returns ok", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest({ authorization: "s3cret" }));
    assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
  });
});

test("verifyCronAuth: Bearer <secret> returns ok", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest({ authorization: "Bearer s3cret" }));
    assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
  });
});

test("verifyCronAuth: Bearer <wrong> returns unauthorized", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest({ authorization: "Bearer wrong" }));
    assert.deepEqual(v, { kind: "unauthorized" } as AuthVerdict);
  });
});

test("verifyCronAuth: authorization value is trimmed", async () => {
  await withEnv({ CRON_SECRET: "s3cret", NODE_ENV: "production" }, () => {
    const v = verifyCronAuth(mkRequest({ authorization: "  s3cret  " }));
    assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
  });
});

// ---------------------------------------------------------------------------
// authFailureResponse
// ---------------------------------------------------------------------------

test("authFailureResponse: ok → null", () => {
  const r = authFailureResponse({ kind: "ok" });
  assert.equal(r, null);
});

test("authFailureResponse: unauthorized → 401", async () => {
  const r = authFailureResponse({ kind: "unauthorized" });
  assert.ok(r !== null);
  assert.equal(r!.status, 401);
  const body = await r!.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, "unauthorized");
});

test("authFailureResponse: not_configured → 503", async () => {
  const r = authFailureResponse({ kind: "not_configured" });
  assert.ok(r !== null);
  assert.equal(r!.status, 503);
  const body = await r!.json();
  assert.equal(body.ok, false);
  assert.match(body.reason, /not configured/);
});
