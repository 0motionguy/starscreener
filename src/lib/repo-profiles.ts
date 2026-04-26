// Runtime repo-profile loader.
//
// Unlike the committed JSON imports used for static data snapshots, repo
// profiles are updated by the enrichment scanner while the app is running.
// Read from disk with a lightweight mtime cache so server routes and pages see
// fresh profile data without a process restart.
//
// Phase 4 (data-API): the on-disk file is now a cold-start SEED + DR
// snapshot only. The live source of truth is Redis (via src/lib/data-store).
// Server routes call `refreshRepoProfilesFromStore()` before reading any
// sync getter; that function pulls the freshest payload into the in-memory
// cache and is rate-limited so concurrent renders don't fan out N Redis
// calls.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AisoToolsScan } from "./aiso-tools";
import { getDataStore } from "./data-store";

export type RepoProfileStatus =
  | "scanned"
  | "scan_pending"
  | "scan_running"
  | "scan_failed"
  | "rate_limited"
  | "no_website";

export interface RepoProfileSurface {
  githubUrl: string;
  docsUrl: string | null;
  npmPackages: string[];
  productHuntLaunchId: string | null;
}

export interface RepoProfile {
  fullName: string;
  rank: number | null;
  selectedFrom: string;
  websiteUrl: string | null;
  websiteSource: "producthunt" | "github_homepage" | "npm_homepage" | null;
  status: RepoProfileStatus;
  lastProfiledAt: string;
  nextScanAfter: string | null;
  surfaces: RepoProfileSurface;
  aisoScan: AisoToolsScan | null;
  error: string | null;
}

export interface RepoProfilesFile {
  generatedAt: string | null;
  version: number;
  selection: {
    source: string;
    limit: number;
    maxScans: number;
    scanned: number;
    queued: number;
    noWebsite: number;
    failed: number;
  };
  profiles: RepoProfile[];
}

const FILE_PATH = resolve(process.cwd(), "data", "repo-profiles.json");
const EMPTY_FILE: RepoProfilesFile = {
  generatedAt: null,
  version: 1,
  selection: {
    source: "not-run",
    limit: 0,
    maxScans: 0,
    scanned: 0,
    queued: 0,
    noWebsite: 0,
    failed: 0,
  },
  profiles: [],
};

interface RepoProfilesCacheEntry {
  /** mtimeMs when sourced from disk, or a synthetic key when sourced from Redis. */
  signature: string;
  file: RepoProfilesFile;
  byFullName: Map<string, RepoProfile>;
}

let cache: RepoProfilesCacheEntry | null = null;

function loadFileSync(): RepoProfilesFile {
  if (!existsSync(FILE_PATH)) return EMPTY_FILE;
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as RepoProfilesFile;
    return normalizeFile(parsed);
  } catch {
    return EMPTY_FILE;
  }
}

function normalizeFile(input: unknown): RepoProfilesFile {
  if (!input || typeof input !== "object") return EMPTY_FILE;
  const parsed = input as Partial<RepoProfilesFile>;
  return {
    ...EMPTY_FILE,
    ...parsed,
    selection: {
      ...EMPTY_FILE.selection,
      ...(parsed.selection ?? {}),
    },
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
  };
}

function buildIndex(file: RepoProfilesFile): Map<string, RepoProfile> {
  const byFullName = new Map<string, RepoProfile>();
  for (const profile of file.profiles) {
    byFullName.set(profile.fullName.toLowerCase(), profile);
  }
  return byFullName;
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

function ensureCache(): RepoProfilesCacheEntry {
  const sig = diskSignature();
  if (cache && cache.signature === sig) return cache;
  // Only re-read from disk if the signature actually points at a disk
  // mtime; a synthetic Redis signature stays stable until the next refresh.
  if (cache && cache.signature.startsWith("redis:")) {
    return cache;
  }

  const file = loadFileSync();
  cache = { signature: sig, file, byFullName: buildIndex(file) };
  return cache;
}

export function readRepoProfilesFileSync(): RepoProfilesFile {
  return ensureCache().file;
}

export function getRepoProfile(fullName: string): RepoProfile | null {
  return ensureCache().byFullName.get(fullName.toLowerCase()) ?? null;
}

export function listRepoProfiles(): RepoProfile[] {
  return readRepoProfilesFileSync().profiles;
}

export function getRepoProfileSelection() {
  return readRepoProfilesFileSync().selection;
}

export function getRepoProfilesGeneratedAt(): string | null {
  return readRepoProfilesFileSync().generatedAt ?? null;
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls the freshest repo-profiles payload from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest repo-profiles payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal
 * dedupe + rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Safe to call from any server-component / route handler before reading any
 * sync getter. Never throws — on Redis miss the existing cache is preserved.
 */
export async function refreshRepoProfilesFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const store = getDataStore();
      const result = await store.read<unknown>("repo-profiles");
      if (result.data && result.source !== "missing") {
        const next = normalizeFile(result.data);
        // Synthetic signature so ensureCache() doesn't try to re-read from
        // disk on the next call. Invalidates naturally on the next refresh.
        cache = {
          signature: `redis:${result.writtenAt ?? Date.now()}`,
          file: next,
          byFullName: buildIndex(next),
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
 * Test/admin — drop the in-memory cache so the next read goes to disk.
 * Lets tests exercise the refresh path without leaking state across cases.
 */
export function _resetRepoProfilesCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
