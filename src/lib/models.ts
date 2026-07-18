// Public LLM model catalog — the data behind the `/models` leaderboard.
//
// Reads the `llm-model-metadata` payload (ModelMeta[]) through the shared
// three-tier data-store (Redis -> bundled data/llm-model-metadata.json ->
// in-memory last-known-good). The SAME Redis blob is synced live in
// production from OpenRouter (~368 models) by /api/cron/llm/sync-models —
// the bundled file is only the cold-start / fallback seed (a curated set of
// notable models). Follows the refresh-then-sync-getter convention (see
// src/lib/trending.ts): route/RSC calls `refreshModelsFromStore()` once at
// the top, then the sync getters return whatever's in the in-memory cache.
//
// Distinct from src/lib/model-usage.ts, which is the ADMIN telemetry surface
// (our own LLM spend). This module is the PUBLIC model catalog.

import modelSeed from "../../data/llm-model-metadata.json";
import type { ModelMeta, ModelMetadataPayload } from "./llm/types";

const EMPTY: ModelMetadataPayload = { syncedAt: "", models: [] };

let cache: ModelMetadataPayload =
  (modelSeed as unknown as ModelMetadataPayload) ?? EMPTY;
let lastSource = "seed";
let lastAgeMs = 0;

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest `llm-model-metadata` payload from the data-store.
 * 30s rate-limit + in-flight dedupe + never throws (mirrors trending.ts).
 */
export async function refreshModelsFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<ModelMetadataPayload>(
        "llm-model-metadata",
      );
      if (
        result.data &&
        result.source !== "missing" &&
        Array.isArray(result.data.models) &&
        result.data.models.length > 0
      ) {
        cache = result.data;
        lastSource = result.source;
        lastAgeMs = result.ageMs;
      }
      lastRefreshMs = Date.now();
      return { source: result.source, ageMs: result.ageMs };
    } catch {
      lastRefreshMs = Date.now();
      return { source: lastSource, ageMs: lastAgeMs };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function getModels(): ModelMeta[] {
  return cache.models;
}

export function getModelsSyncedAt(): string {
  return cache.syncedAt;
}

export function getModelById(modelId: string): ModelMeta | undefined {
  return cache.models.find((m) => m.model_id === modelId);
}

// Pure derived helpers (valueScore / filterModels / sortModels / listProviders)
// live in ./models-view — a client-safe module with no data-store reachability.
// Re-exported so server callers and unit tests keep this single import path.
export * from "./models-view";
