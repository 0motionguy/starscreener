// StarScreener — server-side private watchlist store.
//
// Backs the /api/watchlist/private endpoint (Pro tier). Users' watchlists
// have historically lived in localStorage — fine for anonymous use, but
// insufficient for a paid feature that promises persistence across
// devices. This module adds the minimum durable storage needed to honor
// that promise.
//
// Storage: JSONL under `.data/private-watchlists.jsonl` (one record per
// user). Upsert semantics: the newest record for a userId wins; older
// lines are compacted away on write. Reads walk the file once and return
// the last entry for the requested userId.
//
// Why JSONL and not a DB: the rest of StarScreener's durable state lives
// in JSONL (alert-rules, mentions, reasons, etc.). Introducing a DB just
// for one per-user feature would double the deploy surface. If we later
// move to Postgres, the shape here maps 1:1 to a (user_id, full_names[],
// updated_at) row.
//
// Security:
//   - `userId` is derived from the request's auth cookie / token at the
//     route layer. This module trusts the caller to pass the authenticated
//     userId. Never wire a user-supplied `userId` query/body param through
//     to these functions without re-checking auth first.
//   - `getPrivateWatchlist(userId)` returns null (not another user's entry)
//     when the userId has no record. The route layer 404s on null — no
//     cross-user reads are possible.
//
// Caps:
//   - 1000 fullNames per user. Prevents a runaway client or malicious
//     caller from filling the JSONL with a 10MB watchlist. Legitimate
//     Pro users watch dozens, not thousands.

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  currentDataDir,
  ensureDataDir,
  readJsonlFile,
  withFileLock,
  writeJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrivateWatchlistEntry {
  /** Stable authenticated user id (see deriveUserId in lib/api/session.ts). */
  userId: string;
  /**
   * Deduped repo fullNames, lowercased, format `owner/name`. Sorted
   * deterministically by fullName asc so persisted entries round-trip
   * idempotently across reads/writes.
   */
  repoFullNames: string[];
  /** ISO-8601 UTC timestamp of the last write. */
  updatedAt: string;
}

/** Maximum fullNames a single private watchlist may contain. */
export const MAX_PRIVATE_WATCHLIST_REPOS = 1000;

/** JSONL filename used for private watchlist storage. */
export const PRIVATE_WATCHLIST_FILE = "private-watchlists.jsonl";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * RFC-ish rule for GitHub owner/name: non-empty, slash-separated, no
 * whitespace, no path traversal. We don't validate the full GitHub
 * grammar (GitHub enforces that upstream); we just reject obviously bad
 * input so the store doesn't grow with garbage.
 */
const FULLNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export function isValidRepoFullName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 200) return false;
  return FULLNAME_RE.test(value);
}

/**
 * Normalize a fullName list: lowercase, dedupe preserving first-seen
 * order, drop invalid entries. Returns the cleaned list plus any dropped
 * entries so the route layer can surface them in a 400 response when
 * validation fails.
 */
export function normalizeFullNames(
  input: readonly string[],
): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of input) {
    if (!isValidRepoFullName(raw)) {
      invalid.push(typeof raw === "string" ? raw : String(raw));
      continue;
    }
    const lowered = raw.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    valid.push(lowered);
  }
  // Deterministic order so two writes of the same set produce identical
  // JSONL — makes round-trip idempotence testable.
  valid.sort();
  return { valid, invalid };
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Full path to the JSONL file. Resolved at call time so tests that mutate
 *  STARSCREENER_DATA_DIR after module-load land in the right place. */
function storePath(): string {
  return path.join(currentDataDir(), PRIVATE_WATCHLIST_FILE);
}

/**
 * Type guard for persisted rows. Defensive because the JSONL file is a
 * trust boundary with prior versions of the schema; a broken row must
 * not crash the whole read.
 */
function isEntry(value: unknown): value is PrivateWatchlistEntry {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.userId !== "string" || o.userId.length === 0) return false;
  if (!Array.isArray(o.repoFullNames)) return false;
  if (!o.repoFullNames.every((v) => typeof v === "string")) return false;
  if (typeof o.updatedAt !== "string" || o.updatedAt.length === 0) return false;
  return true;
}

/**
 * Read the full JSONL and return the *latest* entry per userId.
 *
 * The file is append-friendly (writeJsonlFile rewrites atomically on each
 * setPrivateWatchlist call, so we always read the canonical form). We
 * still do a last-write-wins compaction in memory so a future `appendJsonlFile`
 * fast-path (if we ever add one) continues to work without data-loss.
 */
