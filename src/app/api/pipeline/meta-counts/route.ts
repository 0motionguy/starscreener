// GET /api/pipeline/meta-counts
//
// Returns the 7 meta-bar counters (hot / breakouts / quietKillers / new /
// discussed / rankClimbers / freshReleases) rolled up across every tracked
// repo in a single pass.

import { NextResponse } from "next/server";
import { getDerivedMetaCounts } from "@/lib/derived-insights";
import type { MetaCounts } from "@/lib/types";

export const runtime = "nodejs";

export interface MetaCountsResponse {
  counts: MetaCounts;
}

export async function GET(): Promise<
  NextResponse<MetaCountsResponse | { error: string }>
> {
  try {
    const counts = getDerivedMetaCounts();
    return NextResponse.json(
      { counts },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
