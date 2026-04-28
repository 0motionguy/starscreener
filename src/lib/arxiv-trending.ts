// arXiv loader — trending side.
//
// Reads data/arxiv-trending.json (recency-scored papers in the last 14d
// across cs.AI / cs.LG / cs.CL / cs.CV / cs.SE / stat.ML).
//
// arXiv has no native engagement signal (no votes, no comments), so the
// trending score is pure recency: 1 / (ageHours + 12). Faking proxies
// (abstract length, author count) would be noise. Future enhancement
// could pull citation/vote signals from Semantic Scholar or alphaXiv.

import arxivTrendingData from "../../data/arxiv-trending.json";

export interface ArxivPaperLinkedRepo {
  fullName: string;
  matchType: "abstract-url";
  confidence: number;
}

export interface ArxivPaper {
  arxivId: string; // "2403.04132"
  title: string;
  authors: string[];
  abstract: string; // truncated to ≤500 chars
  primaryCategory: string; // "cs.LG"
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  submittedUtc: number; // epoch seconds
  updatedUtc?: number;
  ageHours?: number;
  trendingScore?: number;
  // Phase B (cross-link) — populated by scraper for free, consumed later.
  linkedRepos?: ArxivPaperLinkedRepo[];
}

export interface ArxivTrendingFile {
  fetchedAt: string;
  windowDays: number;
  categories: string[];
  scannedTotal: number;
  papers: ArxivPaper[];
}

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshArxivTrendingFromStore().
let trendingFile: ArxivTrendingFile = arxivTrendingData as unknown as ArxivTrendingFile;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hydratePaper(paper: ArxivPaper, nowMs: number): ArxivPaper {
  if (paper.ageHours !== undefined && paper.trendingScore !== undefined) {
    return paper;
  }

  const ageHours = Math.max(
    0.5,
    (nowMs - paper.submittedUtc * 1000) / 3_600_000,
  );
  // Pure recency. The +12 prior keeps fresh-but-not-brand-new papers from
  // dominating the very first 30 minutes.
  const trendingScore = 1 / (ageHours + 12);

  return {
    ...paper,
    ageHours: paper.ageHours ?? round2(ageHours),
    trendingScore: paper.trendingScore ?? round2(trendingScore),
  };
}

export function getArxivTrendingFile(): ArxivTrendingFile {
  return trendingFile;
}

export function getArxivTopPapers(
  limit = 50,
  nowMs: number = Date.now(),
): ArxivPaper[] {
  const hydrated = (trendingFile.papers ?? []).map((p) =>
    hydratePaper(p, nowMs),
  );
  hydrated.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  if (hydrated.length <= limit) return hydrated;
  return hydrated.slice(0, limit);
}

// arxiv abs URL helper — "https://arxiv.org/abs/{id}".
export function arxivAbsHref(arxivId: string): string {
  return `https://arxiv.org/abs/${encodeURIComponent(arxivId)}`;
}

// ---------------------------------------------------------------------------
// Refresh hook — pull latest arxiv-trending payload from data-store. Same
// rate-limit + in-flight dedupe shape as every other source so callers can
// invoke on every render cheaply.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshArxivTrendingFromStore(): Promise<{
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
    const result = await getDataStore().read<ArxivTrendingFile>(
      "arxiv-trending",
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
