// StarScreener — auth helper tests.
//
// Phase 2 P-103 (F-QA-002) + P-108 (F-SENT-001 / F-SENT-008) — tri-state
// CRON_SECRET contract + constant-time equality.
//
// P0 security patch (Bugs A/B/C) — additionally locks:
//   - verifyAdminAuth: no CRON_SECRET fallback, 503 when ADMIN_TOKEN unset.
//   - verifyUserAuth:  header-derived userId, body/query forgery rejected.
//   - /api/pipeline/alerts handler: 401 in prod when no auth token.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyCronAuth,
  verifyAdminAuth,
  verifyUserAuth,
  authFailureResponse,
  adminAuthFailureResponse,
  userAuthFailureResponse,
  timingSafeEqualStr,
  SESSION_COOKIE_NAME,
  __resetAuthWarningsForTests,
  type AuthVerdict,
  type UserAuthVerdict,
} from "../../api/auth";
import { signSession, SESSION_MAX_AGE_MS } from "../../api/session";

// Minimal shim — verify*Auth only touches request.headers.get and (for user
// auth) request.nextUrl is untouched here.
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
    __resetAuthWarningsForTests();
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    __resetAuthWarningsForTests();
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

// ---------------------------------------------------------------------------
// verifyAdminAuth — no CRON_SECRET fallback (P0 Bug C)
// ---------------------------------------------------------------------------

test("verifyAdminAuth: ADMIN_TOKEN unset returns not_configured even in dev", async () => {
  await withEnv(
    { ADMIN_TOKEN: undefined, CRON_SECRET: "cron-val", NODE_ENV: "development" },
    () => {
      const v = verifyAdminAuth(mkRequest({ authorization: "Bearer cron-val" }));
      // Regression guard: the old behavior accepted CRON_SECRET here.
      assert.deepEqual(v, { kind: "not_configured" } as AuthVerdict);
    },
  );
});

test("verifyAdminAuth: ADMIN_TOKEN unset returns not_configured in prod", async () => {
  await withEnv(
    { ADMIN_TOKEN: undefined, CRON_SECRET: "cron-val", NODE_ENV: "production" },
    () => {
      const v = verifyAdminAuth(mkRequest({ authorization: "Bearer cron-val" }));
      assert.deepEqual(v, { kind: "not_configured" } as AuthVerdict);
    },
  );
});

test("verifyAdminAuth: CRON_SECRET is NOT accepted when ADMIN_TOKEN set", async () => {
  await withEnv(
    { ADMIN_TOKEN: "admin-val", CRON_SECRET: "cron-val", NODE_ENV: "production" },
    () => {
      const v = verifyAdminAuth(mkRequest({ authorization: "Bearer cron-val" }));
      assert.deepEqual(v, { kind: "unauthorized" } as AuthVerdict);
    },
  );
});

test("verifyAdminAuth: ADMIN_TOKEN match returns ok", async () => {
  await withEnv(
    { ADMIN_TOKEN: "admin-val", CRON_SECRET: "cron-val", NODE_ENV: "production" },
    () => {
      const v = verifyAdminAuth(mkRequest({ authorization: "Bearer admin-val" }));
      assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
    },
  );
});

test("verifyAdminAuth: raw ADMIN_TOKEN (no Bearer prefix) returns ok", async () => {
  await withEnv(
    { ADMIN_TOKEN: "admin-val", NODE_ENV: "production" },
    () => {
      const v = verifyAdminAuth(mkRequest({ authorization: "admin-val" }));
      assert.deepEqual(v, { kind: "ok" } as AuthVerdict);
    },
  );
});

test("verifyAdminAuth: missing Authorization header → unauthorized (when ADMIN_TOKEN set)", async () => {
  await withEnv({ ADMIN_TOKEN: "admin-val", NODE_ENV: "production" }, () => {
    const v = verifyAdminAuth(mkRequest());
    assert.deepEqual(v, { kind: "unauthorized" } as AuthVerdict);
  });
});

