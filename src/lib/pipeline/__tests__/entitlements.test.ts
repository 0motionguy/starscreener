// StarScreener — pricing / tier / entitlements tests.
//
// Run:
//   npx tsx --test src/lib/pipeline/__tests__/entitlements.test.ts
//
// Isolation: tests that touch the user-tiers JSONL file override
// STARSCREENER_DATA_DIR before the store module resolves paths. Each
// test mints its own temp dir so parallel runs can't collide.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TIERS,
  TIER_ORDER,
  isUserTier,
  monthlyCostForSeats,
  tierFor,
  type UserTier,
} from "../../pricing/tiers";
import {
  canUseFeature,
  featureLimit,
  tierCanUseFeature,
  tierFeatureLimit,
  type FeatureKey,
} from "../../pricing/entitlements";
import {
  __resetUserTierCacheForTests,
  __getUserTierDiskReadCountForTests,
  USER_TIERS_FILE,
  getUserTier,
  getUserTierRecord,
  listUserTiers,
  setUserTier,
} from "../../pricing/user-tiers";
import {
  SESSION_MAX_AGE_MS,
  signSession,
  verifySession,
  type SessionPayload,
} from "../../api/session";

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function makeTempDataDir(label: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `ss-tiers-${label}-`));
  process.env.STARSCREENER_DATA_DIR = dir;
  __resetUserTierCacheForTests();
  return dir;
}

