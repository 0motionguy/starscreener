import { NextResponse } from "next/server";

import { getDegradedScannerSources, getScannerSourceHealth } from "@/lib/source-health";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = getScannerSourceHealth();
  return NextResponse.json({
    status: sources.some((source) => source.stale)
      ? "stale"
      : getDegradedScannerSources().length > 0
        ? "degraded"
        : "ok",
    degradedSources: getDegradedScannerSources().map((source) => source.id),
    sources,
  });
}
