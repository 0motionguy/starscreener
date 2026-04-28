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
// ENRICHMENT (Chunk C, shipped)
//   citationVelocity / citationCount / socialMentions are populated by
//   scripts/enrich-arxiv.mjs which writes to the `arxiv-enriched` Redis
//   key. The reader here looks up each paper by arxivId in that
//   enrichment index and overlays the values into the scorer input.
//   Papers not yet enriched (or enriched > 24h ago — see TTL in
//   enrich-arxiv.mjs) fall back to 0 across the citation/social terms,
//   which means the scorer weights them on recency only.
//
// SCOPE CUT (still deferred)
//   - hfAdoptionCount: needs a cross-domain join against HF model/dataset
//     index. Pinned to 0 here; Chunk D's join resolver fills it in.
//   - linkedRepoMomentum: needs a per-repo momentum score keyed off the
//     trending pipeline output. Left undefined so the scorer drops the
//     coldStartBoost term as well. Chunk D wires this in.

import arxivRecentData from "../../data/arxiv-recent.json";
import arxivEnrichedData from "../../data/arxiv-enriched.json";
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

/**
 * Per-paper enrichment record produced by scripts/enrich-arxiv.mjs.
 * Citation data comes from Semantic Scholar; socialMentions is the
 * count of HN + Reddit posts in the last 7d that referenced this
 * arxiv id (by URL or bare id token).
 */
export interface ArxivEnrichmentRecord {
  arxivId: string;
  citationCount: number;
  citationVelocity: number;
  socialMentions: number;
  lastEnrichedAt: string;
}

export interface ArxivEnrichedFile {
  fetchedAt: string;
  source: string;
  socialSources: string[];
  count: number;
  papers: ArxivEnrichmentRecord[];
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
// Enrichment cache: arxivId → record. Seeded from the bundled
// arxiv-enriched.json snapshot (which is empty until scripts/enrich-arxiv.mjs
// has run); refreshArxivEnrichmentFromStore() swaps in the latest Redis
// payload at request time. Lookups are O(1) via the indexed Map.
// ---------------------------------------------------------------------------

let enrichedFile: ArxivEnrichedFile = arxivEnrichedData as unknown as ArxivEnrichedFile;

function buildEnrichmentIndex(
  file: ArxivEnrichedFile,
): Map<string, ArxivEnrichmentRecord> {
  const map = new Map<string, ArxivEnrichmentRecord>();
  for (const p of file.papers ?? []) {
    if (p?.arxivId) map.set(p.arxivId, p);
  }
  return map;
}

let enrichmentIndex: Map<string, ArxivEnrichmentRecord> =
  buildEnrichmentIndex(enrichedFile);

/** Look up enrichment for an arxiv id. Returns null when no record. */
export function getArxivEnrichment(
  arxivId: string,
): ArxivEnrichmentRecord | null {
  if (!arxivId) return null;
  return enrichmentIndex.get(arxivId) ?? null;
}

export function getArxivEnrichedFile(): ArxivEnrichedFile {
  return enrichedFile;
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
  // Enrichment overlay (Chunk C). When scripts/enrich-arxiv.mjs has run,
  // citationVelocity / citationCount / socialMentions are populated from
  // Semantic Scholar + HN/Reddit mention counts. When the lookup misses
  // (paper not yet enriched, or enrichment job hasn't run), all three
  // stay 0 and the scorer falls back to the MVP behavior of weighting on
  // recency + linkedRepoMomentum (when present).
  const enr = enrichmentIndex.get(raw.arxivId);
  return {
    domainKey: "arxiv",
    id: raw.arxivId,
    joinKeys: {
      arxivId: raw.arxivId,
      repoFullName: raw.linkedRepos?.[0]?.fullName,
    },
    citationVelocity: enr?.citationVelocity ?? 0,
    citationCount: enr?.citationCount ?? 0,
    socialMentions: enr?.socialMentions ?? 0,
    hfAdoptionCount: 0,
    daysSincePublished: daysSince(raw.publishedAt, nowMs),
    // linkedRepoMomentum: omitted — would need cross-source repo lookup
    // (cheap-but-not-free). Deferred to Chunk D's cross-domain join
    // resolver. The scorer drops both that component and the gated
    // coldStartBoost when undefined.
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

// ---------------------------------------------------------------------------
// Enrichment refresh hook — pull latest arxiv-enriched payload. Mirrors
// the `refreshArxivFromStore` shape (30s rate-limit + in-flight dedupe +
// never-throws). Additive: existing pages calling refreshArxivFromStore()
// keep working unchanged; pages that want enriched scores call both.
// ---------------------------------------------------------------------------

let enrichmentInflight: Promise<{
  arxivEnrichment: { source: string; ageMs: number };
}> | null = null;
let enrichmentLastRefreshMs = 0;

export async function refreshArxivEnrichmentFromStore(): Promise<{
  arxivEnrichment: { source: string; ageMs: number };
}> {
  if (enrichmentInflight) return enrichmentInflight;
  const sinceLast = Date.now() - enrichmentLastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && enrichmentLastRefreshMs > 0) {
    return { arxivEnrichment: { source: "memory", ageMs: sinceLast } };
  }
  enrichmentInflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result =
        await getDataStore().read<ArxivEnrichedFile>("arxiv-enriched");
      if (result.data && result.source !== "missing") {
        enrichedFile = result.data;
        enrichmentIndex = buildEnrichmentIndex(enrichedFile);
      }
      enrichmentLastRefreshMs = Date.now();
      return {
        arxivEnrichment: { source: result.source, ageMs: result.ageMs },
      };
    } catch {
      enrichmentLastRefreshMs = Date.now();
      return { arxivEnrichment: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    enrichmentInflight = null;
  });
  return enrichmentInflight;
}

// ---------------------------------------------------------------------------
// Test helpers — let unit tests inject a synthetic enrichment payload
// without standing up a Redis tier. Not part of the public surface; kept
// underscore-prefixed to flag the intent.
// ---------------------------------------------------------------------------

export function _setArxivEnrichmentForTests(file: ArxivEnrichedFile): void {
  enrichedFile = file;
  enrichmentIndex = buildEnrichmentIndex(file);
}

export function _resetArxivEnrichmentForTests(): void {
  enrichedFile = arxivEnrichedData as unknown as ArxivEnrichedFile;
  enrichmentIndex = buildEnrichmentIndex(enrichedFile);
}
