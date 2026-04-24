// StarScreener — userId → tier mapping.
//
// Storage: a single JSONL file (.data/user-tiers.jsonl). One row per user,
// with upsert semantics — when the same userId is written twice we keep
// the last record. Matches the same pattern used by other per-user stores
// (alerts, reactions, ideas) but with an explicit dedupe on userId so we
// never ship a duplicate for the same caller even if a race lets two
// writes through.
//
// Caching: an mtime+size cache fronts reads. The entitlements helper runs
// on every authenticated request — hitting disk each time would dominate
// the request budget. Cache invalidates as soon as the file is rewritten
// (via mtime/size change), so a `setUserTier(...)` write is visible to
// the next `getUserTier(...)` read within the same process.
//
// Concurrency: all mutations go through `mutateJsonlFile` (inside
// file-persistence.ts) so two concurrent upserts don't tear the file or
// both believe they were "first".
//
// CLIENT BOUNDARY: this module uses node:fs. Client components MUST NOT
// import from here — use the pure shapes in `./tiers` instead.

import { statSync } from "node:fs";
import path from "node:path";

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
   * through Stripe will populate this from `current_period_end` when the
   * parallel wave-12 agent lands.
   */
  expiresAt: string | null;
  /** Stripe customer id — populated once the Stripe wave lands. */
  stripeCustomerId?: string | null;
  /** Stripe subscription id — populated once the Stripe wave lands. */
  stripeSubscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// mtime-cached in-memory index
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
 * Read-through helper. Returns a Map that MUST NOT be mutated by callers
 * (it's shared with the cache). Tests can call `__resetUserTierCacheForTests`
 * to force a reload after touching the file directly.
 */
async function getIndex(): Promise<Map<string, UserTierRecord>> {
  const { mtimeMs, size } = statSignature();
  if (_cache && _cache.mtimeMs === mtimeMs && _cache.size === size) {
    return _cache.byUserId;
  }
  const byUserId = await loadIndex();
  _cache = { mtimeMs, size, byUserId };
  return byUserId;
}

/**
 * Telemetry hook for tests — lets the entitlements test prove the cache
 * actually skips disk on repeat reads.
 */
let _diskReadCount = 0;
/** Increment counter inside `loadIndex`. Exposed for test-only assertions. */
function incrementDiskReadCounter(): void {
  _diskReadCount += 1;
}
async function loadIndexCounted(): Promise<Map<string, UserTierRecord>> {
  incrementDiskReadCounter();
  return loadIndex();
}

// Re-wire getIndex to count disk reads. We keep the function identity stable.
async function getIndexCounted(): Promise<Map<string, UserTierRecord>> {
  const { mtimeMs, size } = statSignature();
  if (_cache && _cache.mtimeMs === mtimeMs && _cache.size === size) {
    return _cache.byUserId;
  }
  const byUserId = await loadIndexCounted();
  _cache = { mtimeMs, size, byUserId };
  return byUserId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the tier key for `userId`. Returns `"free"` if the user has no
 * record or the record has expired. Never throws — tier lookup is on the
 * hot path for every authenticated request.
 */
export async function getUserTier(userId: string | null | undefined): Promise<UserTier> {
  if (!userId || typeof userId !== "string" || userId.length === 0) {
    return "free";
  }
  const index = await getIndexCounted();
  const record = index.get(userId);
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
  const index = await getIndexCounted();
  return index.get(userId) ?? null;
}

/**
 * Upsert a user-tier record. Writes a new row under the per-file lock so
 * two concurrent calls for the same userId don't produce two surviving
 * rows after the next read.
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
    throw new Error("setUserTier: userId must be a non-empty string");
  }
  if (!isUserTier(tier)) {
    throw new Error(`setUserTier: invalid tier "${String(tier)}"`);
  }

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

/**
 * List all user-tier records. Used by admin tooling / billing reports.
 * Not wired into any public endpoint.
 */
export async function listUserTiers(): Promise<UserTierRecord[]> {
  const index = await getIndexCounted();
  return Array.from(index.values());
}

// ---------------------------------------------------------------------------
// Test-only hooks — never call from production code.
// ---------------------------------------------------------------------------

export function __resetUserTierCacheForTests(): void {
  _cache = null;
  _diskReadCount = 0;
}

export function __getUserTierDiskReadCountForTests(): number {
  return _diskReadCount;
}
