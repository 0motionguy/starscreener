// Admin tile feed for the "Drop repo" event log.
//
// GET /api/admin/drop-events?days=7 returns the per-kind counts for the
// requested window plus the most recent 20 events newest-first. Auth via
// ADMIN_TOKEN. The underlying log is `.data/drop-events.jsonl` written by
// src/lib/drop-events.ts every time submitRepoToQueue resolves.

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import {
  readRecentDropEvents,
  summarizeDropEvents,
  type DropEvent,
  type DropEventSummary,
} from "@/lib/drop-events";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const RECENT_LIMIT = 20;

interface AdminDropEventsResponse {
  ok: true;
  days: number;
  summary: DropEventSummary;
  recent: DropEvent[];
}

interface AdminDropEventsErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

function parseDays(raw: string | null): number {
  if (raw === null || raw === "") return DEFAULT_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  if (parsed < MIN_DAYS) return MIN_DAYS;
  if (parsed > MAX_DAYS) return MAX_DAYS;
  return parsed;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminDropEventsResponse | AdminDropEventsErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminDropEventsErrorResponse>;

  const days = parseDays(request.nextUrl.searchParams.get("days"));
  const sinceMs = days * 86400 * 1000;

  try {
    const events = await readRecentDropEvents(sinceMs);
    const summary = summarizeDropEvents(events);
    const recent = [...events]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, RECENT_LIMIT);

    return NextResponse.json(
      { ok: true, days, summary, recent },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
