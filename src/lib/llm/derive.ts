// Shared derivations on top of the daily aggregate rows.
//
// The cron aggregator stores raw daily buckets; the API routes and dashboard
// layer derive 24h / 30d rollups, share-of-total, ranks, and public-threshold
// gates from those buckets here. Keeping the math in one place means the
// dashboard, the rankings endpoint, and the by-model endpoint all agree on
// what "p95 latency" or "usage share" means.

import {
  type DailyByFeatureRow,
  type DailyByModelRow,
  type DailySummaryRow,
  PUBLIC_MIN_EVENTS,
  type LlmFeature,
  type LlmProvider,
  type ModelMeta,
} from "./types";

export interface ModelRollup {
  model: string;
  provider: LlmProvider;
  events: number;
  errors: number;
  success_rate: number;
  cost_usd: number;
  cost_estimated_share: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  share_usage: number;
  share_cost: number;
  ranks: { usage: number; cost: number; latency: number; reliability: number };
}

export interface FeatureRollup {
  feature: LlmFeature;
  events: number;
  errors: number;
  success_rate: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  share_usage: number;
  share_cost: number;
}

export interface OverviewMetrics {
  events_24h: number;
  cost_24h_usd: number;
  cost_estimated_share: number;
  models_active: number;
  top_model: string | null;
  top_feature: LlmFeature | null;
  p95_latency_ms: number;
  error_rate_24h: number;
}

/** Inclusive lower bound for the rolling 24h window (today + yesterday in UTC). */
export function recentDays(rows: { day: string }[], days: number): string[] {
  const today = todayUtc();
  const cutoff = isoMinusDays(today, days - 1);
  const set = new Set(rows.filter((r) => r.day >= cutoff).map((r) => r.day));
  return [...set].sort();
}

/**
 * Sum N most recent days of by-model rows. Used by /overview and /models —
 * the public endpoints answer "what's hot in the last 24h" not the lifetime.
 */
export function rollUpModels(
  rows: DailyByModelRow[],
  days: number,
): ModelRollup[] {
  const today = todayUtc();
  const cutoff = isoMinusDays(today, days - 1);
  const byModel = new Map<string, {
    provider: LlmProvider;
    events: number;
    errors: number;
    cost_usd: number;
    cost_estimated_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    latency_p50_acc: number;
    latency_p95_acc: number;
    daysSeen: number;
  }>();

  let totalEvents = 0;
  let totalCost = 0;
  for (const row of rows) {
    if (row.day < cutoff) continue;
    let bucket = byModel.get(row.model);
    if (!bucket) {
      bucket = {
        provider: row.provider,
        events: 0,
        errors: 0,
        cost_usd: 0,
        cost_estimated_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        latency_p50_acc: 0,
        latency_p95_acc: 0,
        daysSeen: 0,
      };
      byModel.set(row.model, bucket);
    }
    bucket.events += row.events;
    bucket.errors += row.errors;
    bucket.cost_usd += row.cost_usd;
    bucket.cost_estimated_count += Math.round(row.cost_estimated_share * row.events);
    bucket.input_tokens += row.input_tokens;
    bucket.output_tokens += row.output_tokens;
    bucket.total_tokens += row.total_tokens;
    // Quantiles don't add — fall back to a daily-event-weighted mean.
    bucket.latency_p50_acc += row.latency_p50_ms * row.events;
    bucket.latency_p95_acc += row.latency_p95_ms * row.events;
    bucket.daysSeen += 1;
    totalEvents += row.events;
    totalCost += row.cost_usd;
  }

  const list = [...byModel.entries()].map(([model, b]) => ({
    model,
    provider: b.provider,
    events: b.events,
    errors: b.errors,
    success_rate: b.events === 0 ? 1 : 1 - b.errors / b.events,
    cost_usd: round(b.cost_usd, 6),
    cost_estimated_share: b.events === 0 ? 0 : b.cost_estimated_count / b.events,
    input_tokens: b.input_tokens,
    output_tokens: b.output_tokens,
    total_tokens: b.total_tokens,
    latency_p50_ms: b.events === 0 ? 0 : Math.round(b.latency_p50_acc / b.events),
    latency_p95_ms: b.events === 0 ? 0 : Math.round(b.latency_p95_acc / b.events),
    share_usage: totalEvents === 0 ? 0 : b.events / totalEvents,
    share_cost: totalCost === 0 ? 0 : b.cost_usd / totalCost,
    ranks: { usage: 0, cost: 0, latency: 0, reliability: 0 },
  }));

  // Fill ranks. Lower is better for latency (so sort asc) and equally for
  // error rate (we rank by success_rate desc — most reliable = rank 1).
  rankBy(list, (m) => m.events, true, 'usage');
  rankBy(list, (m) => m.cost_usd, true, 'cost');
  rankBy(list, (m) => m.latency_p95_ms, false, 'latency');
  rankBy(list, (m) => m.success_rate, true, 'reliability');

  return list.sort((a, b) => b.events - a.events);
}

