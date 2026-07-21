// GET  /api/pipeline/alerts        — list AlertEvents for the caller
// POST /api/pipeline/alerts        — mark an event as read
//
// The alerts endpoint reads from the alertEventStore exposed through the
// pipeline facade. Events are created elsewhere (ingest + recompute auto-
// fire triggers), so this route is read-oriented plus one mutation:
// marking an event as read.
//
// Auth: resolveUserPrincipal (bearer/x-user-token header → userId, OR the
// ss_user cookie re-verified against a LIVE Clerk session for `c_` principals,
// so a stale signed-out cookie can't read or mutate the feed). Previously the
// endpoint trusted `?userId=<x>` in the query string; that parameter is IGNORED.

import { NextRequest, NextResponse } from "next/server";
import { persistPipeline, pipeline } from "@/lib/pipeline/pipeline";
import type { AlertEvent } from "@/lib/pipeline/types";
import { userAuthFailureResponse } from "@/lib/api/auth";
import { resolveUserPrincipal } from "@/lib/api/user-principal";

export const runtime = "nodejs";

export interface AlertsListResponse {
  ok: true;
  events: AlertEvent[];
  unreadCount: number;
}

export interface AlertsMarkReadResponse {
  ok: boolean;
}

export interface AlertsErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AlertsListResponse | AlertsErrorResponse>> {
  const auth = await resolveUserPrincipal(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<AlertsErrorResponse>;
  // TS narrowing: after the guard above, auth.kind === "ok".
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  try {
    await pipeline.ensureReady();

    const { searchParams } = request.nextUrl;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const all = pipeline.getAlerts(userId);
    const unreadCount = all.filter((e) => e.readAt === null).length;
    const events = unreadOnly
      ? all.filter((e) => e.readAt === null)
      : all;

    return NextResponse.json({
      ok: true,
      events,
      unreadCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AlertsMarkReadResponse | AlertsErrorResponse>> {
  const auth = await resolveUserPrincipal(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<AlertsErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  if (raw === null || typeof raw !== "object") {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const body = raw as Record<string, unknown>;
  const eventId = body.eventId;
  if (typeof eventId !== "string" || eventId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "eventId must be a non-empty string" },
      { status: 400 },
    );
  }

  try {
    await pipeline.ensureReady();
    // Ownership guard: only mark-read events that belong to this caller's feed.
    // pipeline.markAlertRead would otherwise happily mark any user's event.
    const { userId } = auth;
    const ownedIds = new Set(pipeline.getAlerts(userId).map((e) => e.id));
    if (!ownedIds.has(eventId)) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    const ok = pipeline.markAlertRead(eventId);
    if (ok) {
      await persistPipeline();
    }
    return NextResponse.json({ ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
