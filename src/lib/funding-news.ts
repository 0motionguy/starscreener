// Funding News loader.
//
// Reads data/funding-news.json (produced by scripts/scrape-funding-news.mjs)
// and exposes typed getters for the /funding page.
//
// Mirrors src/lib/hackernews-trending.ts and src/lib/producthunt.ts:
// lazy-hydrates, file-signature caching, cold-state detection.

import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import type { FundingNewsFile, FundingSignal, FundingStats } from "./funding/types";
import { buildFundingStats } from "./funding/extract";

const FUNDING_NEWS_PATH = resolve(process.cwd(), "data", "funding-news.json");
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

interface FundingNewsCache {
  signature: string;
  file: FundingNewsFile;
}

let cache: FundingNewsCache | null = null;

function createFallbackFile(): FundingNewsFile {
  return {
    fetchedAt: EPOCH_ZERO,
    source: "none",
    windowDays: 7,
    signals: [],
  };
}

function getFileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function normalizeFile(input: unknown): FundingNewsFile {
  if (!input || typeof input !== "object") {
    return createFallbackFile();
  }
  const file = input as Partial<FundingNewsFile>;
  return {
    fetchedAt:
      typeof file.fetchedAt === "string" && file.fetchedAt.trim().length > 0
        ? file.fetchedAt
        : EPOCH_ZERO,
    source: typeof file.source === "string" ? file.source : "unknown",
    windowDays:
      typeof file.windowDays === "number" && Number.isFinite(file.windowDays)
        ? file.windowDays
        : 7,
    signals: Array.isArray(file.signals) ? (file.signals as FundingSignal[]) : [],
  };
}

function loadCache(): FundingNewsCache {
  const signature = getFileSignature(FUNDING_NEWS_PATH);
  if (cache && cache.signature === signature) return cache;

  let file = createFallbackFile();
  try {
    const raw = readFileSync(FUNDING_NEWS_PATH, "utf8");
    file = normalizeFile(JSON.parse(raw));
  } catch {
    file = createFallbackFile();
  }

  cache = { signature, file };
  return cache;
}

export function getFundingFile(): FundingNewsFile {
  return loadCache().file;
}

export function isFundingCold(
  file: FundingNewsFile = getFundingFile(),
): boolean {
  return !file.fetchedAt || file.fetchedAt.startsWith("1970-");
}

export function getFundingFetchedAt(): string | null {
  const file = getFundingFile();
  return isFundingCold(file) ? null : file.fetchedAt;
}

export function getFundingSignals(): FundingSignal[] {
  return getFundingFile().signals ?? [];
}

export function getFundingSignalsWithExtraction(): FundingSignal[] {
  return getFundingSignals().filter((s) => s.extracted !== null);
}

export function getFundingSignalsByTag(tag: string): FundingSignal[] {
  return getFundingSignals().filter((s) => s.tags.includes(tag));
}

export function getFundingSignalsByRoundType(
  roundType: string,
): FundingSignal[] {
  return getFundingSignals().filter(
    (s) => s.extracted?.roundType === roundType,
  );
}

export function getFundingSignalsThisWeek(): FundingSignal[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return getFundingSignals().filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && t >= weekAgo;
  });
}

export function getFundingStats(): FundingStats {
  return buildFundingStats(getFundingSignals());
}
