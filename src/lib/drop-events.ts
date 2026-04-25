// Drop-repo events log.
//
// When the public site's "Drop repo" button calls submitRepoToQueue
// (src/lib/repo-submissions.ts), one of three outcomes happens:
//   - "already_tracked" — silent today, no file write at all
//   - "duplicate"       — the submission already exists in the queue
//   - "created"         — a new submission row is appended
//
// This module gives the operator visibility into all three. It's a
// fire-and-forget JSONL append per click into `.data/drop-events.jsonl`.
// All writes go through `withFileLock` against the filename so concurrent
// clicks can't tear the file. Read/summarise helpers power the admin tile.
//
// Pattern mirrors src/lib/aiso-queue.ts: file-lock for writes, ENOENT →
// empty list on reads, malformed lines warned + skipped.

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  currentDataDir,
  withFileLock,
} from "./pipeline/storage/file-persistence";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface DropEvent {
  id: string;
  kind: "already_tracked" | "duplicate" | "created";
  fullName: string;
  at: string;
}

export interface DropEventSummary {
  alreadyTracked: number;
  duplicate: number;
  created: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const DROP_EVENTS_FILENAME = "drop-events.jsonl";

function dropEventsLocation(): string {
  return path.join(currentDataDir(), DROP_EVENTS_FILENAME);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDropEventKind(value: unknown): value is DropEvent["kind"] {
  return value === "already_tracked" || value === "duplicate" || value === "created";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a single drop event row to the JSONL log. Runs under
 * `withFileLock` against the filename so concurrent clicks serialize.
 */
export async function recordDropEvent(input: {
  kind: DropEvent["kind"];
  fullName: string;
}): Promise<void> {
  const event: DropEvent = {
    id: randomUUID(),
    kind: input.kind,
    fullName: input.fullName,
    at: new Date().toISOString(),
  };

  await withFileLock(DROP_EVENTS_FILENAME, async () => {
    const filePath = dropEventsLocation();
    await fs.appendFile(filePath, JSON.stringify(event) + "\n", "utf8");
  });
}

/**
 * Read every drop event in the last `sinceMs` milliseconds. Missing
 * file → []. Blank lines and malformed JSON are skipped with a warn so
 * one bad row can never poison the read.
 */
export async function readRecentDropEvents(sinceMs: number): Promise<DropEvent[]> {
  const filePath = dropEventsLocation();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const cutoff = Date.now() - sinceMs;
  const out: DropEvent[] = [];
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
        `[drop-events] skipping malformed JSONL line ${i + 1}: ${message}`,
      );
      continue;
    }

    if (!isRecord(parsed)) {
      console.warn(`[drop-events] skipping non-object JSONL line ${i + 1}`);
      continue;
    }

    const id = parsed.id;
    const kind = parsed.kind;
    const fullName = parsed.fullName;
    const at = parsed.at;

    if (
      typeof id !== "string" ||
      typeof fullName !== "string" ||
      typeof at !== "string" ||
      !isDropEventKind(kind)
    ) {
      console.warn(`[drop-events] skipping row with bad shape on line ${i + 1}`);
      continue;
    }

    const ts = Date.parse(at);
    if (Number.isNaN(ts) || ts < cutoff) continue;

    out.push({ id, kind, fullName, at });
  }
  return out;
}

/** Tally a list of drop events into per-kind counts plus a total. */
export function summarizeDropEvents(events: DropEvent[]): DropEventSummary {
  let alreadyTracked = 0;
  let duplicate = 0;
  let created = 0;
  for (const event of events) {
    if (event.kind === "already_tracked") alreadyTracked += 1;
    else if (event.kind === "duplicate") duplicate += 1;
    else if (event.kind === "created") created += 1;
  }
  return {
    alreadyTracked,
    duplicate,
    created,
    total: alreadyTracked + duplicate + created,
  };
}
