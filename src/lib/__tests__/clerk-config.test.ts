import assert from "node:assert/strict";
import test from "node:test";

import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

// NODE_ENV is typed readonly on ProcessEnv; tests legitimately vary it.
function mutableEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

test.afterEach(() => {
  restoreEnv();
});

test("Clerk publishable key allows test keys outside production runtime", () => {
  mutableEnv().NODE_ENV = "development";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_local";
  process.env.CLERK_SECRET_KEY = "sk_test_local";

  assert.equal(getClerkPublishableKey(), "pk_test_local");
});

test("Clerk publishable key is disabled in production without a live key pair", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    mutableEnv().NODE_ENV = "production";
    delete process.env.CLERK_ALLOW_TEST_KEYS;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_wrong";
    process.env.CLERK_SECRET_KEY = "";

    assert.equal(getClerkPublishableKey(), undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /pk_live_\*/);
  } finally {
    console.warn = originalWarn;
  }
});

test("Clerk publishable key allows production with a live key pair", () => {
  mutableEnv().NODE_ENV = "production";
  delete process.env.CLERK_ALLOW_TEST_KEYS;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_ready";
  process.env.CLERK_SECRET_KEY = "sk_live_ready";

  assert.equal(getClerkPublishableKey(), "pk_live_ready");
});

test("CLERK_ALLOW_TEST_KEYS=1 lets a staging prod build keep test keys", () => {
  mutableEnv().NODE_ENV = "production";
  process.env.CLERK_ALLOW_TEST_KEYS = "1";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_staging";
  process.env.CLERK_SECRET_KEY = "sk_test_staging";

  assert.equal(getClerkPublishableKey(), "pk_test_staging");
});
