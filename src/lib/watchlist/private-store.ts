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
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the private watchlist for `userId`, or null if none exists.
 *
 * Cross-user reads are impossible: we key on userId exactly, with no
 * fallback to "return something when the user has no entry". The route
 * layer translates null → 200 with `entry: null` (or 404 — route's
 * choice; this function is agnostic).
 */
export async function getPrivateWatchlist(
  userId: string,
): Promise<PrivateWatchlistEntry | null> {
  if (!userId || typeof userId !== "string") return null;
  const entries = await readAllEntries();
  return entries.get(userId) ?? null;
}

/**
 * Upsert the watchlist for `userId`. Returns the entry as persisted
 * (post-normalization). The input list is deduped, lowercased, sorted,
 * and capped at MAX_PRIVATE_WATCHLIST_REPOS.
 *
 * Idempotent: writing the same set twice produces the same persisted
 * record (modulo `updatedAt`).
 */
export async function setPrivateWatchlist(
  userId: string,
  fullNames: readonly string[],
): Promise<PrivateWatchlistEntry> {
  if (!userId || typeof userId !== "string") {
    throw new Error("setPrivateWatchlist: userId is required");
  }

  const { valid } = normalizeFullNames(fullNames);
  const capped = valid.slice(0, MAX_PRIVATE_WATCHLIST_REPOS);
  const entry: PrivateWatchlistEntry = {
    userId,
    repoFullNames: capped,
    updatedAt: new Date().toISOString(),
  };

  // Serialize access to the file so concurrent PUTs from two tabs don't
  // race on read-then-write. Lock key is the resolved path.
  return withFileLock(storePath(), async () => {
    await ensureDataDir();
    const entries = await readAllEntries();
    entries.set(userId, entry);
    // Deterministic write order — sort by userId ascending. Keeps diffs
    // small when inspecting the JSONL in a code review.
    const rows = [...entries.values()].sort((a, b) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
    );
    await writeJsonlFile<PrivateWatchlistEntry>(PRIVATE_WATCHLIST_FILE, rows);
    return entry;
  });
}

/**
 * Remove the watchlist entry for `userId`. No-op when none exists.
 */
export async function deletePrivateWatchlist(userId: string): Promise<void> {
  if (!userId || typeof userId !== "string") return;
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
