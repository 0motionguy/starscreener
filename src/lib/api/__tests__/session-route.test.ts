// /api/auth/session route — identity bridge + takeover regression.
//
// The load-bearing security test here: POST used to accept `{email}` and
// mint the deterministic `u_<hmac(email)>` id for it, letting anyone who
// knew a user's email inherit their session (tier + alert rules). The
// route now ignores request bodies entirely; identity comes from the
// server-side Clerk probe (stubbed via _setClerkAuthProbeForTests) or an
// anonymous mint.
//
// Run:
//   npx tsx --test --require ./tests/setup-server-only-stub.cjs \
//     src/lib/api/__tests__/session-route.test.ts

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

import { DELETE, GET, POST } from "@/app/api/auth/session/route";
import { deriveUserId, signSession, verifySession } from "@/lib/api/session";
import { _setClerkAuthProbeForTests } from "@/lib/auth/clerk-session";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import { setUserTier, __resetUserTierCacheForTests } from "@/lib/pricing/user-tiers";

const ORIGINAL_ENV = { ...process.env };
let dataDir: string;

function makePost(body?: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = {
    // Distinct IP per test run keeps the per-IP mint rate-limit cold.
    "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  };
  if (cookie) headers.cookie = `ss_user=${cookie}`;
  const init: RequestInit = { method: "POST", headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  return new NextRequest(new Request("http://localhost/api/auth/session", init));
}

function makeGet(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `ss_user=${cookie}`;
  return new NextRequest(
    new Request("http://localhost/api/auth/session", { method: "GET", headers }),
  );
}

function setCookieHeader(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

function cookieValue(response: Response): string | null {
  const header = setCookieHeader(response);
  const match = header.match(/ss_user=([^;]*)/);
  return match ? match[1] : null;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "session-route-"));
  process.env.STARSCREENER_DATA_DIR = dataDir;
  process.env.SESSION_SECRET = "session-secret-session-route-test";
  _setClerkAuthProbeForTests(async () => null);
  __resetUserTierCacheForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  _setClerkAuthProbeForTests(null);
  __resetUserTierCacheForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

test("TAKEOVER REGRESSION: POST with a victim email mints an anonymous id, never u_<hmac(email)>", async () => {
  const victimEmail = "victim@example.com";
  const victimLegacyId = deriveUserId(victimEmail);
  // The victim holds a paid tier under the legacy id (pre-unification state).
  await setUserTier(victimLegacyId, "pro", null);

  const response = await POST(makePost({ email: victimEmail }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.notEqual(body.userId, victimLegacyId, "must not mint the victim's id");
  assert.ok(body.userId.startsWith("a_"), `expected anonymous id, got ${body.userId}`);

  // And the minted cookie carries no tier.
  const payload = verifySession(cookieValue(response));
  assert.ok(payload);
  assert.equal(payload.tier, undefined);
});

test("Clerk session present → c_<clerkUserId> cookie with tier hint from the store", async () => {
  _setClerkAuthProbeForTests(async () => "user_clerk42");
  const canonicalId = clerkDerivedUserId("user_clerk42");
  await setUserTier(canonicalId, "pro", null);

  const response = await POST(makePost());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.userId, canonicalId);

  const payload = verifySession(cookieValue(response));
  assert.ok(payload);
  assert.equal(payload.userId, canonicalId);
  assert.equal(payload.tier, "pro");
});

test("anonymous renewal keeps the same a_ id across POSTs", async () => {
  const first = await POST(makePost());
  const firstBody = await first.json();
  assert.ok(firstBody.userId.startsWith("a_"));

  const second = await POST(makePost(undefined, cookieValue(first) ?? undefined));
  const secondBody = await second.json();
  assert.equal(secondBody.userId, firstBody.userId);
});

test("c_ cookie WITHOUT a Clerk session is not renewed — fresh anonymous id instead", async () => {
  const staleClerkCookie = signSession({
    userId: clerkDerivedUserId("user_gone"),
    issuedAt: Date.now(),
    tier: "pro",
    tierExpiresAt: null,
  });

  const response = await POST(makePost(undefined, staleClerkCookie));
  const body = await response.json();
  assert.ok(body.userId.startsWith("a_"), `expected fresh anonymous id, got ${body.userId}`);

  const payload = verifySession(cookieValue(response));
  assert.ok(payload);
  assert.equal(payload.tier, undefined, "tier must not survive the downgrade");
});

test("GET self-heals a c_ cookie whose Clerk session is gone", async () => {
  const staleClerkCookie = signSession({
    userId: clerkDerivedUserId("user_gone"),
    issuedAt: Date.now(),
  });

  const response = await GET(makeGet(staleClerkCookie));
  const body = await response.json();
  assert.equal(body.ok, false);
  // Cookie is expired via Max-Age=0.
  assert.match(setCookieHeader(response), /ss_user=;/);
  assert.match(setCookieHeader(response), /Max-Age=0/);
});

test("GET reports a live c_ session when the Clerk probe matches", async () => {
  _setClerkAuthProbeForTests(async () => "user_alive");
  const canonicalId = clerkDerivedUserId("user_alive");
  await setUserTier(canonicalId, "team", null);
  const cookie = signSession({
    userId: canonicalId,
    issuedAt: Date.now(),
    tier: "team",
    tierExpiresAt: null,
  });

  const response = await GET(makeGet(cookie));
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.userId, canonicalId);
  assert.equal(body.tier, "team");
});

test("GET returns the FRESH store tier after checkout and re-mints the cookie (CheckoutSuccess contract)", async () => {
  _setClerkAuthProbeForTests(async () => "user_buyer");
  const canonicalId = clerkDerivedUserId("user_buyer");
  // Cookie minted pre-checkout: no tier hint.
  const preCheckoutCookie = signSession({
    userId: canonicalId,
    issuedAt: Date.now(),
  });
  // Stripe webhook lands the entitlement in the STORE only.
  await setUserTier(canonicalId, "pro", null, { stripeCustomerId: "cus_x" });

  const response = await GET(makeGet(preCheckoutCookie));
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.tier, "pro", "probe must read the store, not the stale cookie hint");

  // And the response re-minted the cookie with the fresh tier embedded.
  const reminted = verifySession(cookieValue(response));
  assert.ok(reminted, "expected a re-minted cookie");
  assert.equal(reminted.userId, canonicalId);
  assert.equal(reminted.tier, "pro");
});

test("GET leaves anonymous cookies alone (no Clerk probe involved)", async () => {
  const anonCookie = signSession({ userId: "a_stable123", issuedAt: Date.now() });
  const response = await GET(makeGet(anonCookie));
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.userId, "a_stable123");
  assert.equal(setCookieHeader(response), "", "probe must not rewrite the cookie");
});

test("DELETE clears the cookie", async () => {
  const response = await DELETE();
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(setCookieHeader(response), /Max-Age=0/);
});
