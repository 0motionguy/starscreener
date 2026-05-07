// Cron route — daily alert maintenance.
//
//   - Prunes alert_events older than 90 days (table-size bound).
//   - Resets alert_rules.fire_count_today counters to 0.
//   - Drops expired rows from alert_delivery_log.
//
// Schedule: daily at 00:05 UTC.

import { NextRequest, NextResponse } from "next/server";
import { lt } from "drizzle-orm";

import { verifyCronAuth } from "@/lib/api/auth";
import {
  pruneOldAlertEvents,
  resetDailyFireCounts,
} from "@/lib/alerts/dispatcher";
import { db } from "@/lib/db/client";
import { alertDeliveryLog } from "@/lib/db/schema/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<NextResponse> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json({ error: verdict.kind }, { status });
  }
  const start = Date.now();
  try {
    const pruned = await pruneOldAlertEvents();
    await resetDailyFireCounts();
    const expiredLogs = await db
      .delete(alertDeliveryLog)
      .where(lt(alertDeliveryLog.expiresAt, new Date()))
      .returning({ ruleId: alertDeliveryLog.ruleId });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      eventsPruned: pruned.deleted,
      logsPruned: expiredLogs.length,
    });
  } catch (err) {
    console.error("[cron.alerts.cleanup] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
