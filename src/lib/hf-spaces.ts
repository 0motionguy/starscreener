// Hugging Face spaces — trending-side reader.
//
// Reads the `huggingface-spaces` payload from the data-store (Redis →
// bundled file → memory) and surfaces the top spaces scored through the
// new domain pipeline (`hfSpaceScorer` + `computeCrossDomainMomentum`).
//
// Mirrors lib/huggingface.ts shape: bundled JSON seeds the in-memory
// cache; refreshHfSpacesFromStore() swaps in a fresh Redis payload with
// a 30s rate-limit + in-flight dedupe and never throws.
//
// COLD-START LIMITATIONS (Chunk E MVP — to be addressed by later chunks)
//   1. The HF public spaces list endpoint does NOT expose API call counts.
//      `apiCalls7d` is left undefined — the apiCalls7d component (0.35
//      weight) renormalizes away for the MVP. A future chunk that
//      ingests HF API analytics (or a usage-counter scrape) should
//      populate this.
//   2. `likes` is a snapshot, `likes7dAgo` is undefined — likesVelocity
//      component drops + renormalizes away. Same delta-tracking chunk as
//      datasets/models will populate this.
//   3. `modelCount` is computed locally from `raw.models?.length ?? 0`
//      and `modelsUsed` is the raw array (or [] when HF omits it).
//   4. `avgModelMomentum` is left undefined — Chunk D's cross-domain join
//      resolver will populate this by looking up momentum scores for
//      each model id in `modelsUsed` against the hf-model domain.
//
// Document each cold-start fallback inline so the next chunk knows what
// to populate.

import hfSpacesData from "../../data/huggingface-spaces.json";
import {
  hfSpaceScorer,
  type HfSpaceItem,
} from "./pipeline/scoring/domain/hf-space";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type {
  DomainItem,
  DomainKey,
  ScoredItem,
} from "./pipeline/scoring/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape produced by scripts/scrape-huggingface-spaces.mjs. */
export interface HfSpaceRaw {
  rank?: number;
  id: string; // "owner/name"
  author: string;
  url: string;
  likes: number;
  trendingScore: number;
  sdk: string | null;
  tags: string[];
  createdAt: string | null;
  lastModified: string | null;
  models: string[]; // spaces↔models join key (Chunk D resolver consumes)
}

export interface HfSpacesFile {
  fetchedAt: string;
  source: string;
  count: number;
  spaces: HfSpaceRaw[];
}

/** Scored shape — raw fields + score components surfaced for UI. */
export interface HfSpaceTrending extends HfSpaceRaw {
  rawScore: number; // 0..100
  momentum: number; // 0..100 (per-domain percentile)
  primaryMetric: { name: string; value: number; label: string };
  explanation: string;
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let spacesFile: HfSpacesFile = hfSpacesData as unknown as HfSpacesFile;

export function getHfSpacesFile(): HfSpacesFile {
  return spacesFile;
}

// ---------------------------------------------------------------------------
// Scoring + ranking
// ---------------------------------------------------------------------------

function rawToScorerItem(raw: HfSpaceRaw): HfSpaceItem {
  // COLD-START: HF spaces public list endpoint does not expose API call
  // counts. apiCalls7d intentionally undefined — the apiCalls7d
  // component (0.35) is dropped and renormalized away. Future chunk that
  // ingests HF analytics should populate this.
  //
  // COLD-START: `likes7dAgo` intentionally undefined — likesVelocity
  // component drops out for MVP.
  //
  // COLD-START: `avgModelMomentum` intentionally undefined — Chunk D's
  // join resolver will populate by looking up momentum for each
  // `modelsUsed` id against the hf-model domain.
  const models = Array.isArray(raw.models) ? raw.models : [];
  return {
    domainKey: "hf-space",
    id: raw.id,
    joinKeys: { hfModelId: raw.id }, // re-use hfModelId slot for HF entities
    likes: Math.max(0, raw.likes ?? 0),
    modelCount: models.length,
    modelsUsed: models,
    lastModified: raw.lastModified ?? raw.createdAt ?? undefined,
  };
}

/**
 * Score every space in the current cache, rank by post-cross-domain
 * momentum (descending), and return the top `limit`. Pure — safe to
 * call from server components.
 */
export function getHfSpacesTrending(limit = 100): HfSpaceTrending[] {
  const raws = spacesFile.spaces ?? [];
  if (raws.length === 0) return [];

  const items = raws.map(rawToScorerItem);
  const scored = hfSpaceScorer.computeRaw(items);

  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["hf-space", scored as ScoredItem<DomainItem>[]],
  ]);
  const ranked =
    computeCrossDomainMomentum(perDomain).get("hf-space") ?? [];

  // ranked preserves input order — splice the raw fields back in by index.
  const enriched: HfSpaceTrending[] = ranked.map((s, i) => ({
    ...raws[i],
    rawScore: s.rawScore,
    momentum: s.momentum,
    primaryMetric: s.primaryMetric,
    explanation: s.explanation,
  }));

  enriched.sort((a, b) => b.momentum - a.momentum);
  if (enriched.length <= limit) return enriched;
  return enriched.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Refresh hook — pull latest huggingface-spaces payload from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors huggingface.ts.
// ---------------------------------------------------------------------------

let inflight: Promise<{
  huggingfaceSpaces: { source: string; ageMs: number };
}> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshHfSpacesFromStore(): Promise<{
  huggingfaceSpaces: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { huggingfaceSpaces: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<HfSpacesFile>(
        "huggingface-spaces",
      );
      if (result.data && result.source !== "missing") {
        spacesFile = result.data;
      }
      lastRefreshMs = Date.now();
      return {
        huggingfaceSpaces: { source: result.source, ageMs: result.ageMs },
      };
    } catch {
      // Never throw from a refresh hook — keep last-known-good cache.
      lastRefreshMs = Date.now();
      return { huggingfaceSpaces: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
