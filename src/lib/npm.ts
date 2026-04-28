// npm package telemetry loader.
//
// Reads data/npm-packages.json produced by scripts/scrape-npm.mjs. npm is a
// package-adoption signal, not a news/social feed: rows represent download
// velocity and registry metadata, then link back to GitHub repos.

import npmData from "../../data/npm-packages.json";
import npmManualData from "../../data/npm-manual-packages.json";
export type NpmWindow = "24h" | "7d" | "30d";

export interface NpmDownloadDay {
  day: string;
  downloads: number;
}

export interface NpmPackageRow {
  name: string;
  status: "ok";
  npmUrl: string;
  description: string | null;
  latestVersion: string | null;
  publishedAt: string | null;
  repositoryUrl: string | null;
  linkedRepo: string;
  homepage: string | null;
  keywords: string[];
  discovery: {
    queries: string[];
    searchScore: number;
    finalScore: number;
    weeklyDownloads?: number;
    monthlyDownloads?: number;
  };
  downloads: NpmDownloadDay[];
  downloads24h: number;
  previous24h: number;
  delta24h: number;
  deltaPct24h: number;
  downloads7d: number;
  previous7d: number;
  delta7d: number;
  deltaPct7d: number;
  downloads30d: number;
  previous30d: number;
  delta30d: number;
  deltaPct30d: number;
  trendScore24h: number;
  trendScore7d: number;
  trendScore30d: number;
  error: string | null;
}

export interface NpmPackagesFile {
  fetchedAt: string;
  source: "npm";
  sourceUrl: string;
  registrySearchUrl: string;
  windowDays: number;
  windows: NpmWindow[];
  activeWindowDefault: NpmWindow;
  downloadRange: string;
  lagHint: string;
  discovery: {
    mode: string;
    searchSize: number;
    topLimit: number;
    candidateLimit?: number;
    downloadRangeDelayMs?: number;
    downloadLagDays?: number;
    queries: string[];
    candidatesFound: number;
    failures: Array<{ query?: string; package?: string; error: string }>;
  };
  counts: {
    total: number;
    ok: number;
    missing: number;
    error: number;
    linkedRepos: number;
  };
  top: Record<NpmWindow, string[]>;
  packages: NpmPackageRow[];
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshNpmFromStore(). Sync getters below all read this.
let file: NpmPackagesFile = npmData as unknown as NpmPackagesFile;
const manualFile = npmManualData as unknown as Pick<NpmPackagesFile, "packages">;

// Backwards-compat constants — capture the cache value at import time.
// New callers should use the matching getter to see post-refresh values.
export const npmFetchedAt: string = file.fetchedAt ?? "";
export const npmCold: boolean =
  !file.fetchedAt || !Array.isArray(file.packages);

export function getNpmFetchedAt(): string {
  return file.fetchedAt ?? "";
}

export function getNpmCold(): boolean {
  return !file.fetchedAt || !Array.isArray(file.packages);
}

export function getNpmPackagesFile(): NpmPackagesFile {
  return file;
}

export function getNpmPackages(): NpmPackageRow[] {
  const byName = new Map<string, NpmPackageRow>();
  for (const pkg of file.packages ?? []) {
    byName.set(pkg.name.toLowerCase(), pkg);
  }
  for (const pkg of manualFile.packages ?? []) {
    byName.set(pkg.name.toLowerCase(), pkg);
  }
  return Array.from(byName.values());
}

export function metricForNpmWindow(pkg: NpmPackageRow, window: NpmWindow): number {
  if (window === "24h") return pkg.trendScore24h;
  if (window === "7d") return pkg.trendScore7d;
  return pkg.trendScore30d;
}

export function downloadsForNpmWindow(
  pkg: NpmPackageRow,
  window: NpmWindow,
): number {
  if (window === "24h") return pkg.downloads24h;
  if (window === "7d") return pkg.downloads7d;
  return pkg.downloads30d;
}

export function deltaPctForNpmWindow(
  pkg: NpmPackageRow,
  window: NpmWindow,
): number | null {
  if (window === "24h") return pkg.deltaPct24h ?? null;
  if (window === "7d") return pkg.deltaPct7d ?? null;
  return pkg.deltaPct30d ?? null;
}

export function deltaForNpmWindow(pkg: NpmPackageRow, window: NpmWindow): number {
  if (window === "24h") return pkg.delta24h ?? 0;
  if (window === "7d") return pkg.delta7d ?? 0;
  return pkg.delta30d ?? 0;
}

export function getTopNpmPackages(
  window: NpmWindow = "24h",
  limit?: number,
): NpmPackageRow[] {
  const sorted = getNpmPackages().slice().sort((a, b) => {
    const byMetric = metricForNpmWindow(b, window) - metricForNpmWindow(a, window);
    if (byMetric !== 0) return byMetric;
    const byPct =
      (deltaPctForNpmWindow(b, window) ?? 0) -
      (deltaPctForNpmWindow(a, window) ?? 0);
    if (byPct !== 0) return byPct;
    const byDelta = deltaForNpmWindow(b, window) - deltaForNpmWindow(a, window);
    if (byDelta !== 0) return byDelta;
    const byDownloads = b.downloads30d - a.downloads30d;
    if (byDownloads !== 0) return byDownloads;
    return a.name.localeCompare(b.name);
  });
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

export function getNpmPackageByName(name: string): NpmPackageRow | null {
  const lower = name.toLowerCase();
  return getNpmPackages().find((pkg) => pkg.name.toLowerCase() === lower) ?? null;
}

export function getNpmPackagesForRepo(fullName: string): NpmPackageRow[] {
  const lower = fullName.toLowerCase();
  return getNpmPackages().filter(
    (pkg) => pkg.linkedRepo.toLowerCase() === lower,
  );
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh npm-packages from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest npm-packages payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal dedupe +
 * rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Note: only the auto-scraped `npm-packages` slug is refreshed — the static
 * `npm-manual-packages.json` overlay continues to load from the bundled file.
 */
export async function refreshNpmFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<NpmPackagesFile>("npm-packages");
    if (result.data && result.source !== "missing") {
      file = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Test/admin — reset the in-memory cache to the bundled seed. */
export function _resetNpmCacheForTests(): void {
  file = npmData as unknown as NpmPackagesFile;
  lastRefreshMs = 0;
  inflight = null;
}
