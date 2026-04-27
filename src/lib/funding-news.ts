// Funding News loader.
//
// Reads data/funding-news.json (produced by scripts/scrape-funding-news.mjs)
// and exposes typed getters for the /funding page.
//
// Phase 4 (data-API): the bundled JSON file is now a cold-start SEED only.
// The live source of truth is Redis (via src/lib/data-store). Server
// components / route handlers call `refreshFundingNewsFromStore()` before
// reading any sync getter; that function pulls the freshest payload into
// the in-memory cache and is rate-limited so concurrent renders don't fan
// out N Redis calls.
//
// Sync getters keep their existing signatures so existing callers don't
// have to change in lockstep — they read whatever's in the cache, which
// is updated by the refresh hook.

import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import type { FundingNewsFile, FundingSignal, FundingStats } from "./funding/types";
import { buildFundingStats } from "./funding/extract";
import { getDataStore } from "./data-store";

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

// ---------------------------------------------------------------------------
// Refresh hook — pulls the freshest funding-news payload from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

// In-flight dedupe so a burst of concurrent server-component renders doesn't
// fan out N parallel Redis calls. The first request kicks the fetch; the
// rest await the same promise.
let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s — at most ~120 refreshes/hr per Lambda

/**
 * Pull the freshest funding-news payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal
 * dedupe + rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Safe to call from any server-component / route handler before reading any
 * sync getter. Never throws — on Redis miss the existing cache (file +
 * bundled snapshot) is preserved.
 */
export async function refreshFundingNewsFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const store = getDataStore();
      const result = await store.read<unknown>("funding-news");
      if (result.data && result.source !== "missing") {
        const next = normalizeFile(result.data);
        // Swap the cache. Use a synthetic signature so loadCache() returns
        // this entry until either (a) the on-disk file mtime changes — in
        // which case loadCache() rebuilds from disk — or (b) the next
        // refresh swaps in another Redis payload.
        cache = { signature: `redis:${result.writtenAt ?? Date.now()}`, file: next };
      }
      lastRefreshMs = Date.now();
      return { source: result.source, ageMs: result.ageMs };
    } catch {
      lastRefreshMs = Date.now();
      return { source: "missing", ageMs: 0 };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Test/admin — drop the in-memory cache so the next read goes to disk.
 * Lets tests exercise the refresh path without leaking state across cases.
 */
export function _resetFundingNewsCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
