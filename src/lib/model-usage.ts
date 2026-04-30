// Model-usage data layer — refresh-then-read pattern over the data-store.
//
// Mirrors src/lib/trending.ts: an async refresh hook that pulls the three
// aggregate blobs from Redis with internal 30s rate-limit + in-flight
// dedupe, plus sync getters for downstream readers (server components,
// route handlers).
//
// Three blobs are fetched in parallel:
//   - llm-daily-summary       (DailySummaryPayload)
//   - llm-daily-by-model      (DailyByModelPayload)
//   - llm-daily-by-feature    (DailyByFeaturePayload)
//   - llm-model-metadata      (ModelMetadataPayload) — pricing + capabilities

import type {
  DailyByFeaturePayload,
  DailyByFeatureRow,
  DailyByModelPayload,
  DailyByModelRow,
  DailySummaryPayload,
  DailySummaryRow,
  ModelMeta,
  ModelMetadataPayload,
} from "./llm/types";

const EMPTY_SUMMARY: DailySummaryPayload = { rows: [] };
const EMPTY_BY_MODEL: DailyByModelPayload = { rows: [] };
const EMPTY_BY_FEATURE: DailyByFeaturePayload = { rows: [] };
const EMPTY_METADATA: ModelMetadataPayload = { syncedAt: '', models: [] };

let summary: DailySummaryPayload = EMPTY_SUMMARY;
let byModel: DailyByModelPayload = EMPTY_BY_MODEL;
let byFeature: DailyByFeaturePayload = EMPTY_BY_FEATURE;
let metadata: ModelMetadataPayload = EMPTY_METADATA;

let lastRefreshMs = 0;
let inflight: Promise<RefreshResult> | null = null;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface RefreshResult {
  summary: { source: string; ageMs: number };
  byModel: { source: string; ageMs: number };
  byFeature: { source: string; ageMs: number };
  metadata: { source: string; ageMs: number };
}

/**
 * Pull every aggregate blob from the data-store once. Cheap to call from
 * any server component or route — internal dedupe + rate-limit ensures we
 * hit Redis at most once per 30s per process.
 */
export async function refreshModelUsageFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      summary: { source: 'memory', ageMs: sinceLast },
      byModel: { source: 'memory', ageMs: sinceLast },
      byFeature: { source: 'memory', ageMs: sinceLast },
      metadata: { source: 'memory', ageMs: sinceLast },
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const { getDataStore } = await import('./data-store');
    const store = getDataStore();
    const [s, m, f, md] = await Promise.all([
      store.read<DailySummaryPayload>('llm-daily-summary'),
      store.read<DailyByModelPayload>('llm-daily-by-model'),
      store.read<DailyByFeaturePayload>('llm-daily-by-feature'),
      store.read<ModelMetadataPayload>('llm-model-metadata'),
    ]);
    if (s.data && s.source !== 'missing') summary = s.data;
    if (m.data && m.source !== 'missing') byModel = m.data;
    if (f.data && f.source !== 'missing') byFeature = f.data;
    if (md.data && md.source !== 'missing') metadata = md.data;
    lastRefreshMs = Date.now();
    return {
      summary: { source: s.source, ageMs: s.ageMs },
      byModel: { source: m.source, ageMs: m.ageMs },
      byFeature: { source: f.source, ageMs: f.ageMs },
      metadata: { source: md.source, ageMs: md.ageMs },
    };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ---------------------------------------------------------------------------
// Sync getters
// ---------------------------------------------------------------------------

export function getDailySummary(): DailySummaryRow[] {
  return summary.rows;
}

export function getDailyByModel(): DailyByModelRow[] {
  return byModel.rows;
}

export function getDailyByFeature(): DailyByFeatureRow[] {
  return byFeature.rows;
}

export function getModelMetadata(): ModelMeta[] {
  return metadata.models;
}

export function getModelMetaByModelId(modelId: string): ModelMeta | undefined {
  return metadata.models.find((m) => m.model_id === modelId);
}

/** Test helper — reset every cache to its empty seed. */
export function _resetModelUsageCacheForTests(): void {
  summary = EMPTY_SUMMARY;
  byModel = EMPTY_BY_MODEL;
  byFeature = EMPTY_BY_FEATURE;
  metadata = EMPTY_METADATA;
  lastRefreshMs = 0;
  inflight = null;
}