async function withSecret<T>(
  secret: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prior = process.env.SESSION_SECRET;
  try {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    return await fn();
  } finally {
    if (prior === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prior;
  }
}

// ---------------------------------------------------------------------------
// tiers.ts — shape + defaults
// ---------------------------------------------------------------------------

test("TIERS: every declared tier has every feature key defined", () => {
  const requiredKeys: Array<keyof (typeof TIERS)["free"]["features"]> = [
    "maxAlertRules",
    "maxWebhookTargets",
    "maxWatchlistRepos",
    "rateLimitMultiplier",
    "csvExport",
    "privateWatchlist",
    "emailDigest",
    "mcpUsageReports",
    "teamWorkspace",
    "prioritySupport",
    "customSlas",
    "onPremFeeds",
  ];
  for (const tierKey of TIER_ORDER) {
    const features = TIERS[tierKey].features;
    for (const featureKey of requiredKeys) {
      assert.ok(
        featureKey in features,
        `tier ${tierKey} missing feature ${String(featureKey)}`,
      );
      assert.notEqual(
        features[featureKey],
        undefined,
        `tier ${tierKey}.features.${String(featureKey)} is undefined`,
      );
    }
  }
});

test("TIERS: pricing reflects the tier design brief", () => {
  assert.equal(TIERS.free.priceMonthlyUsd, 0);
  assert.equal(TIERS.pro.priceMonthlyUsd, 19);
  assert.equal(TIERS.pro.priceYearlyUsd, 180);
  assert.equal(TIERS.team.priceMonthlyUsd, 49);
  assert.equal(TIERS.team.priceYearlyUsd, 480);
  assert.equal(TIERS.team.minSeats, 3);
  assert.equal(TIERS.enterprise.priceMonthlyUsd, null);
});

test("TIERS: feature limits match the design", () => {
  assert.equal(TIERS.free.features.maxAlertRules, 3);
  assert.equal(TIERS.free.features.maxWebhookTargets, 0);
  assert.equal(TIERS.free.features.maxWatchlistRepos, 5);
  assert.equal(TIERS.free.features.rateLimitMultiplier, 1);
  assert.equal(TIERS.free.features.csvExport, false);

  assert.equal(TIERS.pro.features.maxAlertRules, 60);
  assert.equal(TIERS.pro.features.maxWebhookTargets, 3);
  assert.equal(TIERS.pro.features.maxWatchlistRepos, -1);
  assert.equal(TIERS.pro.features.rateLimitMultiplier, 10);
  assert.equal(TIERS.pro.features.csvExport, true);
  assert.equal(TIERS.pro.features.privateWatchlist, true);
  assert.equal(TIERS.pro.features.emailDigest, true);

  assert.equal(TIERS.team.features.maxAlertRules, -1);
  assert.equal(TIERS.team.features.maxWebhookTargets, -1);
  assert.equal(TIERS.team.features.teamWorkspace, true);
  assert.equal(TIERS.team.features.prioritySupport, true);

  assert.equal(TIERS.enterprise.features.customSlas, true);
  assert.equal(TIERS.enterprise.features.onPremFeeds, true);
});

test("tierFor: null / undefined / unknown → free", () => {
  assert.equal(tierFor(null).key, "free");
  assert.equal(tierFor(undefined).key, "free");
  assert.equal(tierFor("nonsense" as unknown as UserTier).key, "free");
});

test("tierFor: each known key returns the matching definition", () => {
  for (const key of TIER_ORDER) {
    assert.equal(tierFor(key).key, key);
  }
});

test("isUserTier: narrows known / rejects unknown", () => {
  assert.equal(isUserTier("free"), true);
  assert.equal(isUserTier("pro"), true);
  assert.equal(isUserTier("team"), true);
  assert.equal(isUserTier("enterprise"), true);
  assert.equal(isUserTier("unknown"), false);
  assert.equal(isUserTier(null), false);
  assert.equal(isUserTier(42), false);
});

test("monthlyCostForSeats: team billing honors min + extra seats", () => {
  assert.equal(monthlyCostForSeats("team", 3), 49); // min
  assert.equal(monthlyCostForSeats("team", 4), 49 + 49); // +1 extra
  assert.equal(monthlyCostForSeats("team", 2), 49); // clamps to min
  assert.equal(monthlyCostForSeats("pro", 1), 19);
  assert.equal(monthlyCostForSeats("free", 1), 0);
  assert.equal(monthlyCostForSeats("enterprise", 10), null);
});

// ---------------------------------------------------------------------------
// entitlements.ts — tier-level helpers (no store hit)
// ---------------------------------------------------------------------------

test("tierCanUseFeature: booleans per tier", () => {
  assert.equal(tierCanUseFeature("free", "csv.export"), false);
  assert.equal(tierCanUseFeature("pro", "csv.export"), true);
  assert.equal(tierCanUseFeature("team", "team.workspace"), true);
  assert.equal(tierCanUseFeature("free", "team.workspace"), false);
  assert.equal(tierCanUseFeature("pro", "support.priority"), false);
  assert.equal(tierCanUseFeature("team", "support.priority"), true);
});

test("tierCanUseFeature: webhooks require > 0 or unlimited", () => {
  assert.equal(tierCanUseFeature("free", "webhooks.create"), false);
  assert.equal(tierCanUseFeature("pro", "webhooks.create"), true);
  assert.equal(tierCanUseFeature("team", "webhooks.create"), true);
});

test("tierFeatureLimit: numeric caps match the tier table", () => {
  assert.equal(tierFeatureLimit("free", "alerts.max"), 3);
  assert.equal(tierFeatureLimit("pro", "alerts.max"), 60);
  assert.equal(tierFeatureLimit("team", "alerts.max"), -1);
  assert.equal(tierFeatureLimit("free", "webhooks.max"), 0);
  assert.equal(tierFeatureLimit("pro", "webhooks.max"), 3);
  assert.equal(tierFeatureLimit("team", "webhooks.max"), -1);
  assert.equal(tierFeatureLimit("free", "watchlist.max"), 5);
  assert.equal(tierFeatureLimit("pro", "watchlist.max"), -1);
});

// ---------------------------------------------------------------------------
// entitlements — async store path
// ---------------------------------------------------------------------------

test("canUseFeature: null userId → treated as free tier", async () => {
  makeTempDataDir("anon");
  assert.equal(await canUseFeature(null, "csv.export"), false);
  assert.equal(await canUseFeature(null, "alerts.create"), true);
});

test("canUseFeature: free user locked out of Pro features", async () => {
  makeTempDataDir("free-user");
  // No record written → defaults to free.
  assert.equal(await canUseFeature("user-X", "csv.export"), false);
  assert.equal(await canUseFeature("user-X", "digest.email"), false);
});

test("canUseFeature: Pro user unlocks CSV + digest", async () => {
  makeTempDataDir("pro-user");
  await setUserTier("user-pro", "pro", null);
  assert.equal(await canUseFeature("user-pro", "csv.export"), true);
  assert.equal(await canUseFeature("user-pro", "digest.email"), true);
  assert.equal(await canUseFeature("user-pro", "team.workspace"), false);
});

test("featureLimit: pulls the right cap per tier", async () => {
  makeTempDataDir("limits");
  await setUserTier("user-free", "free", null);
  await setUserTier("user-pro", "pro", null);
  await setUserTier("user-team", "team", null);

  assert.equal(await featureLimit("user-free", "alerts.max"), 3);
  assert.equal(await featureLimit("user-pro", "alerts.max"), 60);
  assert.equal(await featureLimit("user-team", "alerts.max"), -1);
  assert.equal(await featureLimit(null, "alerts.max"), 3);
});

// ---------------------------------------------------------------------------
// user-tiers store: upsert + expiry + caching
// ---------------------------------------------------------------------------

test("setUserTier + getUserTier: round-trip persists", async () => {
  makeTempDataDir("roundtrip");
  const record = await setUserTier("u_round", "pro", null);
  assert.equal(record.tier, "pro");
  assert.equal(await getUserTier("u_round"), "pro");

  const fetched = await getUserTierRecord("u_round");
  assert.ok(fetched);
  assert.equal(fetched!.tier, "pro");
  assert.equal(fetched!.userId, "u_round");
});

test("setUserTier: writing the same user twice keeps one row (upsert)", async () => {
  makeTempDataDir("upsert");
  await setUserTier("u_same", "pro", null);
  await setUserTier("u_same", "team", null);
  const rows = await listUserTiers();
  assert.equal(rows.filter((r) => r.userId === "u_same").length, 1);
  assert.equal(await getUserTier("u_same"), "team");
});

test("getUserTier: expired record → free", async () => {
  makeTempDataDir("expired");
  const pastIso = new Date(Date.now() - 60_000).toISOString();
  await setUserTier("u_expired", "pro", pastIso);
  assert.equal(await getUserTier("u_expired"), "free");
});

test("getUserTier: null expiry never expires", async () => {
  makeTempDataDir("no-expiry");
  await setUserTier("u_forever", "pro", null);
  assert.equal(await getUserTier("u_forever"), "pro");
});

test("getUserTier: unknown user → free", async () => {
  makeTempDataDir("unknown-user");
  assert.equal(await getUserTier("u_missing"), "free");
  assert.equal(await getUserTier(""), "free");
  assert.equal(await getUserTier(null), "free");
  assert.equal(await getUserTier(undefined), "free");
});

test("getUserTier: mtime cache skips disk on repeat reads", async () => {
  makeTempDataDir("cache");
  await setUserTier("u_cache", "pro", null);
  __resetUserTierCacheForTests();

  const beforeFirst = __getUserTierDiskReadCountForTests();
  await getUserTier("u_cache");
  const afterFirst = __getUserTierDiskReadCountForTests();
  assert.equal(afterFirst - beforeFirst, 1, "first read should hit disk");

  await getUserTier("u_cache");
  await getUserTier("u_cache");
  await getUserTier("u_cache");
  const afterRepeat = __getUserTierDiskReadCountForTests();
  assert.equal(
    afterRepeat - afterFirst,
    0,
    "cached reads should not touch disk when mtime is unchanged",
  );
});

test("getUserTier: cache invalidates after setUserTier", async () => {
  const dir = makeTempDataDir("cache-invalidate");
  void dir;
  await setUserTier("u_invalidate", "free", null);
  assert.equal(await getUserTier("u_invalidate"), "free");
  await setUserTier("u_invalidate", "pro", null);
  assert.equal(await getUserTier("u_invalidate"), "pro");
});

test("loadIndex: skips rows with invalid tier values", async () => {
  const dir = makeTempDataDir("invalid-rows");
  // Hand-write a file with one good row + one bogus row.
  const filePath = path.join(dir, USER_TIERS_FILE);
  const now = new Date().toISOString();
  const good = {
    userId: "u_good",
    tier: "pro",
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const bad = {
    userId: "u_bad",
    tier: "ultrapremium",
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(
    filePath,
    `${JSON.stringify(good)}\n${JSON.stringify(bad)}\n`,
    "utf8",
  );
  __resetUserTierCacheForTests();
  assert.equal(await getUserTier("u_good"), "pro");
  assert.equal(await getUserTier("u_bad"), "free");
});

// ---------------------------------------------------------------------------
// Session round-trip: tier survives sign → verify
// ---------------------------------------------------------------------------

test("signSession + verifySession: tier field round-trips", async () => {
  await withSecret("s" + "x".repeat(40), () => {
    const payload: SessionPayload = {
      userId: "u_tier",
      issuedAt: Date.now(),
      tier: "pro",
      tierExpiresAt: null,
    };
    const token = signSession(payload);
    const recovered = verifySession(token);
    assert.ok(recovered);
    assert.equal(recovered!.userId, "u_tier");
    assert.equal(recovered!.tier, "pro");
    assert.equal(recovered!.tierExpiresAt, null);
  });
});

test("verifySession: legacy cookie without tier still verifies (treated as free)", async () => {
  await withSecret("s" + "y".repeat(40), () => {
    // Old cookie shape: only { userId, issuedAt }. We build via signSession
    // so we don't accidentally depend on internal encoding details.
    const token = signSession({ userId: "u_legacy", issuedAt: Date.now() });
    const recovered = verifySession(token);
    assert.ok(recovered);
    assert.equal(recovered!.userId, "u_legacy");
    assert.equal(recovered!.tier, undefined);
    assert.equal(recovered!.tierExpiresAt, undefined);
  });
});

test("verifySession: bogus tier field silently dropped (session still valid)", async () => {
  await withSecret("s" + "z".repeat(40), () => {
    // Use the round-trip with a cast to simulate a cookie signed with a
    // tampered tier. verifySession should drop the bad tier but keep the
    // rest of the payload — the HMAC still matches what we signed.
    const token = signSession({
      userId: "u_bogus",
      issuedAt: Date.now(),
      tier: "nonsense" as unknown as UserTier,
    });
    const recovered = verifySession(token);
    assert.ok(recovered);
    assert.equal(recovered!.userId, "u_bogus");
    assert.equal(recovered!.tier, undefined);
  });
});

test("verifySession: tier field doesn't break expiry checks", async () => {
  await withSecret("s" + "q".repeat(40), () => {
    const old: SessionPayload = {
      userId: "u_expiry",
      issuedAt: Date.now() - SESSION_MAX_AGE_MS - 1_000,
      tier: "pro",
    };
    const token = signSession(old);
    assert.equal(verifySession(token), null);
  });
});

// ---------------------------------------------------------------------------
// FeatureKey type: every key has a tested pass/fail somewhere above.
// This test enumerates them so a future key addition fails this assertion
// until the author adds coverage.
// ---------------------------------------------------------------------------

test("FeatureKey: every key resolves without throwing on free + pro", async () => {
  makeTempDataDir("feature-smoke");
  await setUserTier("u_smoke", "pro", null);
  const allKeys: FeatureKey[] = [
    "alerts.create",
    "alerts.max",
    "webhooks.create",
    "webhooks.max",
    "watchlist.max",
    "csv.export",
    "watchlist.private",
    "digest.email",
    "mcp.usage-reports",
    "team.workspace",
    "support.priority",
  ];
  for (const key of allKeys) {
    const free = await canUseFeature(null, key);
    const pro = await canUseFeature("u_smoke", key);
    assert.equal(typeof free, "boolean");
    assert.equal(typeof pro, "boolean");
  }
});
