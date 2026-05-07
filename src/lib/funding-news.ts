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
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      // Fan out to all three funding slugs the worker publishes:
      //   funding-news            — TechCrunch / VentureBeat / Sifted / Tech.eu / Pymnts / Wired / BBC / Ars
      //   funding-news-crunchbase — Crunchbase News + AlleyWatch + FinSMEs + TechFundingNews + TC Venture
      //   funding-news-x          — Apify Twitter funding-hashtag scraper
      // Pre-fix the page only read the first slug, so Crunchbase + Twitter
      // were collected and stored in Redis but never surfaced. Merge with
      // sourceUrl-keyed dedupe so cross-published articles collapse.
      const [main, crunch, x] = await Promise.allSettled([
        store.read<unknown>("funding-news"),
        store.read<unknown>("funding-news-crunchbase"),
        store.read<unknown>("funding-news-x"),
      ]);

      const byKey = new Map<string, FundingSignal>();
      let freshestFetchedAt = "";
      let freshestSource: RefreshResult["source"] = "missing";
      let freshestAgeMs = Number.POSITIVE_INFINITY;
      let maxWindowDays = 0;

      const ingest = (
        settled: PromiseSettledResult<Awaited<ReturnType<typeof store.read>>>,
      ) => {
        if (settled.status !== "fulfilled") return;
        const r = settled.value;
        if (!r.data || r.source === "missing") return;
        const file = normalizeFile(r.data);
        if (file.windowDays > maxWindowDays) maxWindowDays = file.windowDays;
        if (file.fetchedAt && file.fetchedAt > freshestFetchedAt) {
          freshestFetchedAt = file.fetchedAt;
          freshestSource = r.source;
          freshestAgeMs = r.ageMs;
        }
        for (const signal of file.signals) {
          // Prefer sourceUrl as the dedupe key. Fall back to id when the
          // signal lacks a URL (some seed signals do). Lowercased so
          // protocol/case differences don't split the same article.
          const rawKey = (signal.sourceUrl || signal.id || "").toLowerCase();
          if (!rawKey || byKey.has(rawKey)) continue;
          byKey.set(rawKey, signal);
        }
      };

      ingest(main);
      ingest(crunch);
      ingest(x);

      if (byKey.size > 0) {
        const merged: FundingNewsFile = {
          fetchedAt: freshestFetchedAt || EPOCH_ZERO,
          source: "merged-funding-slugs",
          windowDays: maxWindowDays || 7,
          signals: Array.from(byKey.values()).sort((a, b) => {
            const ta = Date.parse(a.publishedAt);
            const tb = Date.parse(b.publishedAt);
            return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
          }),
        };
        cache = {
          signature: `redis-merged:${freshestFetchedAt || Date.now()}`,
          file: merged,
        };
      }
      lastRefreshMs = Date.now();
      return {
        source: freshestSource,
        ageMs: Number.isFinite(freshestAgeMs) ? freshestAgeMs : 0,
      };
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
