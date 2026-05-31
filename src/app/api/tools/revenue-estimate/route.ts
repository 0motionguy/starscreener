// GET /api/tools/revenue-estimate?category=...&starBand=...&phLaunched=true|false
//
// Wrapper around src/lib/revenue-benchmarks.ts so the estimator UI can run
// client-side queries without re-shipping the whole bucket table on every
// page load. Buckets are small (a few KB), so a per-estimate request is the
// simpler architecture than hydrating the table up front.

import { NextRequest, NextResponse } from "next/server";

import {
  estimateMrr,
  refreshRevenueBenchmarksFromStore,
} from "@/lib/revenue-benchmarks";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await refreshRevenueBenchmarksFromStore();
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const starBand = params.get("starBand");
  const phLaunchedRaw = params.get("phLaunched");
  const phLaunched =
    phLaunchedRaw === "true"
      ? true
      : phLaunchedRaw === "false"
        ? false
        : null;

  const result = estimateMrr({
    category: category && category.length > 0 ? category : null,
    starBand: starBand && starBand.length > 0 ? starBand : null,
    phLaunched,
  });

  return NextResponse.json({ ok: true, result });
}
