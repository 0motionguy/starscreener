// GET /api/model-usage/features
//
// Per-feature rollup. Admin-only — feature names are internal data and
// must never reach the public surface in v1.

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { getDailyByFeature, refreshModelUsageFromStore } from "@/lib/model-usage";
import { rollUpFeatures } from "@/lib/llm/derive";

export const runtime = "nodejs";
export const revalidate = 60;

const READ_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET(request: NextRequest) {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny;

  await refreshModelUsageFromStore();
  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get('days'), 1, 30, 1);
  const features = rollUpFeatures(getDailyByFeature(), days);
  return NextResponse.json({ window_days: days, features }, { headers: READ_HEADERS });
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
