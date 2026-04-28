// arXiv papers — trending-side reader.
//
// Reads the `arxiv-recent` payload from the data-store (Redis → bundled
// file → memory) and surfaces the top papers scored through the new
// domain pipeline (`arxivScorer` + `computeCrossDomainMomentum`).
//
// Mirrors the lib/hackernews-trending.ts shape: bundled JSON seeds the
// in-memory cache; refreshArxivFromStore() swaps in a fresh Redis
// payload with a 30s rate-limit + in-flight dedupe and never throws.
//
// SCOPE CUT (Chunk E MVP)
//   The raw arxiv-recent payload does NOT include citation velocity,
//   social mentions, or HF adoption count — those come from a future
//   enrichment job (Chunk C). For MVP we set those to 0; the arxivScorer
//   falls back to coldStartBoost + linkedRepoMomentum when present.
//   Most papers will land at low rawScores, ordered primarily by recency.
//   That's surfaced explicitly in the page banner so users know why
//   scores are sparse.

import arxivRecentData from "../../data/arxiv-recent.json";
import { arxivScorer, type ArxivPaperItem } from "./pipeline/scoring/domain/arxiv";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type { DomainItem, DomainKey, ScoredItem } from "./pipeline/scoring/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArxivLinkedRepo {
  fullName: string;
  matchType: string;
  confidence: number;
}

/** Wire shape produced by scripts/scrape-arxiv.mjs. */
export interface ArxivPaperRaw {
  arxivId: string;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  primaryCategory: string | null;
  absUrl: string;
  pdfUrl: string;
  publishedAt: string; // ISO
  updatedAt: string; // ISO
  linkedRepos: ArxivLinkedRepo[];
}

export interface ArxivRecentFile {
  fetchedAt: string;
  source: string;
  count: number;
  linkedRepoCount: number;
  papers: ArxivPaperRaw[];
}

/** Scored shape — raw fields + score components surfaced for UI. */
export interface ArxivPaperTrending extends ArxivPaperRaw {
  rawScore: number; // 0..100
  momentum: number; // 0..100 (per-domain percentile)
  primaryMetric: { name: string; value: number; label: string };
  explanation: string;
  daysSincePublished: number;
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let recentFile: ArxivRecentFile = arxivRecentData as unknown as ArxivRecentFile;

export function getArxivRecentFile(): ArxivRecentFile {
  return recentFile;
}

// ---------------------------------------------------------------------------
// Scoring + ranking
// ---------------------------------------------------------------------------

function daysSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - t) / 86_400_000);
}

function rawToScorerItem(raw: ArxivPaperRaw, nowMs: number): ArxivPaperItem {
  // MVP: no citation/social/HF enrichment yet. linkedRepoMomentum is left
  // undefined when there's no linked repo so the scorer drops it (and
  // also drops coldStartBoost, which gates on linkedRepoMomentum being
  // present). When Chunk C ships enrichment, populate these fields.
  return {
    domainKey: "arxiv",
    id: raw.arxivId,
    joinKeys: {
      arxivId: raw.arxivId,
      repoFullName: raw.linkedRepos?.[0]?.fullName,
    },
    citationVelocity: 0,
    citationCount: 0,
    socialMentions: 0,
    hfAdoptionCount: 0,
    daysSincePublished: daysSince(raw.publishedAt, nowMs),
    // linkedRepoMomentum: omitted — would need cross-source repo lookup
    // (cheap-but-not-free). For MVP we leave it undefined; the scorer
    // drops both that component and the gated coldStartBoost.
  };
}

/**
 * Score every paper in the current cache, rank by post-cross-domain
 * momentum (descending), and return the top `limit`. Pure — safe to call
 * from server components.
 */
export function getArxivPapersTrending(
  limit = 100,
  nowMs: number = Date.now(),
): ArxivPaperTrending[] {
  const raws = recentFile.papers ?? [];
  if (raws.length === 0) return [];

  const items = raws.map((r) => rawToScorerItem(r, nowMs));
  const scored = arxivScorer.computeRaw(items);

  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["arxiv", scored as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("arxiv") ?? [];

  const enriched: ArxivPaperTrending[] = ranked.map((s, i) => ({
    ...raws[i],
    rawScore: s.rawScore,
    momentum: s.momentum,
    primaryMetric: s.primaryMetric,
    explanation: s.explanation,
    daysSincePublished: daysSince(raws[i].publishedAt, nowMs),
  }));

  // Sort by momentum desc; recency tie-break (newer first).
  enriched.sort((a, b) => {
    if (b.momentum !== a.momentum) return b.momentum - a.momentum;
    return a.daysSincePublished - b.daysSincePublished;
  });

  if (enriched.length <= limit) return enriched;
  return enriched.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Refresh hook — pull latest arxiv-recent payload from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors trending.ts:190-230.
// ---------------------------------------------------------------------------

let inflight: Promise<{ arxiv: { source: string; ageMs: number } }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshArxivFromStore(): Promise<{
  arxiv: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { arxiv: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<ArxivRecentFile>("arxiv-recent");
      if (result.data && result.source !== "missing") {
        recentFile = result.data;
      }
      lastRefreshMs = Date.now();
      return { arxiv: { source: result.source, ageMs: result.ageMs } };
    } catch {
      lastRefreshMs = Date.now();
      return { arxiv: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
