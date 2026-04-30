// GET /api/tier-lists/[shortId] — fetch a saved tier list by its short id.

import { NextResponse } from "next/server";

import { READ_SLOW_HEADERS } from "@/lib/api/cache";
import { errorEnvelope } from "@/lib/api/error-response";
import { isShortId } from "@/lib/tier-list/short-id";
import { getTierList } from "@/lib/tier-list/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ shortId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { shortId } = await params;
  if (!isShortId(shortId)) {
    return NextResponse.json(
      errorEnvelope("invalid short id", "BAD_ID"),
      { status: 400 },
    );
  }

  const payload = await getTierList(shortId);
  if (!payload) {
    return NextResponse.json(
      errorEnvelope("tier list not found", "NOT_FOUND"),
      { status: 404 },
    );
  }

  return NextResponse.json(
    { ok: true, payload },
    { headers: READ_SLOW_HEADERS },
  );
}
