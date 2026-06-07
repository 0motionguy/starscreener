// Worker fleet health probe.
//
// Reads the meta sidecar (`ss:meta:v1:<slug>`) for every active Redis slug the
// worker owns, computes age, classifies green / amber / red / missing against
// expected cadence, and returns one aggregated JSON envelope.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import {
  readWorkerHealthSnapshot,
  type WorkerHealthSnapshot,
} from "@/lib/worker-health-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkOptionalBearer(request: NextRequest): NextResponse | null {
  const expected = process.env.WORKER_HEALTH_BEARER?.trim();
  if (!expected) return null;
  const header = request.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  const supplied = header.slice(prefix.length);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return null;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<WorkerHealthSnapshot> | NextResponse> {
  const deny = checkOptionalBearer(request);
  if (deny) return deny;

  const store = getDataStore();
  const redis = store.redisClient();
  const snapshot = await readWorkerHealthSnapshot(redis);

  return NextResponse.json(
    snapshot,
    {
      status: snapshot.ok ? 200 : 503,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
