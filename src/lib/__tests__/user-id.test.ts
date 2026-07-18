// Canonical userId scheme helpers (lib/auth/user-id) — pure, no I/O.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clerkDerivedUserId,
  isAnonymousUserId,
  isClerkDerivedUserId,
  isLegacyEmailUserId,
} from "@/lib/auth/user-id";

test("clerkDerivedUserId prefixes with c_ and round-trips the classifier", () => {
  const id = clerkDerivedUserId("user_2abcDEF");
  assert.equal(id, "c_user_2abcDEF");
  assert.equal(isClerkDerivedUserId(id), true);
  assert.equal(isAnonymousUserId(id), false);
  assert.equal(isLegacyEmailUserId(id), false);
});

test("classifiers distinguish the three id families and reject junk", () => {
  assert.equal(isAnonymousUserId("a_r4nd0m"), true);
  assert.equal(isLegacyEmailUserId("u_hmac22chars"), true);
  assert.equal(isClerkDerivedUserId("u_hmac22chars"), false);
  assert.equal(isClerkDerivedUserId(null), false);
  assert.equal(isAnonymousUserId(undefined), false);
  assert.equal(isLegacyEmailUserId(""), false);
  // "local" (dev fallback) belongs to no family.
  assert.equal(
    isClerkDerivedUserId("local") || isAnonymousUserId("local") || isLegacyEmailUserId("local"),
    false,
  );
});
