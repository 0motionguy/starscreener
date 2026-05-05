// GET  /api/pipeline/alerts        — list AlertEvents for the caller
// POST /api/pipeline/alerts        — mark an event as read
//
// The alerts endpoint reads from the alertEventStore exposed through the
// pipeline facade. Events are created elsewhere (ingest + recompute auto-
// fire triggers), so this route is read-oriented plus one mutation:
// marking an event as read.
//
// Auth: the caller's userId is derived from `verifyUserAuth` (bearer/x-user-token
// header → userId). Previously the endpoint trusted `?userId=<x>` in the query
// string, which let any unauthenticated client read any user's alert feed.
// The `userId` query parameter is now IGNORED.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistPipeline, pipeline } from "@/lib/pipeline/pipeline";
import type { AlertEvent } from "@/lib/pipeline/types";
import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { serverError } from "@/lib/api/error-response";

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

const MarkReadBodySchema = z.object({
  eventId: z.string().min(1, "eventId must be a non-empty string"),
});

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AlertsListResponse | AlertsErrorResponse>> {
  const auth = verifyUserAuth(request);
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
    return serverError<AlertsErrorResponse>(err, {
      scope: "[pipeline/alerts]",
      publicMessage: "server error",
    });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AlertsMarkReadResponse | AlertsErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<AlertsErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const parsed = await parseBody(request, MarkReadBodySchema);
  if (!parsed.ok) return parsed.response as NextResponse<AlertsErrorResponse>;
  const { eventId } = parsed.data;

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
    return serverError<AlertsErrorResponse>(err, {
      scope: "[pipeline/alerts]",
      publicMessage: "server error",
    });
  }
}
