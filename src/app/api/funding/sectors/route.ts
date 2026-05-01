// GET /api/funding/sectors
//
// V4 W4 — sector-level funding aggregates over a chosen time window.
//
// Query parameters (all optional):
//   window — one of: 24h | 7d | 30d (default: 30d)
//
// Returns the per-sector totalUsd / dealCount / topDeal breakdown for the
// window. Sectors with no events in the window are not included. Events
// without a `sector` tag are bucketed under "uncategorized".

import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope } from "@/lib/api/error-response";
import {
  getFundingSectorBreakdown,
  refreshFundingFromStore,
  type FundingSectorAggregate,
  type FundingWindow,
} from "@/lib/funding/aggregate";

export const runtime = "nodejs";

const KNOWN_WINDOWS: ReadonlyArray<FundingWindow> = ["24h", "7d", "30d"];

interface FundingSectorsResponse {
  window: FundingWindow;
  sectors: FundingSectorAggregate[];
  generatedAt: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<FundingSectorsResponse | { ok: false; error: string }>> {
  const { searchParams } = request.nextUrl;

  let window: FundingWindow = "30d";
  const windowParam = searchParams.get("window");
  if (windowParam !== null && windowParam !== "") {
    if (!KNOWN_WINDOWS.includes(windowParam as FundingWindow)) {
      return NextResponse.json(
        errorEnvelope(`window must be one of: ${KNOWN_WINDOWS.join(", ")}`),
        { status: 400 },
      );
    }
    window = windowParam as FundingWindow;
  }

  try {
    await refreshFundingFromStore();
    const sectors = getFundingSectorBreakdown(window);
    return NextResponse.json(
      { window, sectors, generatedAt: new Date().toISOString() },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
