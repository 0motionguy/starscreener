// StarScreener Pipeline — file-backed JSONL persistence utilities
//
// Provides small, dependency-free helpers for atomic JSONL I/O used by the
// in-memory store classes. Each store serializes as a flat list of records
// (one JSON document per line) into a file under `DATA_DIR`. Writes go to a
// temp sibling then rename so no consumer ever observes a partial file.
//
// Persistence is on by default. Set `STARSCREENER_PERSIST=false` to disable
// (useful for tests or ephemeral previews). Override the directory with
// `STARSCREENER_DATA_DIR` (absolute path recommended).

import { promises as fs } from "node:fs";
import path from "node:path";

import { readEnv } from "@/lib/env-helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Directory where JSONL files live. Resolves `STARSCREENER_DATA_DIR` at call
 * time so a test that mutates the env after module-load (or a production
 * deploy that injects the env after the bundle is evaluated) still lands
 * I/O in the right place.
 *
 * The `DATA_DIR` constant captures the value at module-load for display /
 * diagnostic use (e.g., the `/api/pipeline/persist` route echoes it back to
 * operators). All internal path resolution goes through `currentDataDir()`
 * so behaviour respects runtime env changes.
 */
/**
 * Resolve the current JSONL data directory from the environment. Read at
 * every call site so a test that mutates `STARSCREENER_DATA_DIR` after
 * module-load (or a deploy that injects the env after the bundle is
 * evaluated) lands I/O in the right place.
 *
 * Safety (F-DATA-003, Phase 2 P-111):
 *   - Explicit `..` segments are rejected — that's the shape a traversal
 *     attack takes (either as `/absolute/../../tmp` or as `../foo`).
 *     `path.resolve()` would silently resolve them; we want a loud throw
 *     so a misconfigured env can't quietly redirect writes.
 *   - Relative paths are accepted and resolved against `process.cwd()`
 *     so `./.data` (the local-dev default in .env.local) keeps working.
 *   - When unset, we default to `<cwd>/.data`.
 */
export function currentDataDir(): string {
  const raw = readEnv("TRENDINGREPO_DATA_DIR", "STARSCREENER_DATA_DIR");
  if (!raw) return path.join(process.cwd(), ".data");

  // Block any path that tries to escape via a parent-directory segment —
  // on both POSIX and Windows separators. `path.resolve` would silently
  // flatten these; we want the throw so the intent is visible in logs.
  const segments = raw.split(/[/\\]/);
  if (segments.includes("..")) {
    throw new Error(
      `TRENDINGREPO_DATA_DIR / STARSCREENER_DATA_DIR must not contain '..' segments (got ${JSON.stringify(raw)})`,
    );
  }

  // `path.resolve` makes relative paths absolute (rooted at cwd) and is
  // a no-op on already-absolute paths. Safe after the `..` guard above.
  return path.resolve(raw);
}

// Removed `export const DATA_DIR = currentDataDir()`: eager resolution at
// module-load made data-dir-validation.test.ts:53 unable to catch the
// "throw on '..'" — the dynamic re-import inside `reload()` would reject
// before `assert.throws()` could run. Consumers wanting the dir should
// call `currentDataDir()` directly.

/** Canonical filename for each store. Kept as a const-object for type safety. */
export const FILES = {
  repos: "repos.jsonl",
  snapshots: "snapshots.jsonl",
  scores: "scores.jsonl",
  categories: "categories.jsonl",
  reasons: "reasons.jsonl",
  mentions: "mentions.jsonl",
  mentionAggregates: "mention-aggregates.jsonl",
  alertRules: "alert-rules.jsonl",
  alertEvents: "alert-events.jsonl",
} as const;

export type StoreFileKey = keyof typeof FILES;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve a bare filename against DATA_DIR (or return absolute paths as-is). */
function resolvePath(filename: string): string {
  if (path.isAbsolute(filename)) return filename;
  return path.join(currentDataDir(), filename);
}

/** Node "file does not exist" error-type guard (works without `any`). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** mkdir -p on DATA_DIR. Safe to call many times. */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(currentDataDir(), { recursive: true });
}

