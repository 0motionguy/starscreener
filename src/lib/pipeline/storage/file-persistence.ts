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
 *   - When `STARSCREENER_DATA_DIR` is set, it must be an absolute path
 *     and must resolve to its own normalized form (no `..` segments that
 *     escape). Violations throw at call time so a misconfigured env var
 *     cannot silently redirect writes to arbitrary filesystem locations.
 *   - When unset, we default to `<cwd>/.data` which is always safe because
 *     `cwd()` is absolute.
 */
export function currentDataDir(): string {
  const raw = process.env.STARSCREENER_DATA_DIR;
  if (!raw) return path.join(process.cwd(), ".data");

  if (!path.isAbsolute(raw)) {
    throw new Error(
      `STARSCREENER_DATA_DIR must be an absolute path (got ${JSON.stringify(raw)})`,
    );
  }
  // Normalize resolves `.` and `..` segments. If the result differs from the
  // raw input, the path was non-canonical (e.g. contained traversal) and
  // we reject rather than silently redirecting writes somewhere unexpected.
  const normalized = path.normalize(raw);
  if (normalized !== raw) {
    throw new Error(
      `STARSCREENER_DATA_DIR contains non-canonical segments (got ${JSON.stringify(raw)}, normalized ${JSON.stringify(normalized)})`,
    );
  }
  return normalized;
}

/**
 * Directory where JSONL files live. Captured at module-load for display /
 * diagnostic use (e.g., `/api/pipeline/persist` echoes it to operators);
 * all internal I/O resolves `currentDataDir()` at call time so runtime env
 * changes are honoured.
 */
export const DATA_DIR: string = currentDataDir();

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

/**
 * Whether persistence is currently enabled.
 *
 * Defaults to `true`. Set `STARSCREENER_PERSIST=false` (exact string) to
 * disable — everything else (including unset) counts as enabled.
 */
export function isPersistenceEnabled(): boolean {
  const v = process.env.STARSCREENER_PERSIST;
  if (v === undefined) return true;
  return v.toLowerCase() !== "false";
}
