// Hugging Face models — trending-side reader.
//
// Reads the `huggingface-trending` payload from the data-store (Redis →
// bundled file → memory) and surfaces the top models scored through the
// new domain pipeline (`hfModelScorer` + `computeCrossDomainMomentum`).
//
// Mirrors the lib/hackernews-trending.ts shape: bundled JSON seeds the
// in-memory cache; refreshHfModelsFromStore() swaps in a fresh Redis
// payload with a 30s rate-limit + in-flight dedupe and never throws.
//
// COLD-START LIMITATION (Chunk E MVP)
//   The HF scraper currently captures a SNAPSHOT (downloads, likes) per
//   run, not deltas. The hf-model scorer wants `downloads7d` + `likes7dAgo`
//   to drive its weeklyDownloadsCapped + likesVelocity components.
//   Until Chunk C ships delta tracking we pass the snapshot `downloads`
//   through as `downloads7d` (log-scaled, so still differentiates hot
//   from cold) and leave `likes7dAgo` undefined so the likesVelocity
//   component is dropped + renormalized away. Documented for reviewer.
//   When Chunk C adds delta tracking, populate the new fields here.

import hfTrendingData from "../../data/huggingface-trending.json";
import { hfModelScorer, type HfModelItem } from "./pipeline/scoring/domain/hf-model";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type { DomainItem, DomainKey, ScoredItem } from "./pipeline/scoring/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape produced by scripts/scrape-huggingface.mjs. */
export interface HfModelRaw {
  rank?: number;
  id: string; // "owner/name"
  author: string;
  url: string;
  downloads: number;
  likes: number;
  trendingScore: number;
  pipelineTag: string | null;
  libraryName: string | null;
  tags: string[];
  createdAt: string | null;
  lastModified: string | null;
}

export interface HfTrendingFile {
  fetchedAt: string;
  source: string;
  count: number;
  models: HfModelRaw[];
}

/** Scored shape — raw fields + score components surfaced for UI. */
export interface HfModelTrending extends HfModelRaw {
  rawScore: number; // 0..100
  momentum: number; // 0..100 (per-domain percentile)
  primaryMetric: { name: string; value: number; label: string };
  explanation: string;
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let trendingFile: HfTrendingFile = hfTrendingData as unknown as HfTrendingFile;

export function getHfTrendingFile(): HfTrendingFile {
  return trendingFile;
}

// ---------------------------------------------------------------------------
// Scoring + ranking
// ---------------------------------------------------------------------------

function rawToScorerItem(raw: HfModelRaw): HfModelItem {
  // Cold-start: pass `downloads` (snapshot) as `downloads7d`. Log-scaled
  // weeklyDownloadsCappedScore still surfaces the right ordering. Once
  // delta tracking lands, replace with the actual 7d delta.
  return {
    domainKey: "hf-model",
    id: raw.id,
    joinKeys: { hfModelId: raw.id },
    downloads7d: Math.max(0, raw.downloads ?? 0),
    likes: Math.max(0, raw.likes ?? 0),
    // likes7dAgo intentionally undefined — likesVelocity component is
    // dropped + renormalized away for the MVP. See header comment.
    lastModified: raw.lastModified ?? raw.createdAt ?? undefined,
  };
}

/**
 * Score every model in the current cache, rank by post-cross-domain
 * momentum (descending), and return the top `limit`. Pure — safe to
 * call from server components.
 */
export function getHfModelsTrending(limit = 100): HfModelTrending[] {
  const raws = trendingFile.models ?? [];
  if (raws.length === 0) return [];

  const items = raws.map(rawToScorerItem);
  const scored = hfModelScorer.computeRaw(items);

  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["hf-model", scored as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("hf-model") ?? [];

  // ranked preserves input order — splice the raw fields back in by index.
  const enriched: HfModelTrending[] = ranked.map((s, i) => ({
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
// Refresh hook — pull latest huggingface-trending payload from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors trending.ts:190-230.
// ---------------------------------------------------------------------------

let inflight: Promise<{ huggingface: { source: string; ageMs: number } }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshHfModelsFromStore(): Promise<{
  huggingface: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { huggingface: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<HfTrendingFile>("huggingface-trending");
      if (result.data && result.source !== "missing") {
        trendingFile = result.data;
      }
      lastRefreshMs = Date.now();
      return { huggingface: { source: result.source, ageMs: result.ageMs } };
    } catch {
      // Never throw from a refresh hook — keep last-known-good cache.
      lastRefreshMs = Date.now();
      return { huggingface: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