/**
 * Read a JSONL file under DATA_DIR and return its records.
 *
 * - Missing file → `[]`
 * - Malformed / blank lines are skipped with a `console.warn`
 */
export async function readJsonlFile<T>(filename: string): Promise<T[]> {
  const filePath = resolvePath(filename);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const out: T[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[file-persistence] skipping malformed JSONL line ${i + 1} in ${filename}: ${message}`,
      );
    }
  }
  return out;
}

/**
 * Atomically write `items` as JSONL.
 *
 * Writes to `${filename}.tmp` first then renames — the canonical filename
 * never contains a half-written buffer. An empty array still produces a
 * zero-byte file (so a caller can distinguish "persisted but empty" from
 * "never persisted").
 */
export async function writeJsonlFile<T>(
  filename: string,
  items: T[],
): Promise<void> {
  await ensureDataDir();
  const filePath = resolvePath(filename);
  const tmpPath = `${filePath}.tmp`;

  const body = items.length === 0 ? "" : items.map((it) => JSON.stringify(it)).join("\n") + "\n";
  await fs.writeFile(tmpPath, body, "utf8");
  await fs.rename(tmpPath, filePath);
}

/** Append a single record to a JSONL file, creating the file if needed. */
export async function appendJsonlFile<T>(
  filename: string,
  item: T,
): Promise<void> {
  await ensureDataDir();
  const filePath = resolvePath(filename);
  await fs.appendFile(filePath, JSON.stringify(item) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Per-file async serialization
// ---------------------------------------------------------------------------
//
// Within a single Node process, in-flight async operations on the same JSONL
// file race because read-then-write is not atomic at the JS-event-loop level:
// two concurrent submitRevenueToQueue() calls can both read the same snapshot,
// both fail the duplicate check, and both append. Likewise, an append can
// land *between* a read and the rewriting writeJsonlFile() call inside an
// approve/reject path, silently dropping the appended row.
//
// `withFileLock` serializes async operations per (resolved) file path. It is
// process-local — sufficient because the JSONL writers all live behind the
// Next.js server which runs in one process per region. Cross-process races
// are out of scope for this storage layer; if we ever shard writers we'd
// move to a real lockfile or a database.

const fileLocks = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(
  filename: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = resolvePath(filename);
  const previous = fileLocks.get(key) ?? Promise.resolve();
  // Chain both branches to fn so a rejected predecessor still lets the next
  // holder run. The stored chain promise swallows rejection so the lock map
  // never keeps a rejected-only promise that would poison new chains.
  const next = previous.then(fn, fn);
  const chain: Promise<unknown> = next.catch(() => undefined);
  fileLocks.set(key, chain);
  try {
    return await next;
  } finally {
    // Best-effort cleanup so the map doesn't grow unbounded across distinct
    // filenames over the life of the process. If a newer holder has already
    // chained on, leave its promise in place.
    if (fileLocks.get(key) === chain) {
      fileLocks.delete(key);
    }
  }
}

/**
 * Atomic read-modify-write for a JSONL file. The mutator sees the current
 * snapshot and returns the next one. Runs under `withFileLock(filename)` so
 * concurrent callers serialize and never observe a torn intermediate state.
 */
export async function mutateJsonlFile<T>(
  filename: string,
  mutator: (current: T[]) => T[] | Promise<T[]>,
): Promise<T[]> {
  return withFileLock(filename, async () => {
    const current = await readJsonlFile<T>(filename);
    const next = await mutator(current);
    await writeJsonlFile(filename, next);
    return next;
  });
}

/**
 * Whether persistence is currently enabled.
 *
 * Defaults to `true`. Set `TRENDINGREPO_PERSIST=false` (legacy:
 * `STARSCREENER_PERSIST=false`) to disable — everything else (including
 * unset) counts as enabled.
 */
export function isPersistenceEnabled(): boolean {
  const v = readEnv("TRENDINGREPO_PERSIST", "STARSCREENER_PERSIST");
  if (v === undefined) return true;
  return v.toLowerCase() !== "false";
}
