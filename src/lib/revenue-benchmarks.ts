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

let cache:
  | { mtimeMs: number; file: RevenueBenchmarksFile }
  | null = null;

function loadSync(): RevenueBenchmarksFile {
  if (!existsSync(FILE_PATH)) return EMPTY_FILE;
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<RevenueBenchmarksFile>;
    return {
      ...EMPTY_FILE,
      ...parsed,
      starBands: Array.isArray(parsed.starBands) ? parsed.starBands : [],
      buckets: Array.isArray(parsed.buckets) ? parsed.buckets : [],
    };
  } catch {
    return EMPTY_FILE;
  }
}

export function readRevenueBenchmarksFile(): RevenueBenchmarksFile {
  let mtimeMs = -1;
  try {
    mtimeMs = existsSync(FILE_PATH) ? statSync(FILE_PATH).mtimeMs : -1;
  } catch {
    mtimeMs = -1;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.file;
  const file = loadSync();
  cache = { mtimeMs, file };
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

export function estimateMrr(input: EstimateInput): Estimate {
  const { buckets } = readRevenueBenchmarksFile();
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
