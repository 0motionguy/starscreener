// AISO scan persistence — write scan results into data/repo-profiles.json.
//
// Wave 5 shipped `/api/cron/aiso-drain` which pops rows off the rescan queue
// and calls `getAisoToolsScan(url)`. The scanner only caches results
// in-process (memoryCache, 6h TTL). After a cold restart, results are lost
// because the canonical store `data/repo-profiles.json` is not updated.
//
// This module closes that gap. `persistAisoScan(fullName, scan)` merges a
// single scan result into the committed profile file under the same
// per-file lock used by the rest of the persistence layer, so concurrent
// drain workers (or a drain worker overlapping a `scripts/enrich-repo-
// profiles.mjs` run) can't clobber each other.
//
// Write strategy matches `scripts/enrich-repo-profiles.mjs`:
//   - Read the JSON file ({ generatedAt, version, selection, profiles:[] })
//   - Upsert the profile by `fullName` (case-insensitive match)
//   - Stamp `lastProfiledAt` = now
//   - Set status to "scanned" on a successful scan, "scan_failed" if null
//   - Atomic write via `${file}.tmp` then rename
//
// The lock is keyed on the absolute profile-file path so tests that redirect
// the path via `STARSCREENER_REPO_PROFILES_PATH` serialize against that same
// path, not against the default.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { AisoToolsScan } from "./aiso-tools";
import { getDataStore } from "./data-store";
import {
  withFileLock,
} from "./pipeline/storage/file-persistence";
import type {
  RepoProfile,
  RepoProfileStatus,
  RepoProfilesFile,
} from "./repo-profiles";

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const DEFAULT_RELATIVE_PATH = "data/repo-profiles.json";
const PATH_ENV = "STARSCREENER_REPO_PROFILES_PATH";

/**
 * Absolute path to `repo-profiles.json`. Resolves `STARSCREENER_REPO_PROFILES_PATH`
 * at every call so a test that mutates the env after module-load still
 * lands I/O in the right place. Defaults to `<cwd>/data/repo-profiles.json`
 * which matches `scripts/enrich-repo-profiles.mjs` and `src/lib/repo-profiles.ts`.
 */
export function repoProfilesPath(): string {
  const raw = process.env[PATH_ENV];
  if (raw && raw.trim().length > 0) {
    const trimmed = raw.trim();
    return path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(process.cwd(), trimmed);
  }
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_PATH);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

const EMPTY_FILE: RepoProfilesFile = {
  generatedAt: null,
  version: 1,
  selection: {
    source: "not-run",
    limit: 0,
    maxScans: 0,
    scanned: 0,
    queued: 0,
    noWebsite: 0,
    failed: 0,
  },
  profiles: [],
};

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function readFileSafe(filePath: string): Promise<RepoProfilesFile> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { ...EMPTY_FILE, profiles: [] };
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt file — don't destroy it. Throw so caller knows something's off.
    throw new Error(
      `[aiso-persist] ${filePath} is not valid JSON; refusing to overwrite`,
    );
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(
      `[aiso-persist] ${filePath} must be a JSON object; refusing to overwrite`,
    );
  }

  const obj = parsed as Partial<RepoProfilesFile>;
  return {
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : null,
    version: typeof obj.version === "number" ? obj.version : 1,
    selection: {
      ...EMPTY_FILE.selection,
      ...(obj.selection ?? {}),
    },
    profiles: Array.isArray(obj.profiles) ? (obj.profiles as RepoProfile[]) : [],
  };
}

async function writeFileAtomic(
  filePath: string,
  body: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, body, "utf8");
  await fs.rename(tmpPath, filePath);
}