export function rollUpFeatures(
  rows: DailyByFeatureRow[],
  days: number,
): FeatureRollup[] {
  const today = todayUtc();
  const cutoff = isoMinusDays(today, days - 1);
  const map = new Map<LlmFeature, {
    events: number;
    errors: number;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    latency_p50_acc: number;
    latency_p95_acc: number;
  }>();

  let totalEvents = 0;
  let totalCost = 0;
  for (const row of rows) {
    if (row.day < cutoff) continue;
    let b = map.get(row.feature);
    if (!b) {
      b = { events: 0, errors: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, latency_p50_acc: 0, latency_p95_acc: 0 };
      map.set(row.feature, b);
    }
    b.events += row.events;
    b.errors += row.errors;
    b.cost_usd += row.cost_usd;
    b.input_tokens += row.input_tokens;
    b.output_tokens += row.output_tokens;
    b.latency_p50_acc += row.latency_p50_ms * row.events;
    b.latency_p95_acc += row.latency_p95_ms * row.events;
    totalEvents += row.events;
    totalCost += row.cost_usd;
  }

  return [...map.entries()].map(([feature, b]) => ({
    feature,
    events: b.events,
    errors: b.errors,
    success_rate: b.events === 0 ? 1 : 1 - b.errors / b.events,
    cost_usd: round(b.cost_usd, 6),
    input_tokens: b.input_tokens,
    output_tokens: b.output_tokens,
    latency_p50_ms: b.events === 0 ? 0 : Math.round(b.latency_p50_acc / b.events),
    latency_p95_ms: b.events === 0 ? 0 : Math.round(b.latency_p95_acc / b.events),
    share_usage: totalEvents === 0 ? 0 : b.events / totalEvents,
    share_cost: totalCost === 0 ? 0 : b.cost_usd / totalCost,
  })).sort((a, b) => b.events - a.events);
}

export function buildOverview(
  summary: DailySummaryRow[],
  modelRollup: ModelRollup[],
  featureRollup: FeatureRollup[],
): OverviewMetrics {
  const today = todayUtc();
  const cutoff = isoMinusDays(today, 0); // 24h = today + yesterday
  const recent = summary.filter((r) => r.day >= isoMinusDays(today, 1));
  const events_24h = recent.reduce((acc, r) => acc + r.events, 0);
  const errors_24h = recent.reduce((acc, r) => acc + r.errors, 0);
  const cost_24h_usd = round(recent.reduce((acc, r) => acc + r.cost_usd, 0), 6);
  const cost_estimated_count = recent.reduce(
    (acc, r) => acc + Math.round(r.cost_estimated_share * r.events),
    0,
  );
  const cost_estimated_share = events_24h === 0 ? 0 : cost_estimated_count / events_24h;
  const p95_latency_ms = recent.length === 0
    ? 0
    : Math.max(...recent.map((r) => r.latency_p95_ms));
  const models_active = recent.length === 0
    ? 0
    : Math.max(...recent.map((r) => r.models_active));
  // Suppress unused-cutoff warning — keep for readability in debug logs.
  void cutoff;

  return {
    events_24h,
    cost_24h_usd,
    cost_estimated_share,
    models_active,
    top_model: modelRollup[0]?.model ?? null,
    top_feature: featureRollup[0]?.feature ?? null,
    p95_latency_ms,
    error_rate_24h: events_24h === 0 ? 0 : errors_24h / events_24h,
  };
}

export interface PublicGateOptions {
  /** Set true for admin/internal callers — disables the threshold collapse. */
  internal: boolean;
}

/**
 * Apply the public anonymization threshold. Models with fewer than
 * PUBLIC_MIN_EVENTS in the rolled-up window collapse into a single 'other'
 * row that aggregates events + cost (but no per-model attribution).
 */
export function applyPublicGate(
  rollups: ModelRollup[],
  opts: PublicGateOptions,
): ModelRollup[] {
  if (opts.internal) return rollups;
  const above: ModelRollup[] = [];
  let otherEvents = 0;
  let otherErrors = 0;
  let otherCost = 0;
  for (const r of rollups) {
    if (r.events >= PUBLIC_MIN_EVENTS) {
      above.push(r);
    } else {
      otherEvents += r.events;
      otherErrors += r.errors;
      otherCost += r.cost_usd;
    }
  }
  if (otherEvents === 0) return above;
  above.push({
    model: 'other',
    provider: 'openrouter',
    events: otherEvents,
    errors: otherErrors,
    success_rate: otherEvents === 0 ? 1 : 1 - otherErrors / otherEvents,
    cost_usd: round(otherCost, 6),
    cost_estimated_share: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    latency_p50_ms: 0,
    latency_p95_ms: 0,
    share_usage: 0,
    share_cost: 0,
    ranks: { usage: 0, cost: 0, latency: 0, reliability: 0 },
  });
  return above;
}

export interface ModelTrendPoint {
  day: string;
  events: number;
  cost_usd: number;
  p95_ms: number;
  error_rate: number;
}

export function buildModelTrend(
  rows: DailyByModelRow[],
  modelId: string,
  days: number,
): ModelTrendPoint[] {
  const today = todayUtc();
  const cutoff = isoMinusDays(today, days - 1);
  return rows
    .filter((r) => r.model === modelId && r.day >= cutoff)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({
      day: r.day,
      events: r.events,
      cost_usd: r.cost_usd,
      p95_ms: r.latency_p95_ms,
      error_rate: r.events === 0 ? 0 : r.errors / r.events,
    }));
}

export function annotateWithMetadata<T extends { model: string }>(
  rollups: T[],
  metadataById: Map<string, ModelMeta>,
): Array<T & { meta: ModelMeta | null }> {
  return rollups.map((r) => ({ ...r, meta: metadataById.get(r.model) ?? null }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rankBy<T>(
  list: T[],
  pick: (item: T) => number,
  desc: boolean,
  key: keyof ModelRollup['ranks'],
): void {
  const sorted = [...list].sort((a, b) => (desc ? pick(b) - pick(a) : pick(a) - pick(b)));
  for (let i = 0; i < sorted.length; i++) {
    const idx = list.indexOf(sorted[i] as T);
    if (idx >= 0) {
      (list[idx] as ModelRollup).ranks[key] = i + 1;
    }
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMinusDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return new Date(t - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function round(x: number, places: number): number {
  const m = 10 ** places;
  return Math.round(x * m) / m;
}
