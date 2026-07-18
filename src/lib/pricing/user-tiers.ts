// StarScreener — userId → tier mapping.
//
// TWO BACKENDS behind one API:
//
//   Postgres (tr.user_tiers, src/lib/db/schema/user-tiers.ts)
//     Active when DATABASE_URL is set — i.e. production and any env with
//     the Supabase pool configured. Durable across deploys: the Docker
//     runner ships no `.data/` volume, so the old JSONL-only store lost
//     every paid tier on redeploy.
//
//   JSONL (.data/user-tiers.jsonl)
//     Dev/CI fallback when DATABASE_URL is unset. Same file store as
//     before, mtime-cached, mutation-locked. Also consulted ONCE per
//     userId as a read-through when the Postgres row is missing (covers
//     records written before the Postgres cutover; hits forward-migrate).
//
// Contract notes preserved from the JSONL era:
//   - `getUserTier` never throws — tier lookup sits on request hot paths.
//     Postgres failures log + degrade to the JSONL fallback, then "free".
//   - `setUserTier` validates tier keys and keeps prior Stripe handles
//     when the caller doesn't supply new ones.
//
// CLIENT BOUNDARY: this module uses node:fs (+ lazily the DB client).
// Client components MUST NOT import from here — use `./tiers` instead.

import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

import { AdminRecoverableError } from "@/lib/errors";
import {
  currentDataDir,
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";
import { isUserTier, type UserTier } from "./tiers";

export const USER_TIERS_FILE = "user-tiers.jsonl";

export interface UserTierRecord {
  userId: string;
  tier: UserTier;
  /**
   * ISO timestamp for when this tier assignment expires, or `null` for no
   * expiry. Free and enterprise use `null` (no expiry). Pro/team bought
   * through Stripe populate this from `current_period_end`.
   */
  expiresAt: string | null;
  /** Stripe customer id — populated by the webhook on first checkout. */
  stripeCustomerId?: string | null;
  /** Stripe subscription id — populated by the webhook on first checkout. */
  stripeSubscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

function postgresConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.trim().length > 0;
}

// Test hook — force a backend regardless of env. null = env-driven.
let backendOverride: "postgres" | "jsonl" | null = null;
export function __setUserTierBackendForTests(
  backend: "postgres" | "jsonl" | null,
): void {
  backendOverride = backend;
}

function activeBackend(): "postgres" | "jsonl" {
  if (backendOverride) return backendOverride;
  return postgresConfigured() ? "postgres" : "jsonl";
}

// ---------------------------------------------------------------------------
// Postgres backend
// ---------------------------------------------------------------------------
//
// Lazy imports keep the DB client (and its "server-only" + postgres-js
// deps) out of the module graph for JSONL-only environments and tests.
//
// Read cache: a tiny per-userId TTL map. Tier reads sit on request hot
// paths (entitlements, session mint); 30s of staleness is acceptable —
// the webhook busts the cache on write within the same instance, and
// cross-instance staleness self-heals within the TTL.

const PG_CACHE_TTL_MS = 30_000;
const pgCache = new Map<string, { at: number; record: UserTierRecord | null }>();

// userIds whose JSONL read-through already ran this process — avoids
// re-stat()ing the legacy file on every miss.
const jsonlReadThroughDone = new Set<string>();

function rowToRecord(row: {
  userId: string;
  tier: string;
  expiresAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserTierRecord | null {
  if (!isUserTier(row.tier)) return null;
  return {
    userId: row.userId,
    tier: row.tier,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function pgGetRecord(userId: string): Promise<UserTierRecord | null> {
  const cached = pgCache.get(userId);
  if (cached && Date.now() - cached.at < PG_CACHE_TTL_MS) {
    return cached.record;
  }

  const [{ getDb }, { userTiers }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/user-tiers"),
    import("drizzle-orm"),
  ]);
  const rows = await getDb()
    .select()
    .from(userTiers)
    .where(eq(userTiers.userId, userId))
    .limit(1);

  let record = rows.length > 0 ? rowToRecord(rows[0]) : null;

  // One-shot legacy read-through: a missing Postgres row may still exist
  // in the pre-cutover JSONL file (dev boxes, or a prod box that had a
  // volume after all). Migrate it forward so the next read is pure PG.
  if (!record && !jsonlReadThroughDone.has(userId)) {
    jsonlReadThroughDone.add(userId);
    try {
      const legacy = await jsonlGetRecord(userId);
      if (legacy) {
        record = await pgUpsert(
          legacy.userId,
          legacy.tier,
          legacy.expiresAt,
          {
            stripeCustomerId: legacy.stripeCustomerId ?? null,
            stripeSubscriptionId: legacy.stripeSubscriptionId ?? null,
          },
        );
        console.info("[user-tiers] migrated JSONL record to Postgres", {
          userId,
          tier: legacy.tier,
        });
      }
    } catch {
      // Legacy file unreadable — nothing to migrate.
    }
  }

  pgCache.set(userId, { at: Date.now(), record });
  return record;
}

async function pgUpsert(
  userId: string,
  tier: UserTier,
  expiresAt: string | null,
  options: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null },
): Promise<UserTierRecord> {
  const [{ getDb }, { userTiers }, { sql }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/user-tiers"),
    import("drizzle-orm"),
  ]);

  const now = new Date();
  const expiresDate = expiresAt ? new Date(expiresAt) : null;

  const inserted = await getDb()
    .insert(userTiers)
    .values({
      userId,
      tier,
      expiresAt: expiresDate,
      stripeCustomerId: options.stripeCustomerId ?? null,
      stripeSubscriptionId: options.stripeSubscriptionId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userTiers.userId,
      set: {
        tier,
        expiresAt: expiresDate,
        // Keep prior Stripe handles when the caller doesn't supply new
        // ones — mirrors the JSONL upsert semantics (COALESCE against the
        // existing row).
        stripeCustomerId:
          options.stripeCustomerId !== undefined && options.stripeCustomerId !== null
            ? options.stripeCustomerId
            : sql`COALESCE(EXCLUDED.stripe_customer_id, ${userTiers.stripeCustomerId})`,
        stripeSubscriptionId:
          options.stripeSubscriptionId !== undefined && options.stripeSubscriptionId !== null
            ? options.stripeSubscriptionId
            : sql`COALESCE(EXCLUDED.stripe_subscription_id, ${userTiers.stripeSubscriptionId})`,
        updatedAt: now,
      },
    })
    .returning();

  const record = inserted[0] ? rowToRecord(inserted[0]) : null;
  if (!record) {
    throw new AdminRecoverableError("setUserTier: postgres upsert returned no row", {
      userId,
    });
  }
  pgCache.set(userId, { at: Date.now(), record });
  return record;
}

async function pgList(): Promise<UserTierRecord[]> {
  const [{ getDb }, { userTiers }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/user-tiers"),
  ]);
  const rows = await getDb().select().from(userTiers);
  return rows
    .map((row) => rowToRecord(row))
    .filter((r): r is UserTierRecord => r !== null);
}

// ---------------------------------------------------------------------------
// JSONL backend (dev/CI fallback + legacy read-through source)
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  size: number;
  byUserId: Map<string, UserTierRecord>;
}

