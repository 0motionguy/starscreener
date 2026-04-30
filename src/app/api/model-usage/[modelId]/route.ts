// GET /api/model-usage/[modelId]
//
// 30-day trend for a single model: events / cost / p95 latency / error rate
// per day. Includes the latest model metadata (pricing, capabilities) so
// the dashboard model-detail card has everything in one round-trip.
//
// Public when the model has >= PUBLIC_MIN_EVENTS in the rolled window;
// otherwise admin-only (returns 404 to non-admin to avoid leaking that the
// model has been used at all).

import { NextRequest, NextResponse } from "next/server";

import { verifyAdminAuth } from "@/lib/api/auth";
import { errorEnvelope } from "@/lib/api/error-response";
import {
  getDailyByModel,
  getModelMetaByModelId,
  refreshModelUsageFromStore,
} from "@/lib/model-usage";
import { buildModelTrend, rollUpModels } from "@/lib/llm/derive";
import { PUBLIC_MIN_EVENTS } from "@/lib/llm/types";

export const runtime = "nodejs";
export const revalidate = 60;

const READ_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ modelId: string }> },
) {
  const params = await ctx.params;
  const modelId = decodeURIComponent(params.modelId);
  await refreshModelUsageFromStore();

  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get('days'), 7, 90, 30);
  const internal = isInternal(request);

  const byModel = getDailyByModel();
  const trend = buildModelTrend(byModel, modelId, days);
  const totals = rollUpModels(byModel, days).find((m) => m.model === modelId);

  if (!totals) {
    return NextResponse.json(errorEnvelope('not_found'), { status: 404 });
  }
  if (!internal && totals.events < PUBLIC_MIN_EVENTS) {
    return NextResponse.json(errorEnvelope('not_found'), { status: 404 });
  }

  return NextResponse.json(
    {
      model: modelId,
      window_days: days,
      meta: getModelMetaByModelId(modelId) ?? null,
      totals,
      trend,
    },
    { headers: READ_HEADERS },
  );
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
