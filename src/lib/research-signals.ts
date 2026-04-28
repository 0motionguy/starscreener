// Research signals loader (HuggingFace + arXiv).
//
// Mirrors the trending.ts pattern:
//   - In-memory cache seeded from the bundled JSON snapshots.
//   - `refreshResearchSignalsFromStore()` swaps in fresher Redis data when
//     called from a server component / route handler.
//   - Sync getters return whatever's currently in the cache.
//
// Two sources, two payload shapes:
//   - data/huggingface-trending.json — top 100 trending models on HF.
//   - data/arxiv-recent.json — recent cs.AI / cs.CL / cs.LG papers, with
//     repo-cross-link metadata when an abstract names a tracked repo.

import hfSeed from "../../data/huggingface-trending.json";
import arxivSeed from "../../data/arxiv-recent.json";

export interface HuggingFaceModel {
  rank: number;
  id: string;
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

export interface HuggingFaceTrending {
  fetchedAt: string;
  source: string;
  count: number;
  models: HuggingFaceModel[];
}

export interface ArxivLinkedRepo {
  fullName: string;
  matchType: "abstract";
  confidence: number;
}

export interface ArxivPaper {
  arxivId: string;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  primaryCategory: string | null;
  absUrl: string;
  pdfUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  linkedRepos: ArxivLinkedRepo[];
}

export interface ArxivRecent {
  fetchedAt: string;
  source: string;
  count: number;
  linkedRepoCount: number;
  papers: ArxivPaper[];
}

let hf: HuggingFaceTrending = hfSeed as unknown as HuggingFaceTrending;
let arxiv: ArxivRecent = arxivSeed as unknown as ArxivRecent;

export function getHuggingFaceTrending(): HuggingFaceTrending {
  return hf;
}

export function getArxivRecent(): ArxivRecent {
  return arxiv;
}

export function getResearchFetchedAt(): {
  huggingface: string | null;
  arxiv: string | null;
} {
  return {
    huggingface: hf?.fetchedAt ?? null,
    arxiv: arxiv?.fetchedAt ?? null,
  };
}

interface RefreshResult {
  huggingface: { source: "redis" | "file" | "memory" | "missing"; ageMs: number };
  arxiv: { source: "redis" | "file" | "memory" | "missing"; ageMs: number };
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull fresh HF + arXiv payloads from the data-store. Cheap to call
 * repeatedly — internal dedupe + 30s rate-limit. Never throws; on Redis
 * miss the existing in-memory cache is preserved.
 */
export async function refreshResearchSignalsFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      huggingface: { source: "memory", ageMs: sinceLast },
      arxiv: { source: "memory", ageMs: sinceLast },
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const { getDataStore } = await import("./data-store");
    const store = getDataStore();
    const [hfResult, arxivResult] = await Promise.all([
      store.read<HuggingFaceTrending>("huggingface-trending"),
      store.read<ArxivRecent>("arxiv-recent"),
    ]);

    if (hfResult.data && hfResult.source !== "missing") {
      hf = hfResult.data;
    }
    if (arxivResult.data && arxivResult.source !== "missing") {
      arxiv = arxivResult.data;
    }

    lastRefreshMs = Date.now();
    return {
      huggingface: { source: hfResult.source, ageMs: hfResult.ageMs },
      arxiv: { source: arxivResult.source, ageMs: arxivResult.ageMs },
    };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Test/admin — reset to bundled seed. */
export function _resetResearchSignalsCacheForTests(): void {
  hf = hfSeed as unknown as HuggingFaceTrending;
  arxiv = arxivSeed as unknown as ArxivRecent;
  lastRefreshMs = 0;
  inflight = null;
}