async function readAllEntries(): Promise<Map<string, PrivateWatchlistEntry>> {
  const rows = await readJsonlFile<unknown>(PRIVATE_WATCHLIST_FILE);
  const out = new Map<string, PrivateWatchlistEntry>();
  for (const row of rows) {
    if (!isEntry(row)) continue;
    out.set(row.userId, row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------
//
// Postgres (tr.watchlists / tr.watchlist_items, keyed by the profile UUID) is
// the durable primary for signed-in Pro users when DATABASE_URL is set. Two
// reasons the JSONL store was insufficient for a paid promise:
//   1. the Docker runner ships no persistent `.data` volume, so JSONL
//      watchlists evaporated on every redeploy;
//   2. the alert engine (event-router) reads the DB tables — with no writer
//      they were always empty, so paid-watchlist alert fan-out matched nothing.
//
// JSONL remains the dev/CI fallback AND a ONE-TIME legacy read-through source.
// The DB path only engages for canonical `c_<clerkUserId>` ids (Pro
// identities); anonymous `a_` / legacy `u_` / test ids stay on JSONL.

function postgresConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.trim().length > 0;
}

function shouldUseDbBackend(userId: string): boolean {
  return postgresConfigured() && userId.startsWith("c_");
}

// ---------------------------------------------------------------------------
// Public API (dispatches DB ↔ JSONL)
// ---------------------------------------------------------------------------

/**
 * Get the private watchlist for `userId`, or null if none exists. Cross-user
 * reads are impossible — we key on the authenticated id exactly.
 */
export async function getPrivateWatchlist(
  userId: string,
): Promise<PrivateWatchlistEntry | null> {
  if (!userId || typeof userId !== "string") return null;
  if (shouldUseDbBackend(userId)) return dbGetPrivateWatchlist(userId);
  return jsonlGetPrivateWatchlist(userId);
}

/**
 * Upsert the watchlist for `userId`. Deduped, lowercased, sorted, capped.
 * Idempotent: writing the same set twice yields the same persisted record
 * (modulo `updatedAt`).
 */
export async function setPrivateWatchlist(
  userId: string,
  fullNames: readonly string[],
): Promise<PrivateWatchlistEntry> {
  if (!userId || typeof userId !== "string") {
    throw new Error("setPrivateWatchlist: userId is required");
  }
  if (shouldUseDbBackend(userId)) return dbSetPrivateWatchlist(userId, fullNames);
  return jsonlSetPrivateWatchlist(userId, fullNames);
}

/** Remove the watchlist entry for `userId`. No-op when none exists. */
export async function deletePrivateWatchlist(userId: string): Promise<void> {
  if (!userId || typeof userId !== "string") return;
  if (shouldUseDbBackend(userId)) return dbDeletePrivateWatchlist(userId);
  return jsonlDeletePrivateWatchlist(userId);
}

// ---------------------------------------------------------------------------
// JSONL backend (dev/CI fallback + legacy read-through source)
// ---------------------------------------------------------------------------

async function jsonlGetPrivateWatchlist(
  userId: string,
): Promise<PrivateWatchlistEntry | null> {
  const entries = await readAllEntries();
  return entries.get(userId) ?? null;
}

async function jsonlSetPrivateWatchlist(
  userId: string,
  fullNames: readonly string[],
): Promise<PrivateWatchlistEntry> {
  const { valid } = normalizeFullNames(fullNames);
  const capped = valid.slice(0, MAX_PRIVATE_WATCHLIST_REPOS);
  const entry: PrivateWatchlistEntry = {
    userId,
    repoFullNames: capped,
    updatedAt: new Date().toISOString(),
  };
  // Serialize access so concurrent PUTs from two tabs don't race.
  return withFileLock(storePath(), async () => {
    await ensureDataDir();
    const entries = await readAllEntries();
    entries.set(userId, entry);
    const rows = [...entries.values()].sort((a, b) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
    );
    await writeJsonlFile<PrivateWatchlistEntry>(PRIVATE_WATCHLIST_FILE, rows);
    return entry;
  });
}

async function jsonlDeletePrivateWatchlist(userId: string): Promise<void> {
  await withFileLock(storePath(), async () => {
    await ensureDataDir();
    const entries = await readAllEntries();
    if (!entries.has(userId)) return;
    entries.delete(userId);
    const rows = [...entries.values()].sort((a, b) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
    );
    await writeJsonlFile<PrivateWatchlistEntry>(PRIVATE_WATCHLIST_FILE, rows);
  });
}

// ---------------------------------------------------------------------------
// Postgres backend (profile-UUID-keyed; primary for signed-in Pro users)
// ---------------------------------------------------------------------------

/** Map a canonical `c_<clerkUserId>` id to its (non-deleted) profile UUID. */
async function resolveProfileId(userId: string): Promise<string | null> {
  if (!userId.startsWith("c_")) return null;
  const clerkUserId = userId.slice(2);
  const [{ getDb }, { profiles }, { and, eq, isNull }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/profiles"),
    import("drizzle-orm"),
  ]);
  const rows = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.clerkUserId, clerkUserId), isNull(profiles.deletedAt)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The one default watchlist id for a profile — created on first write.
 *
 * Race-safe via the UNIQUE(profile_id) index: insert-on-conflict-do-nothing is
 * the atomic find-or-create, so two concurrent first-writes can't create two
 * "Default" watchlists (which would non-deterministically split a paid user's
 * list and lose entries). The conflict loser inserts nothing and both callers
 * then read the single surviving row.
 */
async function findOrCreateDefaultWatchlist(profileId: string): Promise<string> {
  const [{ getDb }, { watchlists }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/watchlists"),
    import("drizzle-orm"),
  ]);
  const db = getDb();
  const inserted = await db
    .insert(watchlists)
    .values({ profileId, name: "Default" })
    .onConflictDoNothing({ target: watchlists.profileId })
    .returning({ id: watchlists.id });
  if (inserted[0]) return inserted[0].id;
  const existing = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.profileId, profileId))
    .limit(1);
  if (existing[0]) return existing[0].id;
  throw new Error("findOrCreateDefaultWatchlist: no row after upsert");
}

