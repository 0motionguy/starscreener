// Runtime loader for the broader verified-revenue leaderboard.
//
// Unlike src/lib/revenue-overlays.ts (which only surfaces startups that
// matched one of our tracked repos), this reads the full cached catalog
// and exposes a filtered/sorted view of all verified-revenue startups —
// used by the /revenue leaderboard section so the page has substance even
// when only a handful of tracked repos match.
//
// Keep the "tracked repos" anchor separate from this view — two sections on
// the page, different roles. The leaderboard is dev/AI-adjacent only; we
// skip travel, health, games, real-estate, crypto categories that dilute
// the TrendingRepo identity.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { listRevenueOverlays } from "./revenue-overlays";
import { getDataStore } from "./data-store";

export interface VerifiedStartup {
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
  category: string | null;
  paymentProvider: string | null;
  mrrCents: number;
  last30DaysCents: number | null;
  totalCents: number | null;
  growthMrr30d: number | null;
  customers: number | null;
  activeSubscriptions: number | null;
  /** Founder's X handle (no "@"). Drives founder link + avatar. */
  xHandle: string | null;
  /** 2-letter ISO country code. Used to render a flag emoji. */
  country: string | null;
  /** ISO date or year parseable. Used to show "since YYYY". */
  foundedDate: string | null;
  visitorsLast30Days: number | null;
  /** When this startup's website matched one of our tracked repos. */
  matchedRepoFullName: string | null;
}

/**
 * Categories we surface on /revenue leaderboard. Chosen for TrendingRepo's
 * developer/AI-adjacent audience. Omitted: Travel, Health & Fitness, Games,
 * Real Estate, Crypto & Web3, E-commerce, News & Magazines, Entertainment,
 * Recruiting & HR, Mobile Apps, Community, Marketplace, Education, Fintech,
 * Customer Support, uncategorized. Add to this set if the audience shifts.
 */
export const LEADERBOARD_CATEGORIES: readonly string[] = [
  "Artificial Intelligence",
  "Developer Tools",
  "Productivity",
  "SaaS",
  "No-Code",
  "Design Tools",
  "Analytics",
  "Security",
  "Sales",
  "Marketing",
  "Social Media",
  "Content Creation",
  "Utilities",
];

const LEADERBOARD_SET = new Set(LEADERBOARD_CATEGORIES);

const CATALOG_PATH = resolve(
  process.cwd(),
  "data",
  "trustmrr-startups.json",
);

interface RawCatalogEntry {
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
  category: string | null;
  paymentProvider: string | null;
  revenue?: {
    mrr: number | null;
    last30Days: number | null;
    total: number | null;
  };
  growthMRR30d: number | null;
  customers: number | null;
  activeSubscriptions: number | null;
  xHandle: string | null;
  country: string | null;
  foundedDate: string | null;
  visitorsLast30Days: number | null;
}

interface RawCatalogFile {
  generatedAt: string | null;
  total: number;
  startups: RawCatalogEntry[];
}

interface CatalogCacheEntry {
  /** disk:<mtime> when sourced from disk; redis:<writtenAt> when sourced from Redis. */
  signature: string;
  startups: VerifiedStartup[];
  generatedAt: string | null;
}

let cache: CatalogCacheEntry | null = null;

