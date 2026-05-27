// Cron route — expire stale entries from the `pool:github:tokens:*` Redis
// namespace.
//
// PROBLEM
//   The github-token-pool publishes per-PAT state to Redis with a 30-day TTL
//   so cold-start hydration sees warm data. Side-effect: tokens that were
//   quarantined-then-rotated, or whose reset window elapsed without further
//   use, linger as "exhausted/quarantined" rows for up to 30 days. Symptom
//   observed 2026-05-27: 22 keys → ~11 marked stale-quarantined with reset
//   epochs 2000+ minutes in the past.
//
// SOLUTION
//   This endpoint calls the pure planner in `@/lib/github-pool-sweeper` to
//   classify each key, then DELs the casualties. Two grace windows:
//     - QUARANTINE_DECAY_GRACE_MS (48h after quarantine ended)
//     - RESET_DECAY_GRACE_MS (24h after the reset window elapsed)
//   Within grace, the row is kept so the existing pool can reconcile.
//
//   Schedule: daily, off the :00 mark per the platform anti-thundering-herd
//   convention. The actual cron entry is added by the operator (vercel.json /
//   GH Actions). This route is operator-callable any time.
//
// Modes:
//   - default        → DEL stale keys, return summary
//   - ?dry=1         → plan only, no DELs; safe to run any time
//
// Auth: `verifyCronAuth` (CRON_SECRET bearer). Same trust boundary as every
// other cron route — see src/lib/api/auth.ts.
//
// Response shape:
//   200 { ok: true, durationMs, dryRun, scanned, deleted, kept, expired: [...], errors: [...] }
//   401 { ok: false, error }
//   503 { ok: false, error: "cron auth not configured" }
//   500 { ok: false, error }

import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { errorEnvelope } from "@/lib/api/error-response";
import { withHealthcheck } from "@/lib/healthcheck";
import { runSweep, type ExpiryReason } from "@/lib/github-pool-sweeper";

// lint-allow: no-parsebody - no-body cron endpoint; verifyCronAuth is the trust boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SweepOkResponse {
  ok: true;
  durationMs: number;
  dryRun: boolean;
  scanned: number;
  deleted: number;
  kept: number;
  expired: Array<{ key: string; reason: ExpiryReason }>;
  errors: string[];
}

interface SweepErrorResponse {
  ok: false;
  error: string;
}

function parseDryRun(url: URL): boolean {
  const raw = url.searchParams.get("dry");
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function handle(
  req: NextRequest,
): Promise<NextResponse<SweepOkResponse | SweepErrorResponse>> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json(errorEnvelope(verdict.kind), {
      status,
    }) as NextResponse<SweepErrorResponse>;
  }
  const oversize = withBodySizeLimit(req);
  if (oversize) return oversize as NextResponse<SweepErrorResponse>;

  const url = new URL(req.url);
  const dryRun = parseDryRun(url);
  const start = Date.now();

  try {
    const result = await runSweep({ dryRun });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      dryRun,
      scanned: result.plan.scanned,
      deleted: result.deleted,
      kept: result.plan.toKeep.length,
      expired: result.plan.toExpire,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[cron.github-pool-sweep] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

const handler = withHealthcheck("github-pool-sweep", handle);
export const GET = handler;
export const POST = handler;
