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

// Per-process cooldown so the UI refresh button can't DOS the process.
// Recompute is user-facing (the stats-bar refresh), so we rate-limit instead
// of gating behind CRON_SECRET. One call per 15s max.
const COOLDOWN_MS = 15_000;
let lastFinishedAt = 0;

export async function POST(): Promise<NextResponse> {
  const now = Date.now();
  const sinceLast = now - lastFinishedAt;
  if (sinceLast < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - sinceLast) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: `cooldown active (${waitSec}s remaining)`,
      },
      { status: 429, headers: { "Retry-After": String(waitSec) } },
    );
  }

  try {
    await pipeline.ensureReady();
    const summary = await pipeline.recomputeAll();
    lastFinishedAt = Date.now();
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
