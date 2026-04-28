// dev.to loader — trending side.
//
// Reads data/devto-trending.json (top-100 articles by velocity score,
// last 7d, discovered via registry-driven popularity/state/tag slices).
// Split from src/lib/devto.ts so client components that only need
// per-repo mention badges don't pull this larger trending JSON into
// their bundle. The future /news dev.to tab imports from here.

import devtoTrendingData from "../../data/devto-trending.json";
import type { DevtoArticle, DevtoBodyFetchMode } from "./devto";

export interface DevtoTrendingFile {
  fetchedAt: string;
  discoveryVersion?: string;
  windowDays: number;
  scannedArticles: number;
  bodyFetchMode: DevtoBodyFetchMode;
  priorityTags?: string[];
  discoverySlices?: Array<{
    id: string;
    label: string;
    tag?: string;
    top?: number;
    state?: "fresh" | "rising" | "all";
  }>;
  sliceCounts?: Record<string, number>;
  articles: DevtoArticle[];
}

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshDevtoTrendingFromStore().
let trendingFile: DevtoTrendingFile = devtoTrendingData as unknown as DevtoTrendingFile;

export function getDevtoTrendingFile(): DevtoTrendingFile {
  return trendingFile;
}

export function getDevtoTopArticles(limit = 50): DevtoArticle[] {
  // Already sorted by trendingScore desc by the scraper.
  if (trendingFile.articles.length <= limit) return trendingFile.articles;
  return trendingFile.articles.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest devto-trending payload from data-store.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshDevtoTrendingFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (
    Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    lastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<DevtoTrendingFile>(
      "devto-trending",
    );
    if (result.data && result.source !== "missing") {
      trendingFile = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