function serialize(file: RepoProfilesFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Profile merge
// ---------------------------------------------------------------------------

function keyOf(fullName: string): string {
  return fullName.toLowerCase();
}

function findProfileIndex(
  profiles: RepoProfile[],
  fullName: string,
): number {
  const target = keyOf(fullName);
  for (let i = 0; i < profiles.length; i++) {
    if (keyOf(profiles[i].fullName) === target) return i;
  }
  return -1;
}

function makeMinimalProfile(
  fullName: string,
  scan: AisoToolsScan | null,
  now: string,
  status: RepoProfileStatus,
): RepoProfile {
  return {
    fullName,
    rank: null,
    selectedFrom: "aiso_drain",
    websiteUrl: scan?.url ?? null,
    websiteSource: null,
    status,
    lastProfiledAt: now,
    nextScanAfter: null,
    surfaces: {
      githubUrl: `https://github.com/${fullName}`,
      docsUrl: null,
      npmPackages: [],
      productHuntLaunchId: null,
    },
    aisoScan: scan,
    error: null,
  };
}

/**
 * Decide the new profile status from a scan result.
 *
 * - `null` → `scan_failed` (scanner was invoked but returned nothing useful)
 * - `{ status: "completed" }` → `scanned`
 * - `{ status: "failed" }` → `scan_failed`
 * - anything else (queued/running) → `scan_running` (preserves the in-flight
 *   distinction that `enrich-repo-profiles.mjs` uses)
 */
function resolveStatus(scan: AisoToolsScan | null): RepoProfileStatus {
  if (!scan) return "scan_failed";
  if (scan.status === "completed") return "scanned";
  if (scan.status === "failed") return "scan_failed";
  return "scan_running";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge an AISO scan result into `data/repo-profiles.json`. Idempotent —
 * running twice with the same scan produces byte-identical files (the
 * `lastProfiledAt` timestamp is the one the caller's clock freezes; if the
 * caller re-invokes with a fresh clock, the timestamp advances, which is
 * correct: the profile was re-stamped).
 *
 * Locking: uses the shared `withFileLock` keyed on the absolute profile
 * path, so a concurrent persist on the same path serializes (no lost
 * updates) while a persist against a different path (e.g. during a test
 * that redirects via env var) does not block.
 *
 * Throws if the file exists but is not parseable JSON, or if the underlying
 * write fails. Callers should treat throws as hard failures (the drain
 * route counts the row as failed and leaves it on the queue).
 */
export async function persistAisoScan(
  fullName: string,
  scan: AisoToolsScan | null,
): Promise<void> {
  if (!fullName || !fullName.includes("/")) {
    throw new Error(
      `[aiso-persist] refusing to persist without a valid fullName: ${JSON.stringify(fullName)}`,
    );
  }

  const filePath = repoProfilesPath();
  const now = new Date().toISOString();
  const nextStatus = resolveStatus(scan);

  let nextSnapshot: RepoProfilesFile | null = null;
  await withFileLock(filePath, async () => {
    const current = await readFileSafe(filePath);
    const idx = findProfileIndex(current.profiles, fullName);
    const profiles = current.profiles.slice();

    if (idx === -1) {
      profiles.push(makeMinimalProfile(fullName, scan, now, nextStatus));
    } else {
      const existing = profiles[idx];
      profiles[idx] = {
        ...existing,
        // Preserve existing fields (rank, selectedFrom, surfaces,
        // websiteUrl, websiteSource, etc.) and overlay the scan update.
        websiteUrl: scan?.url ?? existing.websiteUrl,
        status: nextStatus,
        lastProfiledAt: now,
        aisoScan: scan,
        // Clear the error on a successful scan. Preserve it when we still
        // don't have a completed scan so operators can see the last
        // failure reason after a retry that also failed.
        error: nextStatus === "scanned" ? null : existing.error,
      };
    }

    const next: RepoProfilesFile = {
      ...current,
      profiles,
    };

    await writeFileAtomic(filePath, serialize(next));
    nextSnapshot = next;
  });

  // Best-effort mirror of the merged snapshot to the data-store. Runs OUTSIDE
  // the file lock so a slow Redis write doesn't block concurrent persisters
  // on the same path, but uses the snapshot we just wrote so live readers
  // see the new scan immediately on the next refresh tick. Failures are
  // swallowed because the file is already the durable record.
  if (nextSnapshot) {
    try {
      await getDataStore().write("repo-profiles", nextSnapshot);
    } catch (err) {
      // The data-store throws "has no destination" when Redis env vars
      // aren't set and mirrorToFile=false — that's the expected dev/test
      // posture, not an error worth shouting about.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("has no destination")) {
        console.warn(
          "[aiso-persist] data-store mirror failed (file write succeeded):",
          message,
        );
      }
    }
  }
}

/**
 * Test-helper: read the persisted scan for `fullName`, or null if the
 * profile doesn't exist or has no scan attached. Not cached — goes to
 * disk every call so tests see fresh writes.
 */
export async function readAisoScanFromProfile(
  fullName: string,
): Promise<AisoToolsScan | null> {
  const filePath = repoProfilesPath();
  const file = await readFileSafe(filePath);
  const idx = findProfileIndex(file.profiles, fullName);
  if (idx === -1) return null;
  return file.profiles[idx].aisoScan ?? null;
}
