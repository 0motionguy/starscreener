// Tier read-through resolution (lib/pricing/tier-resolve) — canonical
// c_ id first, legacy email-derived id fallback, forward-migration.
//
// Uses a temp STARSCREENER_DATA_DIR so the JSONL tier store is isolated
// per run (same fixture pattern as twitter-outbound tests).

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deriveUserId } from "@/lib/api/session";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import {
  getTierRecordForClerkUser,
  getTierForClerkUser,
  isTierRecordExpired,
} from "@/lib/pricing/tier-resolve";
import {
  setUserTier,
  getUserTierRecord,
  __resetUserTierCacheForTests,
} from "@/lib/pricing/user-tiers";

const ORIGINAL_ENV = { ...process.env };
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tier-resolve-"));
  process.env.STARSCREENER_DATA_DIR = dataDir;
  process.env.SESSION_SECRET = "session-secret-tier-resolve-test";
  __resetUserTierCacheForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  __resetUserTierCacheForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

test("canonical c_ record wins and no migration happens", async () => {
  const clerkId = "user_canonical1";
  await setUserTier(clerkDerivedUserId(clerkId), "pro", null);

  const record = await getTierRecordForClerkUser(clerkId, "someone@example.com");
  assert.equal(record?.tier, "pro");
  assert.equal(record?.userId, clerkDerivedUserId(clerkId));
});

test("legacy email-derived record resolves and forward-migrates to c_ id", async () => {
  const clerkId = "user_migrate1";
  const email = "buyer@example.com";
  const legacyId = deriveUserId(email);
  await setUserTier(legacyId, "team", null, {
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_456",
  });

  const record = await getTierRecordForClerkUser(clerkId, email);
  assert.equal(record?.tier, "team");
  assert.equal(record?.stripeCustomerId, "cus_123");

  // The migration wrote a canonical record carrying the Stripe handles.
  const canonical = await getUserTierRecord(clerkDerivedUserId(clerkId));
  assert.equal(canonical?.tier, "team");
  assert.equal(canonical?.stripeCustomerId, "cus_123");
  assert.equal(canonical?.stripeSubscriptionId, "sub_456");
});

test("no record under either id → null record, free tier", async () => {
  const record = await getTierRecordForClerkUser("user_none", "nobody@example.com");
  assert.equal(record, null);
  assert.equal(await getTierForClerkUser("user_none", "nobody@example.com"), "free");
});

test("expired record reads as free via getTierForClerkUser", async () => {
  const clerkId = "user_expired1";
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await setUserTier(clerkDerivedUserId(clerkId), "pro", past);

  const record = await getTierRecordForClerkUser(clerkId, null);
  assert.ok(record);
  assert.equal(isTierRecordExpired(record), true);
  assert.equal(await getTierForClerkUser(clerkId, null), "free");
});

test("missing SESSION_SECRET skips the legacy probe instead of throwing", async () => {
  delete process.env.SESSION_SECRET;
  const record = await getTierRecordForClerkUser("user_nosecret", "x@example.com");
  assert.equal(record, null);
});
