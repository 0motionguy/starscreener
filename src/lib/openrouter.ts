// OpenRouter model-marketplace reader.
//
// Reads the `openrouter-models` Redis slug published by
// apps/trendingrepo-worker/src/fetchers/openrouter-models (6-hourly).
// Mirrors the standard 3-tier pattern: Redis → bundled JSON → in-memory
// cache. Bundled file at data/openrouter-models.json is only a cold-start
// seed.
//
// Surface: /?cat=models renders the OpenRouter model landscape — the
// catalogue of routable models (pricing, context window, modality) joined
// with OpenRouter's live weekly-usage ranking. This is the *adoption* axis
// (what the world actually runs), complementary to /?cat=llms which is the
// Artificial Analysis *quality* axis (intelligence/price/speed).
//
// Attribution: data is sourced from openrouter.ai — the public models API
// (/api/v1/models) plus the frontend usage ranking. Surfaces must credit
// openrouter.ai. Usage data is rank-ORDER only (OpenRouter does not expose
// per-model token volume publicly), so we never render synthetic token
// counts — only the honest rank position.

import { resolve } from "path";
import { readFileSync } from "fs";

const BUNDLED_PATH = resolve(process.cwd(), "data", "openrouter-models.json");
const REDIS_SLUG = "openrouter-models";
const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface OpenrouterRow {
  /** Canonical OpenRouter id, e.g. "anthropic/claude-opus-4.7". */
  id: string;
  name: string;
  /** Author/lab slug — the id prefix, e.g. "anthropic". */
  author: string;
  /** Unix seconds the model became routable on OpenRouter (0 if unknown). */
  created: number;
  /** Context window in tokens (0 if unknown). */
  contextLength: number;
  /** Input price, USD per 1M tokens (null if unknown). 0 = free. */
  priceInPerM: number | null;
  /** Output price, USD per 1M tokens (null if unknown). 0 = free. */
  priceOutPerM: number | null;
  /** Architecture modality string, e.g. "text->text". */
  modality: string;
  /** Input modalities, e.g. ["text","image"]. */
  inputModalities: string[];
  /** 1-based weekly-usage rank (null when the model isn't in the ranking). */
  usageRank: number | null;
}

export interface OpenrouterFile {
  fetchedAt: string;
  source: string;
  count: number;
  models: OpenrouterRow[];
}

const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

function emptyFile(): OpenrouterFile {
  return { fetchedAt: EPOCH_ZERO, source: "none", count: 0, models: [] };
}

function coerceRow(raw: Partial<OpenrouterRow>): OpenrouterRow | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : id,
    author: typeof raw.author === "string" ? raw.author : id.split("/")[0]!,
    created: typeof raw.created === "number" ? raw.created : 0,
    contextLength: typeof raw.contextLength === "number" ? raw.contextLength : 0,
    priceInPerM: typeof raw.priceInPerM === "number" ? raw.priceInPerM : null,
    priceOutPerM: typeof raw.priceOutPerM === "number" ? raw.priceOutPerM : null,
    modality: typeof raw.modality === "string" ? raw.modality : "text->text",
    inputModalities: Array.isArray(raw.inputModalities)
      ? (raw.inputModalities.filter((m) => typeof m === "string") as string[])
      : [],
    usageRank:
      typeof raw.usageRank === "number" && Number.isFinite(raw.usageRank)
        ? raw.usageRank
        : null,
  };
}

function coerceFile(parsed: Partial<OpenrouterFile>): OpenrouterFile {
  const models = Array.isArray(parsed.models)
    ? (parsed.models
        .map((m) => coerceRow(m as Partial<OpenrouterRow>))
        .filter(Boolean) as OpenrouterRow[])
    : [];
  return {
    fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : EPOCH_ZERO,
    source: typeof parsed.source === "string" ? parsed.source : "bundled",
    count: typeof parsed.count === "number" ? parsed.count : models.length,
    models,
  };
}

function loadBundled(): OpenrouterFile {
  try {
    const raw = readFileSync(BUNDLED_PATH, "utf8");
    return coerceFile(JSON.parse(raw) as Partial<OpenrouterFile>);
  } catch {
    return emptyFile();
  }
}

let cache: OpenrouterFile | null = null;
let lastRefreshMs = 0;
let inflight: Promise<void> | null = null;

