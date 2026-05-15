import assert from "node:assert/strict";
import test from "node:test";

import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

test.afterEach(() => {
  restoreEnv();
});

test("Clerk publishable key allows local test keys outside Vercel Production", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_local";
  process.env.CLERK_SECRET_KEY = "sk_test_local";

  assert.equal(getClerkPublishableKey(), "pk_test_local");
});

test("Clerk publishable key is disabled in Vercel Production without a live key pair", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_wrong";
    process.env.CLERK_SECRET_KEY = "";

    assert.equal(getClerkPublishableKey(), undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /pk_live_\*/);
  } finally {
    console.warn = originalWarn;
  }
});

test("Clerk publishable key allows Vercel Production with a live key pair", () => {
  process.env.VERCEL_ENV = "production";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_ready";
  process.env.CLERK_SECRET_KEY = "sk_live_ready";

  assert.equal(getClerkPublishableKey(), "pk_live_ready");
});
