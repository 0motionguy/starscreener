import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAuthHref,
  getAuthRedirectFromSearchParams,
  normalizeAuthRedirectUrl,
} from "@/lib/auth/redirect-url";
import { parseClerkReferralUnsafeMetadata } from "@/lib/auth/referral-metadata";

test("auth redirects preserve local path, query, and hash", () => {
  assert.equal(
    normalizeAuthRedirectUrl(
      "/compare?repos=vercel%2Fnext.js%2Copenai%2Fcodex#chart",
    ),
    "/compare?repos=vercel/next.js,openai/codex#chart",
  );
});

test("auth redirects canonicalize same-origin absolute URLs", () => {
  assert.equal(
    normalizeAuthRedirectUrl("https://trendingrepo.com/account?tab=settings"),
    "/account?tab=settings",
  );
  assert.equal(
    normalizeAuthRedirectUrl("https://www.trendingrepo.com/account#billing"),
    "/account#billing",
  );
});

test("auth redirects reject external, auth, api, and malformed targets", () => {
  for (const value of [
    "https://evil.example/repo",
    "//evil.example/repo",
    "https://trendingrepo.com.evil.example/account",
    "https://trendingrepo.com/api/me/profile",
    "/sign-in?redirect_url=/repo/vercel/next.js",
    "/sign-up",
    "/api/me/profile",
    "/_next/static/app.js",
    "/repo/ok\r\nLocation:%20//evil.example",
  ]) {
    assert.equal(normalizeAuthRedirectUrl(value), "/you");
  }
});

test("auth href builder encodes the safe redirect target", () => {
  assert.equal(
    buildAuthHref("/sign-in", "/repo/vercel/next.js?tab=signals"),
    "/sign-in?redirect_url=%2Frepo%2Fvercel%2Fnext.js%3Ftab%3Dsignals",
  );
});

test("auth search params use the first redirect value", () => {
  assert.equal(
    getAuthRedirectFromSearchParams({
      redirect_url: ["/repo/openai/codex", "https://evil.example"],
    }),
    "/repo/openai/codex",
  );
});

test("auth search params fall back to Clerk redirect params", () => {
  assert.equal(
    getAuthRedirectFromSearchParams({
      sign_in_fallback_redirect_url: "https://trendingrepo.com/account",
    }),
    "/account",
  );
  assert.equal(
    getAuthRedirectFromSearchParams({
      redirect_url: "https://evil.example",
      sign_in_fallback_redirect_url:
        "https://www.trendingrepo.com/account?from=clerk",
    }),
    "/account?from=clerk",
  );
  assert.equal(
    getAuthRedirectFromSearchParams({
      sign_in_fallback_redirect_url: "https://evil.example",
      sign_up_fallback_redirect_url: "/account",
    }),
    "/account",
  );
});

test("Clerk referral metadata parser keeps only the signed handoff shape", () => {
  assert.deepEqual(
    parseClerkReferralUnsafeMetadata(
      JSON.stringify({
        code: "abc_123",
        urlHash: "/repo/vercel/next.js?ref=abc",
      }),
    ),
    {
      trRef: {
        code: "abc_123",
        urlHash: "/repo/vercel/next.js?ref=abc",
      },
    },
  );

  assert.equal(
    parseClerkReferralUnsafeMetadata(
      JSON.stringify({ code: "abc_123", urlHash: "https://evil.example" }),
    )?.trRef.urlHash,
    undefined,
  );
  assert.equal(parseClerkReferralUnsafeMetadata("{nope"), undefined);
  assert.equal(
    parseClerkReferralUnsafeMetadata(JSON.stringify({ code: "x" })),
    undefined,
  );
});
