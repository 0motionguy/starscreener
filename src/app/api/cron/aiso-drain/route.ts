// POST /api/cron/aiso-drain
//
// Drain worker for the AISO rescan queue.
//
// Reads `.data/aiso-rescan-queue.jsonl` (populated by
// `POST /api/repos/[owner]/[name]/aiso`), dedupes by `repoFullName`,
// caps at `limit`, and for each row invokes the scanner in
// `src/lib/aiso-tools.ts` with a 3s gap between calls. Rows whose scan
// completes successfully are removed from the queue under the shared
// per-file lock used by the producer; failed rows stay for a later run.
//
// Auth: CRON_SECRET bearer, same pattern as every other cron route.
// Missing secret in production → 503 `not_configured`; missing in dev
// allows through (matches existing cron ergonomics).
//
// Rate-limit posture: we do NOT hammer the external `aiso.tools` API
// because `getAisoToolsScan` is already cache-aware (6h TTL on a
// completed scan) — the 3s inter-call gap here is additional defence
// in depth when a fresh rescan sprays several never-scanned rows.
//
// Body:
//   { limit?: number (default 10, capped at 50),
//     dryRun?: boolean (default false) }
//
// Response (200):
//   { ok: true, drained, succeeded, failed, errors[], remaining, durationMs }
//
// Error envelope follows the rest of the cron surface:
//   401 unauthorized
//   503 not configured
//   500 internal (for I/O failures that crash the whole drain)
//
// --- scan-writer contract (wave 6+) ---
// The committed profile writer lives in `scripts/enrich-repo-profiles.mjs`
// and stamps results into `data/repo-profiles.json`. That writer is a
// standalone Node script — it re-reads trending/metadata/npm/product-hunt
// feeds and serializes the full profile list. Calling it from a request
// handler would pull in 600+ lines of enrichment machinery and is out of
// scope for this worker.
//
// Instead, this route uses `persistAisoScan` (src/lib/aiso-persist.ts),
// a lightweight helper that merges a single scan into the canonical
// `data/repo-profiles.json` under the shared per-file lock. After a
// successful drain call:
//   1. Pops queue rows,
//   2. Invokes `getAisoToolsScan(websiteUrl)` (which also caches the
//      result in the in-process memoryCache inside aiso-tools.ts),
//   3. Persists the scan into `data/repo-profiles.json` so the result
//      survives cold restarts and is visible to `ProjectSurfaceMap` on
//      the next render,
//   4. Truncates the queue on success.
//
// A persist failure counts the row as FAILED (left on the queue for a
// later retry) so we never drop data the scanner fetched but we couldn't
// commit.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { persistAisoScan } from "@/lib/aiso-persist";
import {
  readQueue,
  truncateQueue,
  type AisoQueueRow,
} from "@/lib/aiso-queue";
import { getAisoToolsScan, type AisoToolsScan } from "@/lib/aiso-tools";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_INTER_CALL_DELAY_MS = 3_000;

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// ---------------------------------------------------------------------------
// Dependency-injection hooks (test-only)
// ---------------------------------------------------------------------------
//
// Next.js forbids extra named exports in route files, so we publish the
// drain's scanner + delay overrides on `globalThis` under a symbol. Tests
// import the route, set the overrides, invoke POST, then restore. Nothing
// in production reads these hooks.

export interface AisoDrainTestOverrides {
  /** Replacement for `getAisoToolsScan(url)`. */
  scanner?: (url: string | null) => Promise<AisoToolsScan | null>;
  /**
   * Replacement for the 3s inter-call gap. Tests pass 0 to avoid dragging
   * test runtime.
   */
  delayMs?: number;
}

const AISO_DRAIN_TEST_KEY = Symbol.for("trendingrepo.aiso.drain.test");

interface DrainOverrideBag {
  overrides?: AisoDrainTestOverrides;
}

function getOverrides(): AisoDrainTestOverrides {
  const bag = (globalThis as unknown as Record<symbol, DrainOverrideBag | undefined>)[
    AISO_DRAIN_TEST_KEY
  ];
  return bag?.overrides ?? {};
}

// Register a stable, idempotent setter the test can hit via `Symbol.for`.
(globalThis as unknown as Record<symbol, DrainOverrideBag>)[
  AISO_DRAIN_TEST_KEY
] = (globalThis as unknown as Record<symbol, DrainOverrideBag>)[
  AISO_DRAIN_TEST_KEY
] ?? {};

// ---------------------------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------------------------

const DrainRequestSchema = z
  .object({
    limit: z.number().finite().optional(),
    dryRun: z.boolean().optional(),
  })
  .passthrough();

type DrainRequestBody = z.infer<typeof DrainRequestSchema>;

function parseLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_LIMIT;
  }
  const clamped = Math.min(Math.floor(raw), MAX_LIMIT);
  return Math.max(1, clamped);
}

// Body parsing routed through @/lib/api/parse-body (canonical helper)
// with allowEmpty so a no-body cron POST is treated as `{}`.

