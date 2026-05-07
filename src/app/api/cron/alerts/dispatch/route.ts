// Cron route — drains pending alert_events.
//
// Schedule: every 1 minute (via vercel.json). Vercel cron's minimum
// interval is 60s, which sets the floor on real-time alert latency at
// roughly 1-2 minutes p99. For sub-minute delivery the dispatcher can
// also be invoked from the Railway worker (`apps/trendingrepo-worker/`)
// on a 15s tick — out of scope for v1.
//
// Auth: CRON_SECRET via verifyCronAuth (same machinery the rest of
// /api/cron/* uses). The middleware already bypasses /api/cron/* from
// Clerk, so requests with the bearer token sail straight through.

import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { dispatchPendingAlerts } from "@/lib/alerts/dispatcher";

// lint-allow: no-parsebody - no-body cron endpoint; verifyCronAuth is the trust boundary.
// Force Node runtime — postgres-js + crypto.subtle interop relies on it.
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
    const metrics = await dispatchPendingAlerts();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      ...metrics,
    });
  } catch (err) {
    console.error("[cron.alerts.dispatch] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
        durationMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}

// Vercel fires GET; we accept POST too for manual operator runs (curl).
export const GET = handle;
export const POST = handle;