export async function refreshOpenrouterFromStore(): Promise<void> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) return;

  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<Partial<OpenrouterFile>>(REDIS_SLUG);
      if (result.data && result.source !== "missing") {
        cache = coerceFile(result.data);
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

export function getOpenrouterFile(): OpenrouterFile {
  if (!cache) cache = loadBundled();
  return cache;
}

/**
 * Models sorted by weekly-usage rank ascending (most-used first). Models
 * without a rank sort to the bottom, tie-broken by name so the order is
 * deterministic (avoids the non-deterministic-sort class of bug).
 */
export function getOpenrouterRanked(limit = 200): OpenrouterRow[] {
  const { models } = getOpenrouterFile();
  const ranked = [...models].sort((a, b) => {
    const ar = a.usageRank ?? Number.POSITIVE_INFINITY;
    const br = b.usageRank ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.id.localeCompare(b.id);
  });
  return ranked.slice(0, limit);
}

export interface OpenrouterStats {
  totalModels: number;
  labs: number;
  freeModels: number;
  /** Models that became routable in the last 90 days. */
  newLast90d: number;
  /** Largest advertised context window (tokens). */
  maxContext: number;
  mostUsed: OpenrouterRow | null;
  /** Cheapest input price among models with a ≥1M-token context window. */
  cheapestBigContext: OpenrouterRow | null;
}

export function getOpenrouterStats(): OpenrouterStats {
  const { models } = getOpenrouterFile();
  const nowSec = Date.now() / 1000;
  const NINETY_DAYS = 90 * 86_400;

  const labs = new Set<string>();
  let freeModels = 0;
  let newLast90d = 0;
  let maxContext = 0;
  let mostUsed: OpenrouterRow | null = null;
  let cheapestBigContext: OpenrouterRow | null = null;

  for (const m of models) {
    labs.add(m.author);
    if (m.priceInPerM === 0 && m.priceOutPerM === 0) freeModels += 1;
    if (m.created > 0 && nowSec - m.created <= NINETY_DAYS) newLast90d += 1;
    if (m.contextLength > maxContext) maxContext = m.contextLength;
    if (m.usageRank !== null && (mostUsed === null || m.usageRank < mostUsed.usageRank!)) {
      mostUsed = m;
    }
    // Cheapest ≥1M ctx: ignore meta-routers like openrouter/auto which carry
    // a sentinel `-1` price (variable per route). Free models (0) are valid
    // and win when present. The previous logic let `-1` win and the surface
    // showed "$-1000000.000" — burned 2026-05-30.
    if (
      m.contextLength >= 1_000_000 &&
      m.priceInPerM !== null &&
      m.priceInPerM >= 0
    ) {
      if (
        cheapestBigContext === null ||
        m.priceInPerM < cheapestBigContext.priceInPerM!
      ) {
        cheapestBigContext = m;
      }
    }
  }

  return {
    totalModels: models.length,
    labs: labs.size,
    freeModels,
    newLast90d,
    maxContext,
    mostUsed,
    cheapestBigContext,
  };
}

export interface GrowthSeries {
  /** One row per month: { month: "YYYY-MM", [author]: cumulativeCount }. */
  data: Array<Record<string, string | number>>;
  /** Author keys (series), ordered by total model count desc. "other" last. */
  authors: string[];
}

/**
 * Cumulative count of routable models over time, stacked by lab — the honest
 * "AI model explosion" growth chart. Uses each model's `created` month;
 * models with an unknown date are excluded from the timeline (still counted
 * in stats/table). The top `topN` labs get their own band; the rest fold
 * into "other".
 */
export function buildModelGrowthSeries(
  models: OpenrouterRow[],
  topN = 7,
): GrowthSeries {
  const dated = models.filter((m) => m.created > 0);
  if (dated.length === 0) return { data: [], authors: [] };

  const countByAuthor = new Map<string, number>();
  for (const m of dated) {
    countByAuthor.set(m.author, (countByAuthor.get(m.author) ?? 0) + 1);
  }
  const topAuthors = [...countByAuthor.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([a]) => a);
  const topSet = new Set(topAuthors);
  const hasOther = countByAuthor.size > topAuthors.length;
  const authors = hasOther ? [...topAuthors, "other"] : [...topAuthors];

  const monthKey = (sec: number): string => {
    const d = new Date(sec * 1000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${d.getUTCFullYear()}-${mm}`;
  };

  // Per-month new counts per band.
  const monthly = new Map<string, Map<string, number>>();
  for (const m of dated) {
    const key = monthKey(m.created);
    const band = topSet.has(m.author) ? m.author : "other";
    if (!monthly.has(key)) monthly.set(key, new Map());
    const bucket = monthly.get(key)!;
    bucket.set(band, (bucket.get(band) ?? 0) + 1);
  }

  const months = [...monthly.keys()].sort();
  const running = new Map<string, number>(authors.map((a) => [a, 0]));
  const data: Array<Record<string, string | number>> = months.map((month) => {
    const bucket = monthly.get(month)!;
    const row: Record<string, string | number> = { month };
    for (const a of authors) {
      running.set(a, (running.get(a) ?? 0) + (bucket.get(a) ?? 0));
      row[a] = running.get(a) ?? 0;
    }
    return row;
  });

  return { data, authors };
}
