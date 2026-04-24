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

export interface VerifiedStartup {
  name: string;
  slug: string;
  website: string | null;
  category: string | null;
  paymentProvider: string | null;
  mrrCents: number;
  last30DaysCents: number | null;
  totalCents: number | null;
  growthMrr30d: number | null;
  customers: number | null;
  activeSubscriptions: number | null;
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
}

interface RawCatalogFile {
  generatedAt: string | null;
  total: number;
  startups: RawCatalogEntry[];
}

let cache:
  | { mtimeMs: number; startups: VerifiedStartup[]; generatedAt: string | null }
  | null = null;

function dollarsToCents(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function loadCatalog(): {
  generatedAt: string | null;
  startups: VerifiedStartup[];
} {
  if (!existsSync(CATALOG_PATH)) {
    return { generatedAt: null, startups: [] };
  }
  let raw: RawCatalogFile;
  try {
    raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as RawCatalogFile;
  } catch {
    return { generatedAt: null, startups: [] };
  }
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
      matchedRepoFullName: overlayBySlug.get(entry.slug) ?? null,
    });
  }
  out.sort((a, b) => b.mrrCents - a.mrrCents);
  return { generatedAt: raw.generatedAt ?? null, startups: out };
}

function ensureCache() {
  let mtimeMs = -1;
  try {
    mtimeMs = existsSync(CATALOG_PATH) ? statSync(CATALOG_PATH).mtimeMs : -1;
  } catch {
    mtimeMs = -1;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache;
  const { generatedAt, startups } = loadCatalog();
  cache = { mtimeMs, startups, generatedAt };
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
