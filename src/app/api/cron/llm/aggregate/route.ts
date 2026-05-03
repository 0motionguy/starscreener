// lint-allow: no-parsebody — Vercel Cron POST trigger with empty body, no payload to validate.
// Hourly aggregator for LLM usage events.
//
// Pulls events since the saved cursor, joins per-generation_id with the
// gen-meta stream to upgrade estimated → authoritative cost, buckets into
// daily rollups by model and feature, and writes three blobs back to the
// data-store. Trims raw events older than 30 days at the end.
//
// Cursor semantics:
//   - `ss:llm:agg:cursor` holds the last consumed Streams id.
//   - On first run (key missing), we start from '0-0' and back-fill
//     whatever's already in the stream (capped by MAXLEN).
//   - We advance the cursor monotonically. On a transient Redis blip we
//     return early without saving — next run resumes where we left off.
//
// Auth: CRON_SECRET bearer.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";
import { touchDailyAggregates } from "@/lib/llm/aggregate";
import { getStreamHandle } from "@/lib/llm/redis-streams";
import {
  type DailyByFeaturePayload,
  type DailyByFeatureRow,
  type DailyByModelPayload,
  type DailyByModelRow,
  type DailySummaryPayload,
  type DailySummaryRow,
  DAILY_RETENTION_DAYS,
  type LlmEvent,
  type LlmGenMeta,
  LLM_AGG_CURSOR_KEY,
  LLM_AGG_HEARTBEAT_KEY,
  LLM_EVENTS_STREAM,
  LLM_GEN_META_STREAM,
  type ModelMetadataPayload,
  RAW_EVENTS_RETENTION_DAYS,
} from "@/lib/llm/types";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

const EVENT_BATCH = 5_000;
const GEN_META_CAP = 10_000;

