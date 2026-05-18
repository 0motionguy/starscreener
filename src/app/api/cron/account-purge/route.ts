// Cron route — 30-day hard-delete of soft-deleted profiles.
//
// PR #1742 hardened /api/account/delete to PII-scrub the row + set
// `deleted_at = now()`, keeping the FK target alive for a 30-day grace
// window so dependent rows (alert_rules, watchlists, referrals) don't
// vanish in case the user changes their mind. This cron closes the
// loop: profiles whose `deleted_at` is older than 30 days are
// permanently removed, and the FK CASCADE config on child tables
// (alert_rules, alert_events, watchlists, referrals × 3 — see grep of
// `references(() => profiles.id, { onDelete: "cascade" })`) drops their
// dependents atomically.
//
// Schedule: daily at 04:17 UTC. Off the :00/:30 marks per the platform's
// anti-thundering-herd convention.
//
// Modes:
//   - default        → DELETE and return purged count + ids
//   - ?dry=1         → SELECT only; return what WOULD be deleted; safe to
//                      run any time for visibility
//
// Auth: `verifyCronAuth` (CRON_SECRET bearer). Same trust boundary as
// every other cron route — see src/lib/api/auth.ts.
//
// Response shape:
//   200 { ok: true, durationMs, dryRun, purged, ids }
//   401 { ok: false, error }
//   503 { ok: false, error: "cron auth not configured" }
//   500 { ok: false, error }

import { NextRequest, NextResponse } from "next/server";
import { and, isNotNull, lt, sql } from "drizzle-orm";

import { verifyCronAuth } from "@/lib/api/auth";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { errorEnvelope } from "@/lib/api/error-response";
import { withHealthcheck } from "@/lib/healthcheck";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

// lint-allow: no-parsebody - no-body cron endpoint; verifyCronAuth is the trust boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PurgeOkResponse {
  ok: true;
  durationMs: number;
  dryRun: boolean;
  purged: number;
  ids: string[];
}

interface PurgeErrorResponse {
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
): Promise<NextResponse<PurgeOkResponse | PurgeErrorResponse>> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json(errorEnvelope(verdict.kind), {
      status,
    }) as NextResponse<PurgeErrorResponse>;
  }
  const oversize = withBodySizeLimit(req);
  if (oversize) return oversize as NextResponse<PurgeErrorResponse>;

  const url = new URL(req.url);
  const dryRun = parseDryRun(url);
  const start = Date.now();

  // 30-day grace window. `deleted_at` is set by /api/account/delete when a
  // user requests deletion; we hard-delete only those whose timestamp is
  // strictly older than 30 days. NOW() is computed on the DB side via
  // `sql\`now() - interval '30 days'\`` so all rows are evaluated against
  // the same instant regardless of how long the query takes.
  const cutoffExpr = sql`now() - interval '30 days'`;
  const where = and(isNotNull(profiles.deletedAt), lt(profiles.deletedAt, cutoffExpr));

  try {
    if (dryRun) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(where);
      return NextResponse.json({
        ok: true,
        durationMs: Date.now() - start,
        dryRun: true,
        purged: rows.length,
        ids: rows.map((r) => r.id),
      });
    }

    const deleted = await db
      .delete(profiles)
      .where(where)
      .returning({ id: profiles.id });
    // FK cascade on alert_rules, alert_events, watchlists, referrals,
    // referral_codes, referral_milestones fires synchronously inside the
    // DELETE — no follow-up cleanup needed here.
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      dryRun: false,
      purged: deleted.length,
      ids: deleted.map((r) => r.id),
    });
  } catch (err) {
    console.error("[cron.account-purge] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

const handler = withHealthcheck("account-purge", handle);
export const GET = handler;
export const POST = handler;
