// SEC Form D loader — dedicated reader for the funding-news-sec Redis slug.
//
// The trending /funding page merges 4 funding slugs (funding-news +
// funding-news-crunchbase + funding-news-x + funding-news-sec) into a single
// view. /funding/sec wants the SEC payload on its own with filing-specific
// metadata (confidence pills, EDGAR ground-truth framing).
//
// This module mirrors the read-and-cache contract of `src/lib/funding-news.ts`
// but fans to ONLY the `funding-news-sec` slug. It does not share the cache
// with funding-news.ts so the two pages can render independently without
// stomping each other's last-known-good payload.
//
// Three-tier read (Redis → bundled file → in-memory) is delegated to the
// shared data-store. Refresh hook is rate-limited (30s min interval) and
// in-flight deduped just like the funding-news.ts pattern.
//
// Pure server-only — uses readFileSync for the bundled-snapshot tier.

import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import type { FundingNewsFile, FundingSignal } from "./types";

const SEC_FILE_PATH = resolve(
  process.cwd(),
  "data",
  "funding-news-sec.json",
);
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

interface SecCache {
  signature: string;
  file: FundingNewsFile;
}

let cache: SecCache | null = null;

function createFallbackFile(): FundingNewsFile {
  return {
    fetchedAt: EPOCH_ZERO,
    source: "none",
    windowDays: 30,
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
  if (!input || typeof input !== "object") return createFallbackFile();
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
        : 30,
    signals: Array.isArray(file.signals) ? (file.signals as FundingSignal[]) : [],
  };
}

function loadCache(): SecCache {
  const signature = getFileSignature(SEC_FILE_PATH);
  if (cache && cache.signature === signature) return cache;

  let file = createFallbackFile();
  try {
    const raw = readFileSync(SEC_FILE_PATH, "utf8");
    file = normalizeFile(JSON.parse(raw));
  } catch {
    file = createFallbackFile();
  }

  cache = { signature, file };
  return cache;
}

export function getSecFormDFile(): FundingNewsFile {
  return loadCache().file;
}

export function getSecFormDSignals(): FundingSignal[] {
  return getSecFormDFile().signals ?? [];
}

export function isSecFormDCold(
  file: FundingNewsFile = getSecFormDFile(),
): boolean {
  return !file.fetchedAt || file.fetchedAt.startsWith("1970-");
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls the freshest funding-news-sec payload from Redis.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest SEC Form D payload from the data-store and swap it
 * into this module's in-memory cache. Cheap to call multiple times — internal
 * dedupe + 30s rate-limit ensure we hit Redis at most once per process per
 * 30s window.
 *
 * Reads ONLY the `funding-news-sec` slug (not the 4-slug merger that the
 * trending /funding page uses). Never throws.
 */
export async function refreshSecFormDFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("../data-store");
      const store = getDataStore();
      const result = await store.read<unknown>("funding-news-sec");
      if (result.data && result.source !== "missing") {
        const file = normalizeFile(result.data);
        cache = {
          signature: `redis:${file.fetchedAt || Date.now()}`,
          file,
        };
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

/** Test/admin — drop the in-memory cache so the next read goes to disk. */
export function _resetSecFormDCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
