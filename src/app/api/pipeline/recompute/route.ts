// POST /api/pipeline/recompute
//
// Triggers a full pipeline recompute pass — deltas, scores, classifications,
// reasons, and global/category rank. Returns a summary of what changed and
// how long the pass took.
//
// Auth: CRON_SECRET-protected via the shared verifyCronAuth helper (same as
// /api/pipeline/ingest, /api/pipeline/persist, etc). Public access previously
// let any client trigger an expensive recompute; the in-process 15s cooldown
// that guarded this endpoint reset on every Vercel lambda cold-start and was
// not a real rate limit. The cooldown is retained as belt-and-suspenders
// once the caller is authenticated.

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { pipeline } from "@/lib/pipeline/pipeline";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

export interface RecomputeResponse {
  ok: true;
  reposRecomputed: number;
  scoresComputed: number;
  reasonsGenerated: number;
  durationMs: number;
}

// Per-process cooldown. Not a real rate limit (resets on cold start) but
// cheap defense-in-depth against a burst of authenticated recomputes.
const COOLDOWN_MS = 15_000;
let lastFinishedAt = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  Sentry.setTag("route", "api/pipeline/recompute");

  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

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
    Sentry.captureException(err, {
      tags: { route: "api/pipeline/recompute", phase: "recomputeAll" },
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
