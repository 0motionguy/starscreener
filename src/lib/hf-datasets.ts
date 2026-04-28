// Hugging Face datasets — trending-side reader.
//
// Reads the `huggingface-datasets` payload from the data-store (Redis →
// bundled file → memory) and surfaces the top datasets scored through the
// new domain pipeline (`hfDatasetScorer` + `computeCrossDomainMomentum`).
//
// Mirrors lib/huggingface.ts shape: bundled JSON seeds the in-memory
// cache; refreshHfDatasetsFromStore() swaps in a fresh Redis payload with
// a 30s rate-limit + in-flight dedupe and never throws.
//
// COLD-START LIMITATIONS (Chunk E MVP — to be addressed by later chunks)
//   1. The HF dataset scraper currently captures a SNAPSHOT (downloads,
//      likes) per run, not deltas. The hf-dataset scorer wants
//      `downloads7d` + `likes7dAgo` to drive its weeklyDownloadsCapped +
//      likesVelocity components. Until the delta-tracking chunk ships,
//      we pass the snapshot `downloads` through as `downloads7d`
//      (log-scaled, so still differentiates hot from cold) and leave
//      `likes7dAgo` undefined so the likesVelocity component is dropped
//      and renormalized away. When delta tracking lands, populate the
//      new fields here.
//   2. `citationCount` is left undefined for now. Chunk D's cross-domain
//      join resolver will populate this from arXiv refs / model-card
//      cross-links. The citationCount weight (0.10) renormalizes away
//      until then.
//
// Document each cold-start fallback inline so the next chunk knows what
// to populate.

import hfDatasetsData from "../../data/huggingface-datasets.json";
import {
  hfDatasetScorer,
  type HfDatasetItem,
} from "./pipeline/scoring/domain/hf-dataset";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type {
  DomainItem,
  DomainKey,
  ScoredItem,
} from "./pipeline/scoring/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape produced by scripts/scrape-huggingface-datasets.mjs. */
export interface HfDatasetRaw {
  rank?: number;
  id: string; // "owner/name"
  author: string;
  url: string;
  downloads: number;
  likes: number;
  trendingScore: number;
  tags: string[];
  createdAt: string | null;
  lastModified: string | null;
}

export interface HfDatasetsFile {
  fetchedAt: string;
  source: string;
  count: number;
  datasets: HfDatasetRaw[];
}

/** Scored shape — raw fields + score components surfaced for UI. */
export interface HfDatasetTrending extends HfDatasetRaw {
  rawScore: number; // 0..100
  momentum: number; // 0..100 (per-domain percentile)
  primaryMetric: { name: string; value: number; label: string };
  explanation: string;
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let datasetsFile: HfDatasetsFile = hfDatasetsData as unknown as HfDatasetsFile;

export function getHfDatasetsFile(): HfDatasetsFile {
  return datasetsFile;
}

// ---------------------------------------------------------------------------
// Scoring + ranking
// ---------------------------------------------------------------------------

function rawToScorerItem(raw: HfDatasetRaw): HfDatasetItem {
  // COLD-START: pass `downloads` (snapshot) as `downloads7d`. Log-scaled
  // weeklyDownloadsCappedScore still surfaces the right ordering. Once
  // delta tracking lands, replace with the actual 7d delta.
  //
  // COLD-START: `likes7dAgo` intentionally undefined — likesVelocity
  // component is dropped + renormalized away for the MVP.
  //
  // COLD-START: `citationCount` intentionally undefined — Chunk D's join
  // resolver will populate from arXiv refs / model-card cross-links.
  return {
    domainKey: "hf-dataset",
    id: raw.id,
    joinKeys: { hfModelId: raw.id }, // re-use hfModelId join slot for HF entities
    downloads7d: Math.max(0, raw.downloads ?? 0),
    likes: Math.max(0, raw.likes ?? 0),
    lastModified: raw.lastModified ?? raw.createdAt ?? undefined,
  };
}

/**
 * Score every dataset in the current cache, rank by post-cross-domain
 * momentum (descending), and return the top `limit`. Pure — safe to
 * call from server components.
 */
export function getHfDatasetsTrending(limit = 100): HfDatasetTrending[] {
  const raws = datasetsFile.datasets ?? [];
  if (raws.length === 0) return [];

  const items = raws.map(rawToScorerItem);
  const scored = hfDatasetScorer.computeRaw(items);

  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["hf-dataset", scored as ScoredItem<DomainItem>[]],
  ]);
  const ranked =
    computeCrossDomainMomentum(perDomain).get("hf-dataset") ?? [];

  // ranked preserves input order — splice the raw fields back in by index.
  const enriched: HfDatasetTrending[] = ranked.map((s, i) => ({
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
// Refresh hook — pull latest huggingface-datasets payload from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors huggingface.ts.
// ---------------------------------------------------------------------------

let inflight: Promise<{
  huggingfaceDatasets: { source: string; ageMs: number };
}> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshHfDatasetsFromStore(): Promise<{
  huggingfaceDatasets: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { huggingfaceDatasets: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<HfDatasetsFile>(
        "huggingface-datasets",
      );
      if (result.data && result.source !== "missing") {
        datasetsFile = result.data;
      }
      lastRefreshMs = Date.now();
      return {
        huggingfaceDatasets: { source: result.source, ageMs: result.ageMs },
      };
    } catch {
      // Never throw from a refresh hook — keep last-known-good cache.
      lastRefreshMs = Date.now();
      return { huggingfaceDatasets: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