async function dbGetPrivateWatchlist(
  userId: string,
): Promise<PrivateWatchlistEntry | null> {
  const profileId = await resolveProfileId(userId);
  // Not a resolvable Clerk profile → fall back to the legacy JSONL store.
  if (!profileId) return jsonlGetPrivateWatchlist(userId);

  const [{ getDb }, { watchlists, watchlistItems }, { asc, eq }] =
    await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema/watchlists"),
      import("drizzle-orm"),
    ]);
  const db = getDb();
  const wl = await db
    .select({ id: watchlists.id, updatedAt: watchlists.updatedAt })
    .from(watchlists)
    .where(eq(watchlists.profileId, profileId))
    .orderBy(asc(watchlists.createdAt))
    .limit(1);

  if (!wl[0]) {
    // One-time legacy read-through: migrate a JSONL watchlist into the DB so
    // the paid promise (cross-device + alert fan-out) is honored going forward.
    const legacy = await readLegacyJsonl(userId);
    if (legacy && legacy.repoFullNames.length > 0) {
      return dbSetPrivateWatchlist(userId, legacy.repoFullNames);
    }
    return null;
  }

  const items = await db
    .select({ repoFullName: watchlistItems.repoFullName })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, wl[0].id));
  const repoFullNames = items.map((i) => i.repoFullName).sort();
  return { userId, repoFullNames, updatedAt: wl[0].updatedAt.toISOString() };
}

async function dbSetPrivateWatchlist(
  userId: string,
  fullNames: readonly string[],
): Promise<PrivateWatchlistEntry> {
  const profileId = await resolveProfileId(userId);
  if (!profileId) return jsonlSetPrivateWatchlist(userId, fullNames);

  const { valid } = normalizeFullNames(fullNames);
  const capped = valid.slice(0, MAX_PRIVATE_WATCHLIST_REPOS);

  const [{ getDb }, { watchlists, watchlistItems }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/watchlists"),
    import("drizzle-orm"),
  ]);
  const db = getDb();
  const watchlistId = await findOrCreateDefaultWatchlist(profileId);

  // Transactional replace — delete then re-insert the normalized set so a
  // concurrent read never sees a half-written list.
  await db.transaction(async (tx) => {
    await tx.delete(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId));
    if (capped.length > 0) {
      await tx
        .insert(watchlistItems)
        .values(capped.map((repoFullName) => ({ watchlistId, repoFullName })));
    }
    await tx
      .update(watchlists)
      .set({ updatedAt: new Date() })
      .where(eq(watchlists.id, watchlistId));
  });

  return { userId, repoFullNames: capped, updatedAt: new Date().toISOString() };
}

async function dbDeletePrivateWatchlist(userId: string): Promise<void> {
  const profileId = await resolveProfileId(userId);
  if (!profileId) return jsonlDeletePrivateWatchlist(userId);

  const [{ getDb }, { watchlists, watchlistItems }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/watchlists"),
    import("drizzle-orm"),
  ]);
  const db = getDb();
  const wl = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.profileId, profileId))
    .limit(1);
  if (!wl[0]) return;
  await db.transaction(async (tx) => {
    await tx.delete(watchlistItems).where(eq(watchlistItems.watchlistId, wl[0].id));
    await tx.delete(watchlists).where(eq(watchlists.id, wl[0].id));
  });
}

/**
 * Legacy JSONL read-through source. Checks, in order:
 *   - the canonical `c_<clerkUserId>` key;
 *   - the raw Clerk id (`user_<id>`) that the historical load.ts bug wrote
 *     under before the identity fix.
 * Never guesses across unrelated users.
 */
async function readLegacyJsonl(
  userId: string,
): Promise<PrivateWatchlistEntry | null> {
  const entries = await readAllEntries();
  const canonical = entries.get(userId);
  if (canonical) return canonical;
  if (userId.startsWith("c_")) {
    const raw = entries.get(userId.slice(2));
    if (raw) return raw;
  }
  return null;
}

/** Test-only helper: blow away the whole file. */
export async function __resetPrivateWatchlistStoreForTests(): Promise<void> {
  const p = storePath();
  try {
    await fs.unlink(p);
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "ENOENT"
    ) {
      return;
    }
    throw err;
  }
}
