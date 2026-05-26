// /api/agent-commerce/live-x402 — sub-minute x402 settlement snapshot.
//
// The /agent-commerce PaymentVolumeChart polls this endpoint every 15s to
// drive the live mini-chart and counter. Backed by Base BlockScout v2,
// no auth. See src/lib/agent-commerce/live-x402.ts for the aggregation.
//
// Cache: s-maxage=15, stale-while-revalidate=30. The next visitor inside
// the 15s window gets the cached payload; after 15s the next visitor
// triggers a fresh fetch. The chart's polling interval matches.

import { NextResponse } from "next/server";

import { fetchLiveX402 } from "@/lib/agent-commerce/live-x402";
import { errorEnvelope } from "@/lib/api/error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchLiveX402();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ...errorEnvelope("fetch_failed", "LIVE_X402_FETCH_FAILED"),
        message: err instanceof Error ? err.message : "unknown",
        healthy: false,
        fetchedAt: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}
