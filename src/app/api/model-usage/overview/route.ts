// GET /api/model-usage/overview
//
// Top-line totals for the last 24h: event count, cost, top model, top
// feature, p95 latency, error rate, models active. Public-safe by default;
// `?internal=1` + admin auth surfaces the un-thresholded view including
// raw feature names.

import { NextRequest, NextResponse } from "next/server";

import { verifyAdminAuth } from "@/lib/api/auth";
import {
  getDailyByFeature,
  getDailyByModel,
  getDailySummary,
  refreshModelUsageFromStore,
} from "@/lib/model-usage";
import { applyPublicGate, buildOverview, rollUpFeatures, rollUpModels } from "@/lib/llm/derive";

export const runtime = "nodejs";
export const revalidate = 60;

const READ_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(request: NextRequest) {
  await refreshModelUsageFromStore();
  const internal = isInternal(request);
  const summary = getDailySummary();
  const byModel = getDailyByModel();
  const byFeature = getDailyByFeature();

  const modelRollup = applyPublicGate(rollUpModels(byModel, 1), { internal });
  const featureRollup = rollUpFeatures(byFeature, 1);
  const overview = buildOverview(summary, modelRollup, featureRollup);

  // Hide top_feature on the public surface — feature names are internal.
  const body = internal ? overview : { ...overview, top_feature: null };
  return NextResponse.json(body, { headers: READ_HEADERS });
}

function isInternal(request: NextRequest): boolean {
  const wantsInternal = new URL(request.url).searchParams.get('internal');
  if (wantsInternal !== '1' && wantsInternal !== 'true') return false;
  const verdict = verifyAdminAuth(request);
  return verdict.kind === 'ok';
}
