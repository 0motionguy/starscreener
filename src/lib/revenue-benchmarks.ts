// Runtime loader for the bucketed revenue benchmarks produced by
// scripts/compute-revenue-benchmarks.mjs. Consumed by /tools/revenue-estimate.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface RevenueBenchmarkBucket {
  category: string;
  starBand: string;
  phLaunched: boolean;
  n: number;
  p25: number; // cents
  p50: number;
  p75: number;
}

export interface RevenueBenchmarksFile {
  generatedAt: string | null;
  version: number;
  totalStartups: number;
  totalBuckets: number;
  minBucketSize: number;
  starBands: string[];
  buckets: RevenueBenchmarkBucket[];
}

const FILE_PATH = resolve(process.cwd(), "data", "revenue-benchmarks.json");

const EMPTY_FILE: RevenueBenchmarksFile = {
  generatedAt: null,
  version: 1,
  totalStartups: 0,
  totalBuckets: 0,
  minBucketSize: 5,
  starBands: [],
  buckets: [],
};

interface BenchmarksCacheEntry {
  signature: string;
  file: RevenueBenchmarksFile;
}

let cache: BenchmarksCacheEntry | null = null;

function normalizeFile(input: unknown): RevenueBenchmarksFile {
  if (!input || typeof input !== "object") return EMPTY_FILE;
  const parsed = input as Partial<RevenueBenchmarksFile>;
  return {
    ...EMPTY_FILE,
    ...parsed,
    starBands: Array.isArray(parsed.starBands) ? parsed.starBands : [],
    buckets: Array.isArray(parsed.buckets) ? parsed.buckets : [],
  };
}

function loadSync(): RevenueBenchmarksFile {
  if (!existsSync(FILE_PATH)) return EMPTY_FILE;
  try {
    return normalizeFile(JSON.parse(readFileSync(FILE_PATH, "utf8")));
  } catch {
    return EMPTY_FILE;
  }
}

function diskSignature(): string {
  try {
    return existsSync(FILE_PATH)
      ? `disk:${statSync(FILE_PATH).mtimeMs}`
      : "missing";
  } catch {
    return "missing";
  }
}

export function readRevenueBenchmarksFile(): RevenueBenchmarksFile {
  const sig = diskSignature();
  if (cache && cache.signature === sig) return cache.file;
  // A synthetic redis: signature stays stable across calls — only the
  // refresh hook overwrites it.
  if (cache && cache.signature.startsWith("redis:")) return cache.file;
  const file = loadSync();
  cache = { signature: sig, file };
  return file;
}

export function listCategories(): string[] {
  const file = readRevenueBenchmarksFile();
  const set = new Set<string>();
  for (const bucket of file.buckets) set.add(bucket.category);
  return Array.from(set).sort();
}

export interface EstimateInput {
  category: string | null;
  starBand: string | null;
  phLaunched: boolean | null;
}

export interface Estimate {
  bucket: RevenueBenchmarkBucket | null;
  fallback:
    | "exact"
    | "ignored_ph"
    | "ignored_stars"
    | "category_only"
    | "none";
  range: { lowCents: number; midCents: number; highCents: number } | null;
}

/**
 * Pure version of `estimateMrr` — takes an explicit bucket list instead of
 * reading from disk. Exported so the fallback-precedence logic can be tested
 * deterministically without a fixture file. The disk-backed `estimateMrr`
 * below is a one-line delegate to this.
 */
export function estimateMrrFromBuckets(
  buckets: RevenueBenchmarkBucket[],
  input: EstimateInput,
): Estimate {
  if (buckets.length === 0) {
    return { bucket: null, fallback: "none", range: null };
  }

  const matches = (
    categoryMatch: (b: RevenueBenchmarkBucket) => boolean,
    starMatch: (b: RevenueBenchmarkBucket) => boolean,
    phMatch: (b: RevenueBenchmarkBucket) => boolean,
  ) => buckets.filter((b) => categoryMatch(b) && starMatch(b) && phMatch(b));

  const cat = (b: RevenueBenchmarkBucket) =>
    input.category ? b.category === input.category : true;
  const star = (b: RevenueBenchmarkBucket) =>
    input.starBand ? b.starBand === input.starBand : true;
  const ph = (b: RevenueBenchmarkBucket) =>
    input.phLaunched === null ? true : b.phLaunched === input.phLaunched;

  // Try exact match first, then progressively relax.
  let pick = matches(cat, star, ph);
  let fallback: Estimate["fallback"] = "exact";
  if (pick.length === 0 && input.phLaunched !== null) {
    pick = matches(cat, star, () => true);
    fallback = "ignored_ph";
  }
  if (pick.length === 0 && input.starBand !== null) {
    pick = matches(cat, () => true, ph);
    fallback = "ignored_stars";
  }
  if (pick.length === 0 && input.category !== null) {
    pick = matches(cat, () => true, () => true);
    fallback = "category_only";
  }
  if (pick.length === 0) {
    return { bucket: null, fallback: "none", range: null };
  }
  // If multiple buckets match (e.g. after relaxing), aggregate weighted by n.
  const totalN = pick.reduce((sum, b) => sum + b.n, 0);
  const weighted = (selector: (b: RevenueBenchmarkBucket) => number) =>
    Math.round(
      pick.reduce((sum, b) => sum + selector(b) * b.n, 0) / totalN,
    );
  const bucket: RevenueBenchmarkBucket = {
    category: input.category ?? "aggregate",
    starBand: input.starBand ?? "aggregate",
    phLaunched: input.phLaunched ?? false,
    n: totalN,
    p25: weighted((b) => b.p25),
    p50: weighted((b) => b.p50),
    p75: weighted((b) => b.p75),
  };
  return {
    bucket,
    fallback,
    range: {
      lowCents: bucket.p25,
      midCents: bucket.p50,
      highCents: bucket.p75,
    },
  };
}

/**
 * Disk-backed estimator. Reads buckets from data/revenue-benchmarks.json
 * and delegates to the pure estimateMrrFromBuckets above.
 */
export function estimateMrr(input: EstimateInput): Estimate {
  return estimateMrrFromBuckets(
    readRevenueBenchmarksFile().buckets,
    input,
  );
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls the freshest revenue-benchmarks payload from the
// data-store. Internal in-flight dedupe + 30s rate limit so concurrent
// estimator requests don't fan out N Redis calls.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshRevenueBenchmarksFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<unknown>("revenue-benchmarks");
      if (result.data && result.source !== "missing") {
        const next = normalizeFile(result.data);
        cache = {
          signature: `redis:${result.writtenAt ?? Date.now()}`,
          file: next,
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
export function _resetRevenueBenchmarksCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