let _cache: CacheEntry | null = null;

function userTiersFilePath(): string {
  return path.join(currentDataDir(), USER_TIERS_FILE);
}

/**
 * Cheap disk stat. Returns -1/-1 on ENOENT so a missing file counts as a
 * distinct cache key from an empty file (both produce an empty index, but
 * the stat signature differs so we don't skip a real refresh later).
 */
function statSignature(): { mtimeMs: number; size: number } {
  try {
    const stat = statSync(userTiersFilePath());
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return { mtimeMs: -1, size: -1 };
  }
}

/**
 * Build the userId → record index from the JSONL file. Last-writer-wins
 * when the same userId appears on multiple lines (append-only semantics).
 *
 * Invalid / unknown tier keys are skipped rather than defaulted so a
 * typo in the file can't silently upgrade every user to free.
 */
async function loadIndex(): Promise<Map<string, UserTierRecord>> {
  const rows = await readJsonlFile<UserTierRecord>(USER_TIERS_FILE);
  const byUserId = new Map<string, UserTierRecord>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.userId !== "string" || row.userId.length === 0) continue;
    if (!isUserTier(row.tier)) continue;
    byUserId.set(row.userId, row);
  }
  return byUserId;
}

/**
 * Telemetry hook for tests — lets the entitlements test prove the cache
 * actually skips disk on repeat reads.
 */
let _diskReadCount = 0;

async function getIndexCounted(): Promise<Map<string, UserTierRecord>> {
  const { mtimeMs, size } = statSignature();
  if (_cache && _cache.mtimeMs === mtimeMs && _cache.size === size) {
    return _cache.byUserId;
  }
  _diskReadCount += 1;
  const byUserId = await loadIndex();
  _cache = { mtimeMs, size, byUserId };
  return byUserId;
}

