// AISO rescan queue — read/truncate helpers.
//
// The producer (src/app/api/repos/[owner]/[name]/aiso/route.ts) appends a
// single row per user-triggered rescan to `.data/aiso-rescan-queue.jsonl`:
//
//   { fullName, websiteUrl, requestedAt, requestIp, source }
//
// The producer row shape intentionally lacks a stable `id` — rows are
// content-hashed on read here to give the drain worker a deterministic
// handle for "processed" vs "pending" rows. Once the producer is updated
// to write an `id` at enqueue time (follow-up work — see the route header
// comment) this file will prefer the row-native id and fall back to the
// content hash.
//
// All truncation goes through `withFileLock` against the same resolved
// path the producer uses so concurrent appends aren't clobbered. This is
// process-local (same constraint as the rest of `file-persistence`); the
// producer lives in the same Next.js process so that's sufficient.
//
// `readQueue()` is mtime-tolerant: missing file → [], malformed line →
// skip with console.warn. Truncation mirrors `writeJsonlFile`'s atomic
// tmp-rename pattern via `withFileLock(... → writeJsonlFile(...))`.
//
// This module is dependency-free aside from file-persistence and the Node
// crypto module (for the content hash). It is safe to import from the
// cron route without pulling the scanner surface.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  currentDataDir,
  withFileLock,
} from "./pipeline/storage/file-persistence";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Rich, reader-side row with a stable `id`.
 *
 * The producer row is the raw JSONL object; `readQueue()` wraps each raw
 * row in this shape by deriving an id from either a row-native `id` field
 * (forward compatibility) or, failing that, a content hash over the
 * producer's four persistent fields (fullName + websiteUrl + requestedAt
 * + requestIp). The hash is stable for an unchanged row.
 */
export interface AisoQueueRow {
  /**
   * Stable identifier for this queue row. Derived from a row-native `id`
   * if the producer wrote one, otherwise a SHA-256 content hash so the
   * same row read twice produces the same id.
   */
  id: string;
  repoFullName: string;
  websiteUrl: string | null;
  queuedAt: string;
  requestIp?: string | null;
  /** Original source marker from the producer (e.g. "user-retry"). */
  source?: string | null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const QUEUE_FILENAME = "aiso-rescan-queue.jsonl";

/**
 * Shape the producer currently persists. Reader-side we tolerate extra
 * fields (including a future `id`) — a row that doesn't satisfy the
 * minimum `{ fullName, requestedAt }` contract is skipped with a warn.
 */
interface ProducerRow {
  id?: string;
  fullName?: unknown;
  websiteUrl?: unknown;
  requestedAt?: unknown;
  requestIp?: unknown;
  source?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Content-hash an unwrapped producer row. The four stable fields are
 * joined with a delimiter that cannot appear in any of them (NUL) so
 * `fullName="a\0", requestedAt="b"` can't collide with
 * `fullName="a", requestedAt="\0b"`.
 */
function contentHash(row: ProducerRow): string {
  const parts = [
    typeof row.fullName === "string" ? row.fullName : "",
    typeof row.websiteUrl === "string" ? row.websiteUrl : "",
    typeof row.requestedAt === "string" ? row.requestedAt : "",
    typeof row.requestIp === "string" ? row.requestIp : "",
  ].join("\0");
  return createHash("sha256").update(parts, "utf8").digest("hex").slice(0, 24);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Absolute path the producer + drain agree on. */
export function queueLocation(): string {
  return path.join(currentDataDir(), QUEUE_FILENAME);
}

/**
 * Read the queue as a list of reader-side rows. Missing file → []. Blank
 * lines are skipped silently; malformed JSON + rows missing the
 * required `fullName`/`requestedAt` contract are skipped with a warn so
 * one bad line can never poison the entire drain.
 */
export async function readQueue(): Promise<AisoQueueRow[]> {
  const filePath = queueLocation();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const out: AisoQueueRow[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
       
      console.warn(
        `[aiso-queue] skipping malformed JSONL line ${i + 1}: ${message}`,
      );
      continue;
    }

    if (!isRecord(parsed)) {
       
      console.warn(
        `[aiso-queue] skipping non-object JSONL line ${i + 1}`,
      );
      continue;
    }

    const row = parsed as ProducerRow;
    const fullName = asStringOrNull(row.fullName);
    const requestedAt = asStringOrNull(row.requestedAt);
    if (!fullName || !requestedAt) {
       
      console.warn(
        `[aiso-queue] skipping row with missing fullName/requestedAt on line ${i + 1}`,
      );
      continue;
    }

    const nativeId = asStringOrNull(row.id);
    out.push({
      id: nativeId ?? contentHash(row),
      repoFullName: fullName,
      websiteUrl: asStringOrNull(row.websiteUrl),
      queuedAt: requestedAt,
      requestIp: asStringOrNull(row.requestIp),
      source: asStringOrNull(row.source),
    });
  }
  return out;
}

/**
 * Truncate the queue by rewriting it with only the rows whose derived id
 * is NOT present in `processedIds`. Runs under `withFileLock` against
 * the queue filename so a producer append that lands concurrently is
 * serialized, not clobbered.
 *
 * Returns the count of rows that were removed. A row that can't be
 * parsed during truncation is preserved as-is — we never drop data we
 * don't understand.
 */
export async function truncateQueue(
  processedIds: Set<string>,
): Promise<number> {
  if (processedIds.size === 0) return 0;

  return withFileLock(QUEUE_FILENAME, async () => {
    const filePath = queueLocation();

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if (isEnoent(err)) return 0;
      throw err;
    }

    const kept: string[] = [];
    let removed = 0;
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (line.length === 0) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Preserve unparseable lines so we never lose data silently.
        kept.push(line);
        continue;
      }

      if (!isRecord(parsed)) {
        kept.push(line);
        continue;
      }

      const row = parsed as ProducerRow;
      const fullName = asStringOrNull(row.fullName);
      const requestedAt = asStringOrNull(row.requestedAt);
      if (!fullName || !requestedAt) {
        kept.push(line);
        continue;
      }

      const id = asStringOrNull(row.id) ?? contentHash(row);
      if (processedIds.has(id)) {
        removed += 1;
        continue;
      }
      kept.push(line);
    }

    const body = kept.length === 0 ? "" : kept.join("\n") + "\n";
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, body, "utf8");
    await fs.rename(tmpPath, filePath);

    return removed;
  });
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
