// GET /api/pipeline/meta-counts
//
// Returns the 7 meta-bar counters (hot / breakouts / quietKillers / new /
// discussed / rankClimbers / freshReleases) rolled up across every tracked
// repo in a single pass.

import { NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import type { MetaCounts } from "@/lib/types";

export interface MetaCountsResponse {
  counts: MetaCounts;
}

export async function GET(): Promise<
  NextResponse<MetaCountsResponse | { error: string }>
> {
  try {
    await pipeline.ensureReady();
    const counts = pipeline.getMetaCounts();
    return NextResponse.json(
      { counts },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
