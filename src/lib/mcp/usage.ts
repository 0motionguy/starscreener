// MCP usage metering — append-only JSONL store.
//
// Records a single row per tool call made against the MCP server. Rows are
// appended to `.data/mcp-usage.jsonl` under the shared `withFileLock` helper
// so concurrent writes on the same file path serialize at the event-loop
// level (see file-persistence.ts for the scope + caveats).
//
// The write path is BEST EFFORT — every exported mutator swallows ENOENT /
// malformed lines with a console.warn rather than throwing. Metering must
// never cause an MCP tool call to fail; if the JSONL store is unreachable
// we prefer silent data loss to a user-facing 500.
//
// Read helpers (`listUsageForUser`, `summarizeUsage`) filter by userId and
// optional ISO month prefix (`"YYYY-MM"`). The filter happens in-process
// because the file is tiny (tens of thousands of rows at most before the
// rolling-12-month rotation cron drops old entries — see
// `/api/cron/mcp/rotate-usage`).
//
// SECURITY:
//   - The user token itself is NEVER persisted. Only the resolved userId
//     reaches this module.
//   - errorMessage is truncated to 200 chars by the recorder before write.
//   - tokenUsed is a placeholder field (always 0 today) until real cost
//     accounting lands; the column is carried so we never need to
//     backfill the JSONL shape.

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  currentDataDir,
  withFileLock,
} from "../pipeline/storage/file-persistence";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface UsageRecord {
  /** Stable per-row id (UUID v4). Assigned on write. */
  id: string;
  /** Resolved userId from the caller's x-user-token. Never the token itself. */
  userId: string;
  /** Tool name (e.g. "repo_profile_full"). Free-form string, not validated. */
  tool: string;
  /** MCP JSON-RPC method. Always "tools/call" for now; field is carried for
   *  forward-compat with future methods (resources/read, prompts/get). */
  method: "tools/call";
  /** Count-only placeholder for cost accounting. 0 until real accounting lands. */
  tokenUsed: number;
  /** Wall-clock duration of the tool handler in ms. */
  durationMs: number;
  /** Terminal status. "timeout" is reserved for a future transport-level wrap. */
  status: "ok" | "error" | "timeout";
  /** Truncated (<=200 chars) error message on non-ok statuses. */
  errorMessage?: string;
  /** ISO-8601 UTC timestamp. Assigned on write. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

const USAGE_FILENAME = "mcp-usage.jsonl";

/** Absolute path to the active MCP usage log. */
export function usageLocation(): string {
  return path.join(currentDataDir(), USAGE_FILENAME);
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

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

const ERROR_MESSAGE_MAX = 200;

/**
 * Validate + normalize a caller-supplied record skeleton. Returns a fully
 * populated UsageRecord ready to serialize. Throws on violations of the
 * shape contract — callers (the `/api/mcp/record-call` handler) catch the
 * throw and return 400.
 */
function buildRecord(
  rec: Omit<UsageRecord, "id" | "timestamp">,
): UsageRecord {
  if (typeof rec.userId !== "string" || rec.userId.trim().length === 0) {
    throw new Error("userId must be a non-empty string");
  }
  if (typeof rec.tool !== "string" || rec.tool.trim().length === 0) {
    throw new Error("tool must be a non-empty string");
  }
  if (rec.method !== "tools/call") {
    throw new Error(`unsupported method: ${String(rec.method)}`);
  }
  if (
    typeof rec.tokenUsed !== "number" ||
    !Number.isFinite(rec.tokenUsed) ||
    rec.tokenUsed < 0
  ) {
    throw new Error("tokenUsed must be a non-negative finite number");
  }
  if (
    typeof rec.durationMs !== "number" ||
    !Number.isFinite(rec.durationMs) ||
    rec.durationMs < 0
  ) {
    throw new Error("durationMs must be a non-negative finite number");
  }
  if (rec.status !== "ok" && rec.status !== "error" && rec.status !== "timeout") {
    throw new Error(`status must be one of ok|error|timeout (got ${rec.status})`);
  }

  const truncatedError =
    typeof rec.errorMessage === "string" && rec.errorMessage.length > 0
      ? rec.errorMessage.slice(0, ERROR_MESSAGE_MAX)
      : undefined;

  return {
    id: randomUUID(),
    userId: rec.userId.trim(),
    tool: rec.tool.trim(),
    method: rec.method,
    tokenUsed: Math.floor(rec.tokenUsed),
    durationMs: Math.round(rec.durationMs),
    status: rec.status,
    ...(truncatedError !== undefined ? { errorMessage: truncatedError } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append a single row to the usage log. Runs under `withFileLock` against
 * the usage filename so concurrent callers never interleave partial lines.
 *
 * Best-effort: an ENOENT on the data dir is healed by creating the dir; any
 * other I/O error is logged + swallowed so metering can never fail an MCP
 * tool call.
 */
export async function recordUsage(
  rec: Omit<UsageRecord, "id" | "timestamp">,
): Promise<void> {
  const built = buildRecord(rec);
  const filePath = usageLocation();

  try {
    await withFileLock(USAGE_FILENAME, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, JSON.stringify(built) + "\n", "utf8");
    });
  } catch (err) {
    // LIB-14: bucket failure types so operators can tell "we're losing
    // metering because the disk is full" from "metering is throwing
    // because the data dir was deleted". All paths still swallow — the
    // contract is best-effort — but the log message + level reflects
    // severity so monitoring can alert on the hot ones.
    const errno = (err as NodeJS.ErrnoException | null)?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (errno === "ENOSPC") {
      // Disk full — operator should care. ENOSPC also implies follow-up
      // writes will fail until something is freed.
      console.error(
        `[mcp-usage] disk full (ENOSPC) — metering writes paused: ${message}`,
      );
    } else if (errno === "EACCES" || errno === "EPERM") {
      // Permissions — likely deploy/config bug. Loud but not fatal.
      console.error(
        `[mcp-usage] permission denied (${errno}) writing to ${filePath}: ${message}`,
      );
    } else if (errno === "ENOENT") {
      // Data dir disappeared between mkdir and appendFile (rotation race
      // or operator action). Single warn — next call's mkdir recreates.
      console.warn(
        `[mcp-usage] data dir vanished mid-write (ENOENT); next call will recreate: ${message}`,
      );
    } else {
      // Unknown — keep the original log line for compatibility.
      console.warn(
        `[mcp-usage] recordUsage failed (best-effort — dropped): ${message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Read / query
// ---------------------------------------------------------------------------

/**
 * Parse the usage log into a typed array. Missing file → []. Malformed
 * lines are skipped with a console.warn; we never throw from a read.
 */
async function readAll(): Promise<UsageRecord[]> {
  const filePath = usageLocation();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const out: UsageRecord[] = [];
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
        `[mcp-usage] skipping malformed JSONL line ${i + 1}: ${message}`,
      );
      continue;
    }

    if (!isRecord(parsed)) continue;
    const candidate = parsed as Partial<UsageRecord>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.userId !== "string" ||
      typeof candidate.tool !== "string" ||
      candidate.method !== "tools/call" ||
      typeof candidate.tokenUsed !== "number" ||
      typeof candidate.durationMs !== "number" ||
      (candidate.status !== "ok" &&
        candidate.status !== "error" &&
        candidate.status !== "timeout") ||
      typeof candidate.timestamp !== "string"
    ) {
      continue;
    }
    const rec: UsageRecord = {
      id: candidate.id,
      userId: candidate.userId,
      tool: candidate.tool,
      method: candidate.method,
      tokenUsed: candidate.tokenUsed,
      durationMs: candidate.durationMs,
      status: candidate.status,
      timestamp: candidate.timestamp,
      ...(typeof candidate.errorMessage === "string"
        ? { errorMessage: candidate.errorMessage }
        : {}),
    };
    out.push(rec);
  }
  return out;
}

/** ISO month-prefix guard — accepts `"2026-04"` shape only. */
function isValidMonthPrefix(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export async function listUsageForUser(
  userId: string,
  opts: { month?: string } = {},
): Promise<UsageRecord[]> {
  if (typeof userId !== "string" || userId.trim().length === 0) return [];
  const needle = userId.trim();
  const month = opts.month;
  if (month !== undefined && !isValidMonthPrefix(month)) {
    // Reject invalid month strings loudly — callers upstream should already
    // validate query strings, but we don't want a silent "no rows" from a
    // typo'd month.
    throw new Error(`month must look like "YYYY-MM", got: ${month}`);
  }

  const all = await readAll();
  return all.filter((r) => {
    if (r.userId !== needle) return false;
    if (month !== undefined && !r.timestamp.startsWith(month)) return false;
    return true;
  });
}

export interface UsageSummary {
  totalCalls: number;
  byTool: Record<string, number>;
  byDay: Record<string, number>;
  errors: number;
  totalDurationMs: number;
}

export async function summarizeUsage(
  userId: string,
  opts: { month?: string } = {},
): Promise<UsageSummary> {
  const rows = await listUsageForUser(userId, opts);
  const summary: UsageSummary = {
    totalCalls: rows.length,
    byTool: {},
    byDay: {},
    errors: 0,
    totalDurationMs: 0,
  };
  for (const row of rows) {
    summary.byTool[row.tool] = (summary.byTool[row.tool] ?? 0) + 1;
    const day = row.timestamp.slice(0, 10);
    summary.byDay[day] = (summary.byDay[day] ?? 0) + 1;
    if (row.status !== "ok") summary.errors += 1;
    summary.totalDurationMs += row.durationMs;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Rotation helper (used by cron/mcp/rotate-usage)
// ---------------------------------------------------------------------------

/**
 * Drop rows whose `timestamp` is older than `now - retentionMs`. Rewrites
 * the log atomically via tmp-rename under `withFileLock`. Rows that fail
 * parsing are PRESERVED as-is so we never silently drop data we don't
 * understand.
 *
 * Returns a summary with the counts so the cron handler can echo it back
 * to operators.
 */
export async function rotateUsage(opts: {
  retentionMs: number;
  now?: number;
}): Promise<{ removed: number; remaining: number }> {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.retentionMs;
  const filePath = usageLocation();

  return withFileLock(USAGE_FILENAME, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if (isEnoent(err)) return { removed: 0, remaining: 0 };
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
        // Preserve unparseable rows rather than dropping data we can't read.
        kept.push(line);
        continue;
      }

      if (!isRecord(parsed)) {
        kept.push(line);
        continue;
      }

      const ts = (parsed as { timestamp?: unknown }).timestamp;
      if (typeof ts !== "string") {
        kept.push(line);
        continue;
      }

      const ms = Date.parse(ts);
      if (!Number.isFinite(ms)) {
        // Unparseable timestamp — keep rather than drop.
        kept.push(line);
        continue;
      }

      if (ms < cutoff) {
        removed += 1;
        continue;
      }
      kept.push(line);
    }

    const body = kept.length === 0 ? "" : kept.join("\n") + "\n";
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, body, "utf8");
    await fs.rename(tmpPath, filePath);

    return { removed, remaining: kept.length };
  });
}
