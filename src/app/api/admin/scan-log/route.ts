// Admin scan-log tail endpoint.
//
// GET /api/admin/scan-log?source=<id>&lines=20
//
// Returns the tail of the most recent log file under
// `.data/admin-scan-runs/` for the requested source. Companion to the
// "Scan Now" button on the admin dashboard, which spawns
// `scripts/scrape-<source>.mjs` as a detached process and writes
// stdout/stderr to `<source>-<ISO>.log`.
//
// Hard requirements:
//   - ADMIN_TOKEN auth (verifyAdminAuth + adminAuthFailureResponse).
//   - `source` MUST be validated against the hard-coded whitelist BEFORE
//     any path concatenation — otherwise a malicious caller could pass
//     `../../etc` and traverse out of `.data/admin-scan-runs/`.
//   - No caching (force-dynamic, no-store) — operators want fresh tails.
//
// The whitelist is intentionally duplicated here (not imported from the
// /api/admin/scan endpoint, which is being rebuilt in parallel). This
// keeps the endpoint usable independently of the scan endpoint's state.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// Mirrors the scan endpoint's source whitelist. Update both lists in
// lockstep when adding a new source.
const SOURCE_WHITELIST = [
  "reddit",
  "bluesky",
  "hackernews",
  "lobsters",
  "devto",
  "producthunt",
  "npm",
  "npm-daily",
  "trending",
  "funding-news",
] as const;

type ScanSource = (typeof SOURCE_WHITELIST)[number];

const DEFAULT_LINES = 20;
const MAX_LINES = 200;
const MIN_LINES = 1;

const RUNS_DIR = path.join(process.cwd(), ".data", "admin-scan-runs");

interface ScanLogResponse {
  ok: true;
  source: ScanSource;
  file: string | null;
  startedAt: string | null;
  sizeBytes: number;
  lines: string[];
  note?: string;
}

interface ErrorShape {
  ok: false;
  error: string;
  reason?: string;
}

function isWhitelistedSource(value: string): value is ScanSource {
  return (SOURCE_WHITELIST as readonly string[]).includes(value);
}

/**
 * Parse the `lines` query param. Clamped to [MIN_LINES, MAX_LINES]; falls
 * back to DEFAULT_LINES on missing/non-numeric input.
 */
function parseLinesParam(raw: string | null): number {
  if (!raw) return DEFAULT_LINES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LINES;
  if (n < MIN_LINES) return MIN_LINES;
  if (n > MAX_LINES) return MAX_LINES;
  return n;
}

/**
 * Reverse the timestamp format used by the scan endpoint when naming logs:
 *
 *   `${source}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`
 *
 * e.g. `funding-news-2026-04-25T03-15-17-813Z.log`
 *           → ISO `2026-04-25T03:15:17.813Z`
 *
 * The input contains the source prefix; we strip it first, then walk the
 * remaining `YYYY-MM-DDTHH-MM-SS-mmmZ` and re-insert `:` and `.` at the
 * positions the encoder mangled. Returns null on any shape mismatch.
 */
function parseStartedAtFromFilename(
  filename: string,
  source: ScanSource,
): string | null {
  const prefix = `${source}-`;
  if (!filename.startsWith(prefix) || !filename.endsWith(".log")) return null;
  const stamp = filename.slice(prefix.length, -".log".length);
  // Expected: YYYY-MM-DDTHH-MM-SS-mmmZ  (10 char date, T, 8 char hms-with-dashes, dash, 3 ms digits, Z)
  // Convert HH-MM-SS-mmm → HH:MM:SS.mmm
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(
    stamp,
  );
  if (!match) return null;
  const [, date, hh, mm, ss, ms] = match;
  const iso = `${date}T${hh}:${mm}:${ss}.${ms}Z`;
  // Sanity check — Date.parse round-trips a valid ISO string.
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return iso;
}

/**
 * Find newest `<source>-*.log` in RUNS_DIR by mtime. Returns null if the
 * directory is missing or no matching file exists. Bubbles up unexpected
 * errors so the GET handler can 500.
 */
async function findNewestLog(
  source: ScanSource,
): Promise<{ name: string; fullPath: string; sizeBytes: number } | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(RUNS_DIR);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }

  const prefix = `${source}-`;
  const candidates = entries.filter(
    (name) => name.startsWith(prefix) && name.endsWith(".log"),
  );
  if (candidates.length === 0) return null;

  // Sort by mtime desc. We stat each candidate; admin-scan-runs/ stays
  // small (rolled over by ops), so the O(n) stat cost is fine.
  const stats = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = path.join(RUNS_DIR, name);
      try {
        const s = await fs.stat(fullPath);
        return { name, fullPath, mtimeMs: s.mtimeMs, sizeBytes: s.size };
      } catch {
        return null;
      }
    }),
  );
  const valid = stats.filter(
    (s): s is { name: string; fullPath: string; mtimeMs: number; sizeBytes: number } =>
      s !== null,
  );
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = valid[0];
  return {
    name: newest.name,
    fullPath: newest.fullPath,
    sizeBytes: newest.sizeBytes,
  };
}

/**
 * Read the last N lines of a UTF-8 log file. Strategy: read whole file,
 * split on `\r?\n`, drop a trailing empty element from a final newline,
 * slice the tail. The log files are bounded by ops (a single scan run);
 * if they ever grow large enough to matter, swap in a chunked reverse
 * reader. Today the simple path is correct + cheap.
 */
async function readTail(filePath: string, lineCount: number): Promise<string[]> {
  const text = await fs.readFile(filePath, "utf8");
  const all = text.split(/\r?\n/);
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  if (all.length <= lineCount) return all;
  return all.slice(all.length - lineCount);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ScanLogResponse | ErrorShape>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorShape>;

  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get("source")?.trim() ?? "";
  if (!isWhitelistedSource(sourceParam)) {
    return NextResponse.json(
      {
        ok: false,
        error: `invalid source — allowed: ${SOURCE_WHITELIST.join(", ")}`,
        reason: "invalid_source",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const source: ScanSource = sourceParam;
  const lineCount = parseLinesParam(searchParams.get("lines"));

  try {
    const newest = await findNewestLog(source);
    if (!newest) {
      return NextResponse.json(
        {
          ok: true,
          source,
          file: null,
          startedAt: null,
          sizeBytes: 0,
          lines: [],
          note: "no runs yet",
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const lines = await readTail(newest.fullPath, lineCount);
    const startedAt = parseStartedAtFromFilename(newest.name, source);

    return NextResponse.json(
      {
        ok: true,
        source,
        file: newest.name,
        startedAt,
        sizeBytes: newest.sizeBytes,
        lines,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, reason: "scan_log_read_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
