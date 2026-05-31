// Artificial Analysis LLM leaderboard reader.
//
// Reads the `aa-llms` Redis slug published by
// apps/trendingrepo-worker/src/fetchers/artificialanalysis (6-hourly).
// Mirrors the standard 3-tier pattern: Redis → bundled JSON → in-memory
// cache. Bundled file at data/aa-llms.json is only a cold-start seed.
//
// Surface: /?cat=llms renders a faithful clone of the artificialanalysis.ai
// leaderboard (https://artificialanalysis.ai/leaderboards/models). Only
// columns/filters with AA-API backing are exposed — Context Window,
// Modalities, Weights/Size/Reasoning filters are deferred until the AA API
// surfaces the underlying data.

import "server-only";

import { resolve } from "path";
import { readFileSync } from "fs";

const BUNDLED_PATH = resolve(process.cwd(), "data", "aa-llms.json");
const REDIS_SLUG = "aa-llms";
const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface AaLlmsRow {
  slug: string;
  name: string;
  creator: string;
  creatorSlug: string | null;
  releaseDate: string | null;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  mathIndex: number | null;
  mmluPro: number | null;
  gpqa: number | null;
  pricePerMTokens: number | null;
  priceInputPerM: number | null;
  priceOutputPerM: number | null;
  outputTokensPerSec: number | null;
  ttftSec: number | null;
  ttfaSec: number | null;
}

interface AaLlmsFile {
  fetchedAt: string;
  source: string;
  count: number;
  models: AaLlmsRow[];
}

const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

function emptyFile(): AaLlmsFile {
  return { fetchedAt: EPOCH_ZERO, source: "none", count: 0, models: [] };
}

function loadBundled(): AaLlmsFile {
  try {
    const raw = readFileSync(BUNDLED_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AaLlmsFile>;
    return {
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : EPOCH_ZERO,
      source: typeof parsed.source === "string" ? parsed.source : "bundled",
      count: typeof parsed.count === "number" ? parsed.count : (parsed.models?.length ?? 0),
      models: Array.isArray(parsed.models) ? (parsed.models as AaLlmsRow[]) : [],
    };
  } catch {
    return emptyFile();
  }
}

let cache: AaLlmsFile | null = null;
let lastRefreshMs = 0;
let inflight: Promise<void> | null = null;

export async function refreshAaLlmsFromStore(): Promise<void> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) return;

  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<Partial<AaLlmsFile>>(REDIS_SLUG);
      if (result.data && result.source !== "missing") {
        const data = result.data;
        cache = {
          fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : EPOCH_ZERO,
          source: typeof data.source === "string" ? data.source : "redis",
          count:
            typeof data.count === "number" ? data.count : (data.models?.length ?? 0),
          models: Array.isArray(data.models) ? (data.models as AaLlmsRow[]) : [],
        };
      } else if (!cache) {
        cache = loadBundled();
      }
    } catch {
      if (!cache) cache = loadBundled();
    } finally {
      lastRefreshMs = Date.now();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function getAaLlmsFile(): AaLlmsFile {
  if (!cache) cache = loadBundled();
  return cache;
}

/**
 * Return rows sorted by Intelligence Index desc. Rows without an
 * intelligenceIndex are sorted to the bottom (preserves source order via the
 * original index). Limit caps the result for surfaces that don't need the
 * full ~520-row list.
 */
export function getAaLlmsRanked(limit = 200): AaLlmsRow[] {
  const { models } = getAaLlmsFile();
  const ranked = [...models].sort((a, b) => {
    const ai = a.intelligenceIndex ?? -Infinity;
    const bi = b.intelligenceIndex ?? -Infinity;
    if (ai !== bi) return bi - ai;
    return a.name.localeCompare(b.name);
  });
  return ranked.slice(0, limit);
}
