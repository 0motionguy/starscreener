// GET /api/model-usage/rankings?metric=usage|cost|latency|reliability
//
// Sorted ranking list — the "Most used / Cheapest / Fastest / Most reliable"
// boards. Public-safe: respects the min-event threshold via applyPublicGate.

import { NextRequest, NextResponse } from "next/server";

import { verifyAdminAuth } from "@/lib/api/auth";
import { getDailyByModel, refreshModelUsageFromStore } from "@/lib/model-usage";
import { applyPublicGate, type ModelRollup, rollUpModels } from "@/lib/llm/derive";

export const runtime = "nodejs";
export const revalidate = 60;

const READ_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

type RankMetric = 'usage' | 'cost' | 'latency' | 'reliability';

const METRIC_PICKERS: Record<RankMetric, (m: ModelRollup) => number> = {
  usage: (m) => m.events,
  cost: (m) => m.cost_usd,
  latency: (m) => m.latency_p95_ms,
  reliability: (m) => m.success_rate,
};
const METRIC_DESC: Record<RankMetric, boolean> = {
  usage: true,
  cost: false, // cheapest first
  latency: false, // fastest first
  reliability: true,
};

export async function GET(request: NextRequest) {
  await refreshModelUsageFromStore();
  const url = new URL(request.url);
  const metric = parseMetric(url.searchParams.get('metric'));
  const internal = isInternal(request);
  const days = clampInt(url.searchParams.get('days'), 1, 30, 1);
  const limit = clampInt(url.searchParams.get('limit'), 1, 50, 10);

  const rollup = applyPublicGate(rollUpModels(getDailyByModel(), days), { internal });
  const pick = METRIC_PICKERS[metric];
  const desc = METRIC_DESC[metric];

  // Filter out the synthetic 'other' bucket from a rank list — it has no
  // meaningful per-model attribution.
  const rankable = rollup.filter((m) => m.model !== 'other');
  const sorted = [...rankable].sort((a, b) => (desc ? pick(b) - pick(a) : pick(a) - pick(b)));
  const ranked = sorted.slice(0, limit).map((m, i) => ({
    rank: i + 1,
    model: m.model,
    provider: m.provider,
    value: round(pick(m), 6),
    events: m.events,
  }));

  return NextResponse.json(
    { metric, window_days: days, rankings: ranked },
    { headers: READ_HEADERS },
  );
}

function parseMetric(raw: string | null): RankMetric {
  if (raw === 'cost' || raw === 'latency' || raw === 'reliability') return raw;
  return 'usage';
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

function round(x: number, places: number): number {
  const m = 10 ** places;
  return Math.round(x * m) / m;
}
