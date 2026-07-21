// Subscription-status classification — the pure half of the account-deletion
// guard (the route itself needs Clerk + DB, covered by integration).
//
// Run:
//   npx tsx --test --require ./tests/setup-server-only-stub.cjs \
//     src/lib/stripe/__tests__/subscription-status.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { isActivelyBillingStatus } from "../subscription-status";

test("actively-billing statuses BLOCK account deletion", () => {
  for (const s of ["active", "trialing", "past_due", "unpaid"]) {
    assert.equal(isActivelyBillingStatus(s), true, `${s} should still bill`);
  }
});

test("terminal / non-billing statuses ALLOW account deletion", () => {
  for (const s of ["canceled", "incomplete_expired", "incomplete", "paused", "ended", ""]) {
    assert.equal(isActivelyBillingStatus(s), false, `${s} should not block delete`);
  }
});
