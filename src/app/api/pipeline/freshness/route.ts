import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminAuth, verifyCronAuth } from "@/lib/api/auth";
import { getDegradedScannerSources, getScannerSourceHealth } from "@/lib/source-health";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function canViewDetail(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return (
    (cronSecret ? verifyCronAuth(request).kind === "ok" : false) ||
    verifyAdminAuth(request).kind === "ok"
  );
}

export async function GET(request: NextRequest) {
  const sources = getScannerSourceHealth();
  const degradedSources = getDegradedScannerSources();
  const status = sources.some((source) => source.stale)
    ? "stale"
    : degradedSources.length > 0
      ? "degraded"
      : "ok";

  if (
    request.nextUrl.searchParams.get("detail") !== "1" ||
    !canViewDetail(request)
  ) {
    return NextResponse.json({
      status,
      sourceStatus: degradedSources.length > 0 ? "degraded" : "ok",
      degradedSourceCount: degradedSources.length,
    });
  }

  return NextResponse.json({
    status,
    degradedSources: degradedSources.map((source) => source.id),
    sources,
  });
}
