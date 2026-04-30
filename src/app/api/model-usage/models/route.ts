// GET /api/model-usage/models
//
// Per-model rollup with rankings (usage share, cost share, latency, error
// rate). 24h window. Public mode rolls models with <PUBLIC_MIN_EVENTS into
// a single 'other' bucket; admin-internal mode (?internal=1) returns the
// full list with metadata fields.

import { NextRequest, NextResponse } from "next/server";

import { verifyAdminAuth } from "@/lib/api/auth";
import {
  getDailyByModel,
  getModelMetadata,
  refreshModelUsageFromStore,
} from "@/lib/model-usage";
import { applyPublicGate, annotateWithMetadata, rollUpModels } from "@/lib/llm/derive";
import type { ModelMeta } from "@/lib/llm/types";

export const runtime = "nodejs";
export const revalidate = 60;

const READ_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(request: NextRequest) {
  await refreshModelUsageFromStore();
  const url = new URL(request.url);
  const internal = isInternal(request);
  const days = clampInt(url.searchParams.get('days'), 1, 30, 1);

  const byModel = getDailyByModel();
  const meta = getModelMetadata();
  const metaById = new Map<string, ModelMeta>(meta.map((m) => [m.model_id, m]));

  const rollup = applyPublicGate(rollUpModels(byModel, days), { internal });
  const annotated = annotateWithMetadata(rollup, metaById);

  return NextResponse.json({ window_days: days, models: annotated }, { headers: READ_HEADERS });
}

function isInternal(request: NextRequest): boolean {
  const wantsInternal = new URL(request.url).searchParams.get('internal');
  if (wantsInternal !== '1' && wantsInternal !== 'true') return false;
  return verifyAdminAuth(request).kind === 'ok';
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