// ---------------------------------------------------------------------------
// Drain selection
// ---------------------------------------------------------------------------
//
// Dedup rule: multiple queued rows for the same repoFullName collapse to
// the newest `queuedAt`. We pick the newest so an operator who enqueues
// twice sees the scan happen against the latest website value.

interface SelectedRow {
  id: string;
  row: AisoQueueRow;
  droppedSiblings: string[];
}

function selectDrainBatch(
  queue: AisoQueueRow[],
  limit: number,
): { selected: SelectedRow[]; allProcessedIds: Set<string> } {
  const byRepo = new Map<string, AisoQueueRow>();
  const siblings = new Map<string, string[]>();

  for (const row of queue) {
    const existing = byRepo.get(row.repoFullName);
    if (!existing) {
      byRepo.set(row.repoFullName, row);
      continue;
    }
    // Keep the newer one by `queuedAt`.
    const incomingAt = Date.parse(row.queuedAt);
    const currentAt = Date.parse(existing.queuedAt);
    const incomingWins = Number.isFinite(incomingAt) && (!Number.isFinite(currentAt) || incomingAt > currentAt);

    const keep = incomingWins ? row : existing;
    const drop = incomingWins ? existing : row;
    byRepo.set(row.repoFullName, keep);

    const list = siblings.get(row.repoFullName) ?? [];
    list.push(drop.id);
    siblings.set(row.repoFullName, list);
  }

  const selected: SelectedRow[] = [];
  for (const row of byRepo.values()) {
    if (selected.length >= limit) break;
    selected.push({
      id: row.id,
      row,
      droppedSiblings: siblings.get(row.repoFullName) ?? [],
    });
  }

  // When a repo's "winning" row succeeds, the sibling ids ALSO come off
  // the queue — they're duplicates for the same repo and re-running them
  // would bypass the dedup. This set is only applied after a successful
  // scan for the winning row (see runDrain below).
  return { selected, allProcessedIds: new Set() };
}

// ---------------------------------------------------------------------------
// Drain loop
// ---------------------------------------------------------------------------

interface DrainResult {
  drained: number;
  succeeded: number;
  failed: number;
  errors: string[];
  remaining: number;
  durationMs: number;
  dryRun: boolean;
}

async function runDrain(
  limit: number,
  dryRun: boolean,
): Promise<DrainResult> {
  const startedAt = Date.now();
  const queue = await readQueue();
  const { selected } = selectDrainBatch(queue, limit);

  const overrides = getOverrides();
  const scanner = overrides.scanner ?? getAisoToolsScan;
  const delayMs =
    typeof overrides.delayMs === "number" && overrides.delayMs >= 0
      ? overrides.delayMs
      : DEFAULT_INTER_CALL_DELAY_MS;

  if (dryRun) {
    return {
      drained: selected.length,
      succeeded: 0,
      failed: 0,
      errors: [],
      // In a dry run the queue is unchanged; remaining is the full queue
      // minus whatever we WOULD have popped.
      remaining: queue.length,
      durationMs: Date.now() - startedAt,
      dryRun: true,
    };
  }

  const processedIds = new Set<string>();
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < selected.length; i++) {
    const { row, droppedSiblings } = selected[i];

    if (i > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const scan = await scanner(row.websiteUrl);
      // Persist the scan (even null) into data/repo-profiles.json so the
      // result outlives the in-process memoryCache. A persist throw is
      // treated as a row failure — we'd rather retry than silently drop
      // the scan result.
      await persistAisoScan(row.repoFullName, scan);
      processedIds.add(row.id);
      for (const sib of droppedSiblings) processedIds.add(sib);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      const message =
        err instanceof Error ? err.message : String(err);
      errors.push(`${row.repoFullName}: ${message}`);
      // Leave the row (and its duplicate siblings) in the queue so a
      // later run retries. We deliberately do NOT mark the siblings
      // processed on failure — the retry should still dedup on its own
      // read.
    }
  }

  let remaining = queue.length;
  if (processedIds.size > 0) {
    const removed = await truncateQueue(processedIds);
    remaining = Math.max(0, queue.length - removed);
  }

  return {
    drained: selected.length,
    succeeded,
    failed,
    errors,
    remaining,
    durationMs: Date.now() - startedAt,
    dryRun: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const parsed = await parseBody(request, DrainRequestSchema, {
    allowEmpty: true,
  });
  if (!parsed.ok) return parsed.response;
  const limit = parseLimit(parsed.data.limit);
  const dryRun = parsed.data.dryRun === true;

  try {
    const result = await runDrain(limit, dryRun);
    return NextResponse.json(
      {
        ok: true as const,
        ...result,
      },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:aiso-drain] drain failed", err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }
}

// GET alias for Vercel Cron, which fires GET (not POST) to each cron path.
// Vercel auto-injects `Authorization: Bearer <CRON_SECRET>` so the underlying
// auth/body pipeline is identical — parseBody() short-circuits to `{}` when
// the request has no JSON body, which is the case for cron triggers (they
// can't send a body), so `limit` falls back to the default (10).
export async function GET(request: NextRequest) {
  return POST(request);
}