async function jsonlGetRecord(userId: string): Promise<UserTierRecord | null> {
  const index = await getIndexCounted();
  return index.get(userId) ?? null;
}

async function jsonlUpsert(
  userId: string,
  tier: UserTier,
  expiresAt: string | null,
  options: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null },
): Promise<UserTierRecord> {
  const now = new Date().toISOString();
  let finalRecord: UserTierRecord | null = null;

  await mutateJsonlFile<UserTierRecord>(USER_TIERS_FILE, (current) => {
    const filtered = current.filter((row) => row?.userId !== userId);
    const priorRow = current.find((row) => row?.userId === userId) ?? null;
    const record: UserTierRecord = {
      userId,
      tier,
      expiresAt,
      stripeCustomerId:
        options.stripeCustomerId ?? priorRow?.stripeCustomerId ?? null,
      stripeSubscriptionId:
        options.stripeSubscriptionId ?? priorRow?.stripeSubscriptionId ?? null,
      createdAt: priorRow?.createdAt ?? now,
      updatedAt: now,
    };
    finalRecord = record;
    return [...filtered, record];
  });

  if (!finalRecord) {
    throw new Error("setUserTier: mutateJsonlFile did not produce a record");
  }
  // Bust the cache; the next read will observe the new mtime and reload.
  _cache = null;
  return finalRecord;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the tier key for `userId`. Returns `"free"` if the user has no
 * record or the record has expired. Never throws — tier lookup is on the
 * hot path for every authenticated request; a Postgres outage degrades to
 * the JSONL fallback, then to "free".
 */
export async function getUserTier(userId: string | null | undefined): Promise<UserTier> {
  if (!userId || typeof userId !== "string" || userId.length === 0) {
    return "free";
  }
  let record: UserTierRecord | null = null;
  try {
    record = await getUserTierRecord(userId);
  } catch {
    record = null;
  }
  if (!record) return "free";
  if (record.expiresAt) {
    const expiry = Date.parse(record.expiresAt);
    if (Number.isFinite(expiry) && expiry < Date.now()) {
      return "free";
    }
  }
  return record.tier;
}

/**
 * Fetch the full tier record for `userId`, or `null` if none. Useful for
 * billing surfaces / account pages that need to show expiry and Stripe
 * handles. Does NOT expire stale records (caller decides display).
 */
export async function getUserTierRecord(
  userId: string | null | undefined,
): Promise<UserTierRecord | null> {
  if (!userId || typeof userId !== "string" || userId.length === 0) return null;
  if (activeBackend() === "postgres") {
    try {
      return await pgGetRecord(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[user-tiers] postgres read failed — JSONL fallback", {
        userId,
        error: message.slice(0, 200),
      });
      return jsonlGetRecord(userId);
    }
  }
  return jsonlGetRecord(userId);
}

/**
 * Upsert a user-tier record. Postgres when configured (durable across
 * deploys), JSONL otherwise. Unlike reads, writes DO throw on backend
 * failure — the Stripe webhook must return 500 so Stripe retries rather
 * than dropping an entitlement on the floor.
 *
 * Returns the stored record.
 */
export async function setUserTier(
  userId: string,
  tier: UserTier,
  expiresAt: string | null,
  options: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null } = {},
): Promise<UserTierRecord> {
  if (!userId || typeof userId !== "string") {
    throw new AdminRecoverableError("setUserTier: userId must be a non-empty string");
  }
  if (!isUserTier(tier)) {
    throw new AdminRecoverableError(`setUserTier: invalid tier "${String(tier)}"`, { tier });
  }

  if (activeBackend() === "postgres") {
    return pgUpsert(userId, tier, expiresAt, options);
  }
  return jsonlUpsert(userId, tier, expiresAt, options);
}

/**
 * List all user-tier records. Used by admin tooling / billing reports.
 * Not wired into any public endpoint.
 */
export async function listUserTiers(): Promise<UserTierRecord[]> {
  if (activeBackend() === "postgres") {
    try {
      return await pgList();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[user-tiers] postgres list failed — JSONL fallback", {
        error: message.slice(0, 200),
      });
    }
  }
  const index = await getIndexCounted();
  return Array.from(index.values());
}

// ---------------------------------------------------------------------------
// Test-only hooks — never call from production code.
// ---------------------------------------------------------------------------

export function __resetUserTierCacheForTests(): void {
  _cache = null;
  _diskReadCount = 0;
  pgCache.clear();
  jsonlReadThroughDone.clear();
}

export function __getUserTierDiskReadCountForTests(): number {
  return _diskReadCount;
}
