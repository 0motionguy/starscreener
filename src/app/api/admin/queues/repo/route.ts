// GET  /api/admin/queues/repo           — list every row in the AISO rescan queue.
// POST /api/admin/queues/repo { drain: true, limit?: number }
//                                        — kick the drain worker via the existing
//                                          cron endpoint (CRON_SECRET is read
//                                          server-side and never leaves the box).
//
// Auth: ADMIN_TOKEN bearer or ss_admin cookie (verifyAdminAuth handles both).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { readQueue } from "@/lib/aiso-queue";

export const runtime = "nodejs";

const DrainBodySchema = z.object({
  drain: z.literal(true, { message: "only { drain: true } is supported" }),
  limit: z.number().finite().positive().optional(),
});

export const dynamic = "force-dynamic";

interface ListResponse {
  ok: true;
  total: number;
  rows: Array<{
    id: string;
    repoFullName: string;
    websiteUrl: string | null;
    queuedAt: string;
    requestIp: string | null;
    source: string | null;
  }>;
}

interface DrainResponse {
  ok: true;
  drain: true;
  result: unknown;
}

interface Err {
  ok: false;
  error: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListResponse | Err>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<Err>;

  try {
    const rows = await readQueue();
    return NextResponse.json({
      ok: true,
      total: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        repoFullName: r.repoFullName,
        websiteUrl: r.websiteUrl,
        queuedAt: r.queuedAt,
        requestIp: r.requestIp ?? null,
        source: r.source ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DrainResponse | Err>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<Err>;

  const parsed = await parseBody(request, DrainBodySchema);
  if (!parsed.ok) return parsed.response as NextResponse<Err>;
  const body = parsed.data;

  const cronSecret = process.env.CRON_SECRET;
  // APP-07: only allow CRON_SECRET-less drains in `development`. Earlier
  // versions checked NODE_ENV === "production" only, which silently
  // accepted unauthenticated drain calls in `staging`/`preview`/`test`/
  // anything-not-production. Tighten to fail-closed everywhere except
  // explicit local dev.
  if (!cronSecret && process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured; cannot drain" },
      { status: 503 },
    );
  }

  const limit = body.limit;
  const origin = request.nextUrl.origin;
  const drainUrl = `${origin}/api/cron/aiso-drain`;

  try {
    const res = await fetch(drainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
      body: JSON.stringify(limit ? { limit } : {}),
    });
    const result = (await res.json()) as unknown;
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `drain endpoint returned ${res.status}`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, drain: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `drain call failed: ${message}` },
      { status: 500 },
    );
  }
}
