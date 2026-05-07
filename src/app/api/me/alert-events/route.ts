// /api/me/alert-events — paginated alert event feed (Chunk D).
//
// GET ?limit=50&before=<iso>
//   → caller's alert_events rows, most-recent-first, cursored on
//     `firedAt`. Used by both the `/you/alerts` UI and the MCP
//     `list_my_alerts` tool — keep the response shape stable:
//       { ok: true, events: AlertEvent[], nextCursor: string | null }
//
// `nextCursor` is the ISO timestamp of the last row in the page; clients
// pass it as `?before=<nextCursor>` to fetch the next page. Returns null
// when fewer than `limit` rows came back (i.e. end of feed).
//
// Auth: requireUser(). No admin/cron crossover.

import { and, desc, eq, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { alertEvents } from "@/lib/db/schema/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

function parseBefore(raw: string | null): Date | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const before = parseBefore(searchParams.get("before"));

  const conditions = before
    ? and(
        eq(alertEvents.profileId, user.profile.id),
        lt(alertEvents.firedAt, before),
      )
    : eq(alertEvents.profileId, user.profile.id);

  const rows = await db
    .select()
    .from(alertEvents)
    .where(conditions)
    .orderBy(desc(alertEvents.firedAt))
    .limit(limit);

  // `nextCursor` is the firedAt of the LAST row in this page when the
  // page is full; null otherwise. Clients pass it back as `?before=`.
  const nextCursor =
    rows.length === limit
      ? rows[rows.length - 1].firedAt.toISOString()
      : null;

  return NextResponse.json(
    { ok: true, events: rows, nextCursor },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