test("adminAuthFailureResponse: not_configured names ADMIN_TOKEN", async () => {
  const r = adminAuthFailureResponse({ kind: "not_configured" });
  assert.ok(r !== null);
  assert.equal(r!.status, 503);
  const body = await r!.json();
  assert.match(body.reason, /ADMIN_TOKEN/);
});

// ---------------------------------------------------------------------------
// verifyUserAuth — per-user auth (P0 Bug A)
// ---------------------------------------------------------------------------

test("verifyUserAuth: prod + no env set → not_configured (503)", async () => {
  await withEnv(
    { USER_TOKEN: undefined, USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      const v = verifyUserAuth(mkRequest({ authorization: "Bearer whatever" }));
      assert.deepEqual(v, { kind: "not_configured" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: dev + no env set → ok with userId=local (fallback)", async () => {
  await withEnv(
    { USER_TOKEN: undefined, USER_TOKENS_JSON: undefined, NODE_ENV: "development" },
    () => {
      const v = verifyUserAuth(mkRequest());
      assert.deepEqual(v, { kind: "ok", userId: "local" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: USER_TOKEN set, correct Bearer → ok userId=local", async () => {
  await withEnv(
    { USER_TOKEN: "u-t0k", USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      const v = verifyUserAuth(mkRequest({ authorization: "Bearer u-t0k" }));
      assert.deepEqual(v, { kind: "ok", userId: "local" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: USER_TOKEN set, x-user-token header works", async () => {
  await withEnv(
    { USER_TOKEN: "u-t0k", USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      const v = verifyUserAuth(mkRequest({ "x-user-token": "u-t0k" }));
      assert.deepEqual(v, { kind: "ok", userId: "local" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: USER_TOKEN set, wrong Bearer → unauthorized", async () => {
  await withEnv(
    { USER_TOKEN: "u-t0k", USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      const v = verifyUserAuth(mkRequest({ authorization: "Bearer wrong" }));
      assert.deepEqual(v, { kind: "unauthorized" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: USER_TOKEN set, no header → unauthorized (in prod)", async () => {
  await withEnv(
    { USER_TOKEN: "u-t0k", USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      const v = verifyUserAuth(mkRequest());
      assert.deepEqual(v, { kind: "unauthorized" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: USER_TOKENS_JSON maps tokens → distinct userIds", async () => {
  const json = JSON.stringify({ "tok-alice": "alice", "tok-bob": "bob" });
  await withEnv(
    { USER_TOKEN: undefined, USER_TOKENS_JSON: json, NODE_ENV: "production" },
    () => {
      const a = verifyUserAuth(mkRequest({ authorization: "Bearer tok-alice" }));
      const b = verifyUserAuth(mkRequest({ authorization: "Bearer tok-bob" }));
      const c = verifyUserAuth(mkRequest({ authorization: "Bearer tok-nope" }));
      assert.deepEqual(a, { kind: "ok", userId: "alice" } as UserAuthVerdict);
      assert.deepEqual(b, { kind: "ok", userId: "bob" } as UserAuthVerdict);
      assert.deepEqual(c, { kind: "unauthorized" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: body/query userId=<x> CANNOT forge identity", async () => {
  // The handler derives userId from verifyUserAuth, not from the body/query.
  // This test confirms that the helper itself never looks at request.body or
  // request.nextUrl, so any forgery attempt at a higher layer is a dead end.
  await withEnv(
    { USER_TOKEN: "u-t0k", USER_TOKENS_JSON: undefined, NODE_ENV: "production" },
    () => {
      // Even if the caller sends `userId=admin` in the query string, the
      // verified userId is still "local" (derived from USER_TOKEN match).
      const v = verifyUserAuth(mkRequest({ authorization: "Bearer u-t0k" }));
      assert.equal(v.kind, "ok");
      if (v.kind === "ok") assert.equal(v.userId, "local");
    },
  );
});

// ---------------------------------------------------------------------------
// verifyUserAuth — signed cookie (ss_user) path (P0 browser auth fix)
// ---------------------------------------------------------------------------

test("verifyUserAuth: valid ss_user cookie → ok with userId from payload", async () => {
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "session-" + "s".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const token = signSession({ userId: "u_browser", issuedAt: Date.now() });
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` }),
      );
      assert.deepEqual(v, { kind: "ok", userId: "u_browser" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: expired ss_user cookie (>30d) → unauthorized", async () => {
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "session-" + "s".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const expiredToken = signSession({
        userId: "u_old",
        issuedAt: Date.now() - SESSION_MAX_AGE_MS - 5_000,
      });
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${expiredToken}` }),
      );
      // Env tokens unset AND cookie invalid → in prod we expect
      // "not_configured" via the pure-dev fallback branch, since verifyUserAuth
      // can't tell whether the operator forgot to set USER_TOKEN or just hasn't
      // minted a cookie yet. The key contract: a stale cookie does NOT
      // promote the caller to "ok".
      assert.notEqual(v.kind, "ok");
    },
  );
});

test("verifyUserAuth: ss_user cookie with tampered signature → not promoted", async () => {
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "session-" + "s".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const valid = signSession({ userId: "u_real", issuedAt: Date.now() });
      // Flip the last character of the signature half.
      const [p, sig] = valid.split(".");
      const tampered = `${p}.${sig!.slice(0, -1)}${sig!.endsWith("A") ? "B" : "A"}`;
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${tampered}` }),
      );
      assert.notEqual(v.kind, "ok");
    },
  );
});

test("verifyUserAuth: ss_user cookie signed by DIFFERENT secret → not promoted", async () => {
  let tokenFromOther = "";
  await withEnv(
    { SESSION_SECRET: "other-" + "o".repeat(40) },
    () => {
      tokenFromOther = signSession({ userId: "evil", issuedAt: Date.now() });
    },
  );
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "correct-" + "c".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${tokenFromOther}` }),
      );
      assert.notEqual(v.kind, "ok");
    },
  );
});

test("verifyUserAuth: header wins over cookie when both present", async () => {
  await withEnv(
    {
      USER_TOKEN: "u-header-token",
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "session-" + "s".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const cookieToken = signSession({
        userId: "u_cookie",
        issuedAt: Date.now(),
      });
      const v = verifyUserAuth(
        mkRequest({
          authorization: "Bearer u-header-token",
          cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
        }),
      );
      // Header token maps to userId="local" via USER_TOKEN. If the cookie
      // had won, we would have seen "u_cookie" instead.
      assert.deepEqual(v, { kind: "ok", userId: "local" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: valid cookie works even when USER_TOKEN is also set", async () => {
  // Cookie-only caller — no header. USER_TOKEN env is set but the browser
  // didn't send it. The cookie path should still succeed.
  await withEnv(
    {
      USER_TOKEN: "u-header-token",
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: "session-" + "s".repeat(40),
      NODE_ENV: "production",
    },
    () => {
      const token = signSession({
        userId: "u_browser",
        issuedAt: Date.now(),
      });
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` }),
      );
      assert.deepEqual(
        v,
        { kind: "ok", userId: "u_browser" } as UserAuthVerdict,
      );
    },
  );
});

test("verifyUserAuth: no cookie, SESSION_SECRET unset, prod env-less → not_configured", async () => {
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: undefined,
      NODE_ENV: "production",
    },
    () => {
      const v = verifyUserAuth(mkRequest());
      assert.deepEqual(v, { kind: "not_configured" } as UserAuthVerdict);
    },
  );
});

test("verifyUserAuth: cookie present but no SESSION_SECRET → cookie ignored", async () => {
  // Cookie value is opaque from the client's POV; without SESSION_SECRET
  // the server can't verify it, so verifyUserAuth should treat the caller
  // as if no cookie was sent. With USER_TOKEN also unset in prod, that
  // collapses to not_configured (the pre-existing env-less prod guard).
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      SESSION_SECRET: undefined,
      NODE_ENV: "production",
    },
    () => {
      const v = verifyUserAuth(
        mkRequest({ cookie: `${SESSION_COOKIE_NAME}=abc.def` }),
      );
      assert.deepEqual(v, { kind: "not_configured" } as UserAuthVerdict);
    },
  );
});

test("userAuthFailureResponse: ok → null", () => {
  const r = userAuthFailureResponse({ kind: "ok", userId: "x" });
  assert.equal(r, null);
});

test("userAuthFailureResponse: unauthorized → 401 with {ok:false,error,code}", async () => {
  const r = userAuthFailureResponse({ kind: "unauthorized" });
  assert.ok(r !== null);
  assert.equal(r!.status, 401);
  const body = await r!.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "UNAUTHORIZED");
});

test("userAuthFailureResponse: not_configured → 503 naming USER_TOKEN", async () => {
  const r = userAuthFailureResponse({ kind: "not_configured" });
  assert.ok(r !== null);
  assert.equal(r!.status, 503);
  const body = await r!.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "AUTH_NOT_CONFIGURED");
  assert.match(body.error, /USER_TOKEN|USER_TOKENS_JSON/);
});

// ---------------------------------------------------------------------------
// Smoke test: /api/pipeline/alerts route returns 401 in prod without auth
// ---------------------------------------------------------------------------

test("alerts GET: prod + no auth env + no header → 503 (auth not configured)", async () => {
  // Deferred import so we pick up current process.env on module load.
  const { GET } = await import("../../../app/api/pipeline/alerts/route");
  await withEnv(
    {
      USER_TOKEN: undefined,
      USER_TOKENS_JSON: undefined,
      NODE_ENV: "production",
    },
    async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL("http://x/api/pipeline/alerts?userId=somebody-else"),
      } as unknown as Parameters<typeof GET>[0];
      const res = await GET(req);
      // Not configured in prod — helper returns 503, not 401.
      assert.equal(res.status, 503);
      const body = (await res.json()) as { ok: boolean; code?: string };
      assert.equal(body.ok, false);
      assert.equal(body.code, "AUTH_NOT_CONFIGURED");
    },
  );
});

test("alerts GET: prod + USER_TOKEN set + no header → 401", async () => {
  const { GET } = await import("../../../app/api/pipeline/alerts/route");
  await withEnv(
    {
      USER_TOKEN: "u-t0k",
      USER_TOKENS_JSON: undefined,
      NODE_ENV: "production",
    },
    async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL("http://x/api/pipeline/alerts?userId=admin"),
      } as unknown as Parameters<typeof GET>[0];
      const res = await GET(req);
      assert.equal(res.status, 401);
      const body = (await res.json()) as { ok: boolean; code?: string };
      assert.equal(body.ok, false);
      assert.equal(body.code, "UNAUTHORIZED");
    },
  );
});

test("alerts GET: prod + USER_TOKEN match → 200 (userId derived from token, NOT from ?userId=)", async () => {
  const { GET } = await import("../../../app/api/pipeline/alerts/route");
  await withEnv(
    {
      USER_TOKEN: "u-t0k",
      USER_TOKENS_JSON: undefined,
      NODE_ENV: "production",
    },
    async () => {
      const req = {
        headers: new Headers({ authorization: "Bearer u-t0k" }),
        nextUrl: new URL("http://x/api/pipeline/alerts?userId=admin"),
      } as unknown as Parameters<typeof GET>[0];
      const res = await GET(req);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok: boolean;
        events: unknown[];
        unreadCount: number;
      };
      assert.equal(body.ok, true);
      assert.ok(Array.isArray(body.events));
      // No forgery: we got "local"'s empty feed, not "admin"'s (whatever that would be).
      assert.equal(body.unreadCount, 0);
    },
  );
});
