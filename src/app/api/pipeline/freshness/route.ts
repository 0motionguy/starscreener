import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminAuth, verifyCronAuth } from "@/lib/api/auth";
import {
  getDegradedScannerSources,
  getScannerSourceHealth,
  refreshScannerSourceHealthFromStore,
} from "@/lib/source-health";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function canViewDetail(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return (
    (cronSecret ? verifyCronAuth(request).kind === "ok" : false) ||
    verifyAdminAuth(request).kind === "ok"
  );
}

export async function GET(request: NextRequest) {
  await refreshScannerSourceHealthFromStore();
  const sources = getScannerSourceHealth();
  const degradedSources = getDegradedScannerSources();
  const status = sources.length === 0 || sources.some((source) => source.stale)
    ? "stale"
    : degradedSources.length > 0
      ? "degraded"
      : "ok";
  const responseStatus = status === "stale" ? 503 : 200;

  if (
    request.nextUrl.searchParams.get("detail") !== "1" ||
    !canViewDetail(request)
  ) {
    return NextResponse.json(
      {
        status,
        sourceStatus: degradedSources.length > 0 ? "degraded" : "ok",
        degradedSourceCount: degradedSources.length,
      },
      { status: responseStatus, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      status,
      degradedSources: degradedSources.map((source) => source.id),
      sources,
    },
    { status: responseStatus, headers: NO_STORE_HEADERS },
  );
}
