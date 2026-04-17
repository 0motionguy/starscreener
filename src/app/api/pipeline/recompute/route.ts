// POST /api/pipeline/recompute
//
// Triggers a full pipeline recompute pass — deltas, scores, classifications,
// reasons, and global/category rank. Returns a summary of what changed and
// how long the pass took. Safe to call at any time; callers should treat
// this as an idempotent "refresh derived data" operation.

import { NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";

export interface RecomputeResponse {
  ok: true;
  reposRecomputed: number;
  scoresComputed: number;
  reasonsGenerated: number;
  durationMs: number;
}

export async function POST(): Promise<
  NextResponse<RecomputeResponse | { ok: false; error: string }>
> {
  try {
    // recomputeAll itself awaits ensureReady internally, but calling it here
    // keeps the pattern uniform across every API route.
    await pipeline.ensureReady();
    const summary = await pipeline.recomputeAll();
    return NextResponse.json({
      ok: true,
      reposRecomputed: summary.reposRecomputed,
      scoresComputed: summary.scoresComputed,
      reasonsGenerated: summary.reasonsGenerated,
      durationMs: summary.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
