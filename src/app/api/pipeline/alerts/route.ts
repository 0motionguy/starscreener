// GET  /api/pipeline/alerts        — list AlertEvents for a user
// POST /api/pipeline/alerts        — mark an event as read
//
// The alerts endpoint reads from the alertEventStore exposed through the
// pipeline facade. Events are created elsewhere (ingest + recompute auto-
// fire triggers), so this route is read-oriented plus one mutation:
// marking an event as read.

import { NextRequest, NextResponse } from "next/server";
import { persistPipeline, pipeline } from "@/lib/pipeline/pipeline";
import type { AlertEvent } from "@/lib/pipeline/types";

const DEFAULT_USER_ID = "local";

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
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AlertsListResponse | AlertsErrorResponse>> {
  try {
    await pipeline.ensureReady();

    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId") ?? DEFAULT_USER_ID;
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
