// stars-by-category reader — 90D daily star deltas, stacked by 7 hero
// categories. Reads the `stars-by-category-daily` Redis slug published by
// apps/trendingrepo-worker/src/fetchers/stars-by-category (daily 06:00 UTC).
//
// Same 3-tier pattern as openrouter-usage / trending: Redis → bundled JSON →
// in-memory cache, with an in-flight-dedupe + 30s rate-limit on the refresh.
//
// Honesty constraint: the chart paints only what the worker has aggregated.
// If the worker hasn't run yet OR the registry was empty, this returns
// `points: []` and the component renders an honest empty state. We do not
// fabricate days from snapshot data.
//
// NOTE: this file deliberately omits `import "server-only"` even though it
// touches fs/path. The client-side StarsByCategoryHero imports HERO_CATEGORIES
// + the chart-data type from here. The actual fs read is guarded with
// `typeof window === "undefined"` (commit 908438418) so the client bundle is
// safe. Allow-listed in scripts/check-server-only-markers.mjs.

import { resolve } from "path";
import { readFileSync } from "fs";

// Guard with typeof window so the client bundle doesn't call resolve at
// module-load — `path` gets stubbed to src/lib/empty-module.js for client
// imports and crashes with "resolve is not a function" otherwise.
const BUNDLED_PATH = typeof window === "undefined"
  ? resolve(process.cwd(), "data", "stars-by-category.json")
  : "";
const REDIS_SLUG = "stars-by-category-daily";
const MIN_REFRESH_INTERVAL_MS = 30_000;

const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

// Keep the canonical hero category order in lockstep with the worker's
// HERO_CATEGORIES. Duplicated here only because the worker package is
// self-contained (tsconfig rootDir: src), so the app can't import it.
export const HERO_CATEGORIES = [
  { id: "ai-agents", label: "AI Agents", color: "#A855F7" },
  { id: "devtools", label: "DevTools", color: "#FB923C" },
  { id: "mcp", label: "MCP", color: "#14B8A6" },
  { id: "ai-ml", label: "AI/ML", color: "#3ad6c5" },
  { id: "browser-automation", label: "Browser", color: "#0EA5E9" },
  { id: "local-llm", label: "Local LLM", color: "#6366F1" },
  { id: "other", label: "Other", color: "#4b5563" },
] as const;

export type HeroCategoryId = (typeof HERO_CATEGORIES)[number]["id"];

export interface ByCategoryDay {
  d: string;
  byCategory: Partial<Record<HeroCategoryId, number>>;
}

export interface StarsByCategoryFile {
  fetchedAt: string;
  windowDays: number;
  totalRepos: number;
  missingSeries: number;
  days: ByCategoryDay[];
}

function emptyFile(): StarsByCategoryFile {
  return {
    fetchedAt: EPOCH_ZERO,
    windowDays: 0,
    totalRepos: 0,
    missingSeries: 0,
    days: [],
  };
}

function coerceDay(raw: unknown): ByCategoryDay | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { d?: unknown; byCategory?: unknown };
  const d = typeof r.d === "string" ? r.d : null;
  if (!d) return null;
  const byCategory: Partial<Record<HeroCategoryId, number>> = {};
  const src = r.byCategory && typeof r.byCategory === "object" ? r.byCategory : {};
  for (const cat of HERO_CATEGORIES) {
    const v = (src as Record<string, unknown>)[cat.id];
    const n = typeof v === "number" ? v : Number(v);
    byCategory[cat.id] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return { d, byCategory };
}

function coerceFile(parsed: unknown): StarsByCategoryFile {
  if (!parsed || typeof parsed !== "object") return emptyFile();
  const p = parsed as Partial<StarsByCategoryFile> & {
    days?: unknown;
  };
  const daysIn = Array.isArray(p.days) ? p.days : [];
  const days = daysIn
    .map((row) => coerceDay(row))
    .filter(Boolean) as ByCategoryDay[];
  days.sort((a, b) => a.d.localeCompare(b.d));
  return {
    fetchedAt: typeof p.fetchedAt === "string" ? p.fetchedAt : EPOCH_ZERO,
    windowDays:
      typeof p.windowDays === "number" && p.windowDays > 0 ? p.windowDays : days.length,
    totalRepos: typeof p.totalRepos === "number" && p.totalRepos >= 0 ? p.totalRepos : 0,
    missingSeries:
      typeof p.missingSeries === "number" && p.missingSeries >= 0
        ? p.missingSeries
        : 0,
    days,
  };
}

function loadBundled(): StarsByCategoryFile {
  try {
    const raw = readFileSync(BUNDLED_PATH, "utf8");
    return coerceFile(JSON.parse(raw));
  } catch {
    return emptyFile();
  }
}

let cache: StarsByCategoryFile | null = null;
let lastRefreshMs = 0;
let inflight: Promise<void> | null = null;

export async function refreshStarsByCategoryFromStore(): Promise<void> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) return;

  inflight = (async () => {
    try {
      // Client bundle never refreshes — avoid pulling data-store (server-only)
      // into the client chunk via Webpack's dynamic-import tracing.
      if (typeof window !== "undefined") {
        if (!cache) cache = loadBundled();
        return;
      }
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<unknown>(REDIS_SLUG);
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

export function getStarsByCategoryFile(): StarsByCategoryFile {
  if (!cache) cache = loadBundled();
  return cache;
}

// ---------------------------------------------------------------------------
// Chart-shape projection for AuroraChart (stackedBars variant).
// ---------------------------------------------------------------------------

export interface ByCategoryPoint {
  /** X-axis key — YYYY-MM-DD. */
  d: string;
  /** One numeric column per category id. */
  [categoryId: string]: string | number;
}

export interface StarsByCategoryChartData {
  /** Days oldest → newest, one entry per UTC day in the window. */
  points: ByCategoryPoint[];
  /** Band keys in legend order (matches HERO_CATEGORIES). */
  categories: typeof HERO_CATEGORIES;
  /** ISO of the worker's last successful aggregation run. */
  fetchedAt: string;
  /** Window length the worker computed (typically 90). */
  windowDays: number;
  /** Repos covered in that aggregation. */
  totalRepos: number;
}

/**
 * Project the raw file into the chart-ready shape Recharts wants. Pure.
 *
 * The optional `sinceDate` (YYYY-MM-DD, inclusive) clips the timeline to
 * recent days only — operator decree 2026-05-30 was to start the home-hero
 * chart at May 2026 so the meaningful weekly bars aren't squeezed against
 * the y-axis by 2 months of near-zero history. Default mirrors that ask;
 * pass `null` to disable the clip.
 */
export function toChartData(
  file: StarsByCategoryFile,
  sinceDate: string | null = "2026-05-01",
): StarsByCategoryChartData {
  const days = sinceDate
    ? file.days.filter((day) => day.d >= sinceDate)
    : file.days;
  const points: ByCategoryPoint[] = days.map((day) => {
    const point: ByCategoryPoint = { d: day.d };
    for (const cat of HERO_CATEGORIES) {
      point[cat.id] = day.byCategory[cat.id] ?? 0;
    }
    return point;
  });
  return {
    points,
    categories: HERO_CATEGORIES,
    fetchedAt: file.fetchedAt,
    windowDays: days.length,
    totalRepos: file.totalRepos,
  };
}