interface AggregateResult {
  events_processed: number;
  cursor: string | null;
  trimmed_before: string | null;
  days_touched: number;
}

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  try {
    const result = await runAggregate();
    return NextResponse.json(
      { ok: true as const, ...result },
      { headers: NO_STORE },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:llm:aggregate] failed", err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

async function runAggregate(): Promise<AggregateResult> {
  const stream = await getStreamHandle();
  if (!stream) {
    const result = { events_processed: 0, cursor: null, trimmed_before: null, days_touched: 0 };
    const store = getDataStore();
    await Promise.all([
      touchDailyAggregates(store),
      writeAggregateHeartbeat(store, result),
    ]).catch((err: unknown) => {
      console.warn("[api:cron:llm:aggregate] no-stream heartbeat failed:", err);
    });
    return result;
  }

  // 1. Cursor — '0-0' on first run.
  const cursor = (await stream.get(LLM_AGG_CURSOR_KEY)) ?? '0-0';

  // 2. Pull all events since cursor (loop until empty).
  const events: LlmEvent[] = [];
  // We use exclusive start `(${cursor}` so we don't reprocess the previous
  // batch's last id. Redis Streams supports exclusive ranges via the
  // '(' prefix as of 6.2.
  let scanStart = cursor === '0-0' ? '0-0' : `(${cursor}`;
  let lastId = cursor;
  while (true) {
    const batch = await stream.xrange(LLM_EVENTS_STREAM, scanStart, '+', EVENT_BATCH);
    if (batch.length === 0) break;
    for (const entry of batch) {
      const raw = entry.fields.e;
      if (!raw) continue;
      try {
        events.push(JSON.parse(raw) as LlmEvent);
      } catch {
        // Skip malformed events — never throw out of the aggregator.
      }
      lastId = entry.id;
    }
    if (batch.length < EVENT_BATCH) break;
    scanStart = `(${lastId}`;
  }

  if (events.length === 0) {
    const result = { events_processed: 0, cursor, trimmed_before: null, days_touched: 0 };
    const store = getDataStore();
    await touchDailyAggregates(store);
    await writeAggregateHeartbeat(store, result);
    return result;
  }

  // 3. Build gen-meta lookup map (one full sweep, capped).
  const genMetaMap = new Map<string, LlmGenMeta>();
  const genMetaBatch = await stream.xrange(LLM_GEN_META_STREAM, '-', '+', GEN_META_CAP);
  for (const entry of genMetaBatch) {
    const raw = entry.fields.e;
    if (!raw) continue;
    try {
      const meta = JSON.parse(raw) as LlmGenMeta;
      if (meta.generation_id) genMetaMap.set(meta.generation_id, meta);
    } catch {
      /* skip */
    }
  }

  // 4. Pricing table for cost estimation when gen-meta is unavailable.
  const store = getDataStore();
  const modelMeta = (await store.read<ModelMetadataPayload>('llm-model-metadata')).data;
  const priceByModel = buildPriceLookup(modelMeta);

  // 5. Bucket events into per-day per-model and per-day per-feature buckets.
  type Bucket = {
    events: number;
    errors: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_estimated_count: number;
    latencies: number[];
  };
  const byModel = new Map<string, Bucket & { day: string; model: string; provider: LlmEvent['provider'] }>();
  const byFeature = new Map<string, Bucket & { day: string; feature: LlmEvent['feature'] }>();
  const summary = new Map<string, Bucket & { day: string; modelsActive: Set<string> }>();

  for (const evt of events) {
    const day = dayUtc(evt.created_at);
    if (!day) continue;

    // Cost reconcile
    const meta = evt.openrouter_generation_id
      ? genMetaMap.get(evt.openrouter_generation_id)
      : undefined;
    let cost = 0;
    let estimated = false;
    if (meta && typeof meta.cost_usd === 'number') {
      cost = meta.cost_usd;
    } else if (evt.cost_usd !== null && evt.cost_usd !== undefined) {
      cost = evt.cost_usd;
      estimated = evt.cost_estimated;
    } else {
      const price = priceByModel.get(evt.model);
      if (price) {
        cost =
          (evt.input_tokens / 1_000_000) * price.input
          + (evt.output_tokens / 1_000_000) * price.output;
        estimated = true;
      } else {
        cost = 0;
        estimated = true;
      }
    }

    const isError = evt.status === 'error';
    const lat = evt.latency_ms;

    // by-model bucket
    const mKey = `${day}|${evt.model}`;
    let mBucket = byModel.get(mKey);
    if (!mBucket) {
      mBucket = {
        day,
        model: evt.model,
        provider: evt.provider,
        events: 0,
        errors: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        cost_estimated_count: 0,
        latencies: [],
      };
      byModel.set(mKey, mBucket);
    }
    accumulate(mBucket, evt, cost, estimated, lat, isError);

    // by-feature bucket
    const fKey = `${day}|${evt.feature}`;
    let fBucket = byFeature.get(fKey);
    if (!fBucket) {
      fBucket = {
        day,
        feature: evt.feature,
        events: 0,
        errors: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        cost_estimated_count: 0,
        latencies: [],
      };
      byFeature.set(fKey, fBucket);
    }
    accumulate(fBucket, evt, cost, estimated, lat, isError);

    // summary bucket
    let sBucket = summary.get(day);
    if (!sBucket) {
      sBucket = {
        day,
        modelsActive: new Set<string>(),
        events: 0,
        errors: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        cost_estimated_count: 0,
        latencies: [],
      };
      summary.set(day, sBucket);
    }
    accumulate(sBucket, evt, cost, estimated, lat, isError);
    sBucket.modelsActive.add(evt.model);
  }

  // 6. Merge with existing daily rows; replace touched days, drop expired ones.
  const cutoff = isoMinusDays(new Date().toISOString(), DAILY_RETENTION_DAYS);

  const existingByModel = (await store.read<DailyByModelPayload>('llm-daily-by-model')).data?.rows ?? [];
  const existingByFeature = (await store.read<DailyByFeaturePayload>('llm-daily-by-feature')).data?.rows ?? [];
  const existingSummary = (await store.read<DailySummaryPayload>('llm-daily-summary')).data?.rows ?? [];

  const touchedDays = new Set([
    ...byModel.values().map((b) => b.day),
    ...byFeature.values().map((b) => b.day),
    ...summary.values().map((b) => b.day),
  ]);

  const newByModel: DailyByModelRow[] = [
    ...existingByModel.filter((r) => r.day >= cutoff && !touchedKey(touchedDays, r.day, byModel, (b) => b.day === r.day && b.model === r.model)),
    ...[...byModel.values()].map(toByModelRow),
  ].sort(byDayDesc);

  const newByFeature: DailyByFeatureRow[] = [
    ...existingByFeature.filter((r) => r.day >= cutoff && !touchedKey(touchedDays, r.day, byFeature, (b) => b.day === r.day && b.feature === r.feature)),
    ...[...byFeature.values()].map(toByFeatureRow),
  ].sort(byDayDesc);

  const newSummary: DailySummaryRow[] = [
    ...existingSummary.filter((r) => r.day >= cutoff && !touchedDays.has(r.day)),
    ...[...summary.values()].map(toSummaryRow),
  ].sort(byDayDesc);

  await Promise.all([
    store.write<DailyByModelPayload>('llm-daily-by-model', { rows: newByModel }),
    store.write<DailyByFeaturePayload>('llm-daily-by-feature', { rows: newByFeature }),
    store.write<DailySummaryPayload>('llm-daily-summary', { rows: newSummary }),
  ]);

  // 7. Trim raw events older than RAW_EVENTS_RETENTION_DAYS (best effort).
  const trimBefore = `${Date.now() - RAW_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000}-0`;
  await stream.xtrim(LLM_EVENTS_STREAM, { minIdApprox: trimBefore }).catch((err: unknown) => {
    console.warn('[api:cron:llm:aggregate] xtrim failed:', err);
  });

  // 8. Save cursor.
  await stream.set(LLM_AGG_CURSOR_KEY, lastId);

  const result = {
    events_processed: events.length,
    cursor: lastId,
    trimmed_before: trimBefore,
    days_touched: touchedDays.size,
  };
  await writeAggregateHeartbeat(store, result);
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accumulate(
  bucket: { events: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_estimated_count: number; latencies: number[] },
  evt: LlmEvent,
  cost: number,
  estimated: boolean,
  latency: number,
  isError: boolean,
): void {
  bucket.events += 1;
  if (isError) bucket.errors += 1;
  bucket.input_tokens += evt.input_tokens;
  bucket.output_tokens += evt.output_tokens;
  bucket.total_tokens += evt.input_tokens + evt.output_tokens;
  bucket.cost_usd += cost;
  if (estimated) bucket.cost_estimated_count += 1;
  if (Number.isFinite(latency)) bucket.latencies.push(latency);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx] ?? 0;
}

function toByModelRow(b: { day: string; model: string; provider: LlmEvent['provider']; events: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_estimated_count: number; latencies: number[] }): DailyByModelRow {
  const sorted = [...b.latencies].sort((a, b) => a - b);
  return {
    day: b.day,
    model: b.model,
    provider: b.provider,
    events: b.events,
    errors: b.errors,
    success_rate: b.events === 0 ? 1 : 1 - b.errors / b.events,
    input_tokens: b.input_tokens,
    output_tokens: b.output_tokens,
    total_tokens: b.total_tokens,
    cost_usd: round(b.cost_usd, 6),
    cost_estimated_share: b.events === 0 ? 0 : b.cost_estimated_count / b.events,
    latency_p50_ms: Math.round(quantile(sorted, 0.5)),
    latency_p95_ms: Math.round(quantile(sorted, 0.95)),
  };
}

function toByFeatureRow(b: { day: string; feature: LlmEvent['feature']; events: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_estimated_count: number; latencies: number[] }): DailyByFeatureRow {
  const sorted = [...b.latencies].sort((a, b) => a - b);
  return {
    day: b.day,
    feature: b.feature,
    events: b.events,
    errors: b.errors,
    success_rate: b.events === 0 ? 1 : 1 - b.errors / b.events,
    input_tokens: b.input_tokens,
    output_tokens: b.output_tokens,
    total_tokens: b.total_tokens,
    cost_usd: round(b.cost_usd, 6),
    cost_estimated_share: b.events === 0 ? 0 : b.cost_estimated_count / b.events,
    latency_p50_ms: Math.round(quantile(sorted, 0.5)),
    latency_p95_ms: Math.round(quantile(sorted, 0.95)),
  };
}

function toSummaryRow(b: { day: string; modelsActive: Set<string>; events: number; errors: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; cost_estimated_count: number; latencies: number[] }): DailySummaryRow {
  const sorted = [...b.latencies].sort((a, b) => a - b);
  return {
    day: b.day,
    events: b.events,
    errors: b.errors,
    success_rate: b.events === 0 ? 1 : 1 - b.errors / b.events,
    input_tokens: b.input_tokens,
    output_tokens: b.output_tokens,
    total_tokens: b.total_tokens,
    cost_usd: round(b.cost_usd, 6),
    cost_estimated_share: b.events === 0 ? 0 : b.cost_estimated_count / b.events,
    latency_p50_ms: Math.round(quantile(sorted, 0.5)),
    latency_p95_ms: Math.round(quantile(sorted, 0.95)),
    models_active: b.modelsActive.size,
  };
}

function dayUtc(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function isoMinusDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  return new Date(t - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function round(x: number, places: number): number {
  const m = 10 ** places;
  return Math.round(x * m) / m;
}

function byDayDesc(a: { day: string }, b: { day: string }): number {
  return b.day.localeCompare(a.day);
}

function touchedKey<T>(
  touchedDays: Set<string>,
  day: string,
  bucketMap: Map<string, T>,
  matches: (b: T) => boolean,
): boolean {
  if (!touchedDays.has(day)) return false;
  for (const b of bucketMap.values()) if (matches(b)) return true;
  return false;
}

function buildPriceLookup(payload: ModelMetadataPayload | null): Map<string, { input: number; output: number }> {
  const out = new Map<string, { input: number; output: number }>();
  if (!payload) return out;
  for (const m of payload.models) {
    out.set(m.model_id, {
      input: m.input_price_per_million,
      output: m.output_price_per_million,
    });
  }
  return out;
}

async function writeAggregateHeartbeat(
  store: ReturnType<typeof getDataStore>,
  result: AggregateResult,
): Promise<void> {
  await store.write(
    LLM_AGG_HEARTBEAT_KEY,
    {
      lastRunAt: new Date().toISOString(),
      eventsProcessed: result.events_processed,
      cursor: result.cursor,
      daysTouched: result.days_touched,
      trimmedBefore: result.trimmed_before,
    },
    { writer: "cron:llm-aggregate" },
  );
}