function dollarsToCents(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function loadCatalogFromDisk(): RawCatalogFile | null {
  if (!existsSync(CATALOG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as RawCatalogFile;
  } catch {
    return null;
  }
}

function projectCatalog(raw: RawCatalogFile | null): {
  generatedAt: string | null;
  startups: VerifiedStartup[];
} {
  if (!raw) return { generatedAt: null, startups: [] };
  const overlayBySlug = new Map<string, string>();
  for (const overlay of listRevenueOverlays()) {
    if (overlay.trustmrrSlug) {
      overlayBySlug.set(overlay.trustmrrSlug, overlay.fullName);
    }
  }

  const out: VerifiedStartup[] = [];
  for (const entry of raw.startups ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const mrrCents = dollarsToCents(entry.revenue?.mrr);
    if (mrrCents === null || mrrCents <= 0) continue;
    out.push({
      name: entry.name,
      slug: entry.slug,
      website: entry.website ?? null,
      description: entry.description ?? null,
      category: entry.category ?? null,
      paymentProvider: entry.paymentProvider ?? null,
      mrrCents,
      last30DaysCents: dollarsToCents(entry.revenue?.last30Days),
      totalCents: dollarsToCents(entry.revenue?.total),
      growthMrr30d:
        typeof entry.growthMRR30d === "number" && Number.isFinite(entry.growthMRR30d)
          ? entry.growthMRR30d
          : null,
      customers:
        typeof entry.customers === "number" ? entry.customers : null,
      activeSubscriptions:
        typeof entry.activeSubscriptions === "number"
          ? entry.activeSubscriptions
          : null,
      xHandle:
        typeof entry.xHandle === "string" && entry.xHandle.trim()
          ? entry.xHandle.replace(/^@/, "").trim()
          : null,
      country:
        typeof entry.country === "string" && entry.country.length === 2
          ? entry.country.toUpperCase()
          : null,
      foundedDate: entry.foundedDate ?? null,
      visitorsLast30Days:
        typeof entry.visitorsLast30Days === "number"
          ? entry.visitorsLast30Days
          : null,
      matchedRepoFullName: overlayBySlug.get(entry.slug) ?? null,
    });
  }
  out.sort((a, b) => b.mrrCents - a.mrrCents);
  return { generatedAt: raw.generatedAt ?? null, startups: out };
}

function diskSignature(): string {
  try {
    return existsSync(CATALOG_PATH)
      ? `disk:${statSync(CATALOG_PATH).mtimeMs}`
      : "missing";
  } catch {
    return "missing";
  }
}

function ensureCache(): CatalogCacheEntry {
  const sig = diskSignature();
  if (cache && cache.signature === sig) return cache;
  // Synthetic redis: signatures stay stable until refresh hook overwrites.
  if (cache && cache.signature.startsWith("redis:")) return cache;
  const { generatedAt, startups } = projectCatalog(loadCatalogFromDisk());
  cache = { signature: sig, startups, generatedAt };
  return cache;
}

export interface LeaderboardQuery {
  /** ISO category name, or null for the default allowlist. */
  category?: string | null;
  /** Max rows to return. Default 100. */
  limit?: number;
}

export interface LeaderboardResult {
  rows: VerifiedStartup[];
  totalInFilter: number;
  totalMrrCents: number;
  topMrrCents: number;
  generatedAt: string | null;
  availableCategories: string[];
}

export function getLeaderboard(
  query: LeaderboardQuery = {},
): LeaderboardResult {
  const { startups, generatedAt } = ensureCache();
  const limit = Math.max(1, Math.min(500, query.limit ?? 100));
  const category = query.category ?? null;

  const allAllowed = category === "__all__";
  const filtered = startups.filter((s) => {
    if (!s.category) return false;
    if (allAllowed) return true;
    if (category) return s.category === category;
    return LEADERBOARD_SET.has(s.category);
  });

  const totalMrrCents = filtered.reduce((sum, s) => sum + s.mrrCents, 0);
  const rows = filtered.slice(0, limit);

  // Categories we have data for that are in the allowlist plus anything
  // present in the corpus — deduped.
  const presentCategories = new Set<string>();
  for (const s of startups) {
    if (s.category) presentCategories.add(s.category);
  }
  // Show allowlist first, then any extra categories that have data.
  const availableCategories = [
    ...LEADERBOARD_CATEGORIES.filter((c) => presentCategories.has(c)),
    ...[...presentCategories]
      .filter((c) => !LEADERBOARD_SET.has(c))
      .sort(),
  ];

  return {
    rows,
    totalInFilter: filtered.length,
    totalMrrCents,
    topMrrCents: filtered[0]?.mrrCents ?? 0,
    generatedAt,
    availableCategories,
  };
}

// ---------------------------------------------------------------------------
// Refresh hook + meta helper.
//
// trustmrr-startups.json is ~7 MB so we deliberately split the data-store
// shape: callers that just need the count use getTrustMrrMeta() and avoid
// pulling the full blob across the network. The full catalog is still
// fetched here for the leaderboard surface.
// ---------------------------------------------------------------------------

export interface TrustMrrMeta {
  generatedAt: string | null;
  startupCount: number;
  totalReported: number | null;
  /** Serialized JSON byte length of the catalog payload. */
  totalSize: number | null;
  fetchedAt: string | null;
  /** "redis" | "file" | "memory" | "missing" — where the meta value came from. */
  source: "redis" | "file" | "memory" | "missing";
}

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest trustmrr-startups payload from the data-store and swap
 * it into the in-memory cache. Cheap to call multiple times — internal
 * dedupe + rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Note: this fetches the FULL ~7 MB catalog. Routes that only need counts /
 * generatedAt should use getTrustMrrMeta() instead.
 */
export async function refreshRevenueStartupsFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const store = getDataStore();
      const result = await store.read<RawCatalogFile>("trustmrr-startups");
      if (result.data && result.source !== "missing") {
        const projected = projectCatalog(result.data);
        cache = {
          signature: `redis:${result.writtenAt ?? Date.now()}`,
          startups: projected.startups,
          generatedAt: projected.generatedAt,
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

/**
 * Lightweight meta helper — fetches only `ss:data:v1:trustmrr-startups:meta`,
 * which the sync writer publishes alongside the full catalog. Callers that
 * just need to render "X startups tracked" or check freshness avoid pulling
 * the ~7 MB blob across the network. Falls back to deriving counts from the
 * in-memory cache when the meta key is missing.
 */
export async function getTrustMrrMeta(): Promise<TrustMrrMeta> {
  try {
    const store = getDataStore();
    const result = await store.read<{
      generatedAt?: string;
      startupCount?: number;
      totalReported?: number;
      totalSize?: number;
      fetchedAt?: string;
    }>("trustmrr-startups:meta");
    if (result.data && result.source !== "missing") {
      return {
        generatedAt: result.data.generatedAt ?? null,
        startupCount: result.data.startupCount ?? 0,
        totalReported: result.data.totalReported ?? null,
        totalSize: result.data.totalSize ?? null,
        fetchedAt: result.data.fetchedAt ?? null,
        source: result.source,
      };
    }
  } catch {
    // fall through to cache-derived fallback
  }

  // Fallback — derive from the in-memory projected cache if available. Note
  // this is a count of startups WITH non-zero MRR (post-projection), not the
  // raw catalog count, but it's the best we can do without the meta key.
  const { startups, generatedAt } = ensureCache();
  return {
    generatedAt,
    startupCount: startups.length,
    totalReported: null,
    totalSize: null,
    fetchedAt: null,
    source: "missing",
  };
}

/** Test/admin — drop the in-memory cache so the next read goes to disk. */
export function _resetRevenueStartupsCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
