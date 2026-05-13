// TOOLBOX read adapter — Hugging Face (models / spaces / datasets)
//
// Phase A.2 continuation. Shapes TOOLBOX leaderboard events for the three
// HF signal types into the legacy file shapes that the local readers
// (huggingface.ts, hf-spaces.ts, hf-datasets.ts) cache. Each fetcher
// returns the file shape or `null` on any failure so callers can fall
// through to the legacy data-store path without throwing.
//
// FIELD COVERAGE CAVEATS (TOOLBOX events vs legacy scrape files):
//   - `url` is reconstructed from `id`: https://huggingface.co/{id} for
//     models, /spaces/{id} for spaces, /datasets/{id} for datasets.
//   - `createdAt` / `lastModified` are not transmitted by the upstream
//     ingest. lastModified falls back to event.produced_at; createdAt
//     stays null. The scoring pipeline treats null lastModified as
//     "unknown freshness" → no recency boost.
//   - `libraryName` (models) is not transmitted → null. UI handles null.
//   - `models[]` (spaces ↔ models join) is not transmitted → []. The
//     cross-domain `avgModelMomentum` resolver will leave the score
//     component renormalized away, same as the data-store path.
//   - HF API sometimes omits `trending_score` upstream — events arrive
//     with the field absent in ~35-55% of rows depending on signal type.
//     Mapped to 0 when absent so the scoring pipeline can still rank.
//
// The flag-gating + alert-on-fallthrough wiring lives in the per-source
// reader (huggingface.ts / hf-spaces.ts / hf-datasets.ts), matching the
// existing toolbox-store.ts pattern.

import "server-only";

import type { HfDatasetRaw, HfDatasetsFile } from "./hf-datasets";
import type { HfSpaceRaw, HfSpacesFile } from "./hf-spaces";
import type { HfModelRaw, HfTrendingFile } from "./huggingface";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import {
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "./toolbox-store-common";

function toIso(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// ---------------------------------------------------------------------------
// Hugging Face models — trending.huggingface.models
// ---------------------------------------------------------------------------

function eventToHfModel(event: ToolboxEvent): HfModelRaw | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const id = stringOr(f.id, "");
  if (!id) return null;
  const rank = typeof f.rank === "number" ? f.rank : undefined;
  return {
    rank,
    id,
    author: stringOr(f.author, ""),
    url: `https://huggingface.co/${id}`,
    downloads: numberOr(f.downloads, 0),
    likes: numberOr(f.likes, 0),
    trendingScore: numberOr(f.trending_score, 0),
    pipelineTag: typeof f.pipeline_tag === "string" ? f.pipeline_tag : null,
    libraryName: null,
    tags: stringArray(f.tags),
    createdAt: null,
    lastModified: event.produced_at ?? null,
  };
}

export async function fetchHfModelsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<HfTrendingFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.huggingface.models");
  if (!body) return null;

  const models: HfModelRaw[] = [];
  for (const ev of body.targets) {
    const m = eventToHfModel(ev);
    if (m) models.push(m);
  }
  // Preserve rank order when present; otherwise keep API order.
  models.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "toolbox:trending.huggingface.models",
    count: models.length,
    models,
  };
}

// ---------------------------------------------------------------------------
// Hugging Face spaces — trending.huggingface.spaces
// ---------------------------------------------------------------------------

function eventToHfSpace(event: ToolboxEvent): HfSpaceRaw | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const id = stringOr(f.id, "");
  if (!id) return null;
  const rank = typeof f.rank === "number" ? f.rank : undefined;
  return {
    rank,
    id,
    author: stringOr(f.author, ""),
    url: `https://huggingface.co/spaces/${id}`,
    likes: numberOr(f.likes, 0),
    trendingScore: numberOr(f.trending_score, 0),
    sdk: typeof f.sdk === "string" ? f.sdk : null,
    tags: stringArray(f.tags),
    createdAt: null,
    lastModified: event.produced_at ?? null,
    models: [],
  };
}

export async function fetchHfSpacesFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<HfSpacesFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.huggingface.spaces");
  if (!body) return null;

  const spaces: HfSpaceRaw[] = [];
  for (const ev of body.targets) {
    const s = eventToHfSpace(ev);
    if (s) spaces.push(s);
  }
  spaces.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "toolbox:trending.huggingface.spaces",
    count: spaces.length,
    spaces,
  };
}

// ---------------------------------------------------------------------------
// Hugging Face datasets — trending.huggingface.datasets
// ---------------------------------------------------------------------------

function eventToHfDataset(event: ToolboxEvent): HfDatasetRaw | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const id = stringOr(f.id, "");
  if (!id) return null;
  const rank = typeof f.rank === "number" ? f.rank : undefined;
  return {
    rank,
    id,
    author: stringOr(f.author, ""),
    url: `https://huggingface.co/datasets/${id}`,
    downloads: numberOr(f.downloads, 0),
    likes: numberOr(f.likes, 0),
    trendingScore: numberOr(f.trending_score, 0),
    tags: stringArray(f.tags),
    createdAt: null,
    lastModified: event.produced_at ?? null,
  };
}

export async function fetchHfDatasetsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<HfDatasetsFile | null> {
  const body = await fetchLeaderboardEvents(
    opts,
    "trending.huggingface.datasets",
  );
  if (!body) return null;

  const datasets: HfDatasetRaw[] = [];
  for (const ev of body.targets) {
    const d = eventToHfDataset(ev);
    if (d) datasets.push(d);
  }
  datasets.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  return {
    fetchedAt: toIso(maxProducedAtMs(body.targets)),
    source: "toolbox:trending.huggingface.datasets",
    count: datasets.length,
    datasets,
  };
}
