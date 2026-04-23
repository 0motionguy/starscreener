// Runtime repo-profile loader.
//
// Unlike the committed JSON imports used for static data snapshots, repo
// profiles are updated by the enrichment scanner while the app is running.
// Read from disk with a lightweight mtime cache so server routes and pages see
// fresh profile data without a process restart.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AisoToolsScan } from "./aiso-tools";

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

let cache:
  | {
      mtimeMs: number;
      file: RepoProfilesFile;
      byFullName: Map<string, RepoProfile>;
    }
  | null = null;

function loadFileSync(): RepoProfilesFile {
  if (!existsSync(FILE_PATH)) return EMPTY_FILE;
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as RepoProfilesFile;
    return {
      ...EMPTY_FILE,
      ...parsed,
      selection: {
        ...EMPTY_FILE.selection,
        ...(parsed.selection ?? {}),
      },
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    };
  } catch {
    return EMPTY_FILE;
  }
}

function ensureCache() {
  let mtimeMs = -1;
  try {
    mtimeMs = existsSync(FILE_PATH) ? statSync(FILE_PATH).mtimeMs : -1;
  } catch {
    mtimeMs = -1;
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache;

  const file = loadFileSync();
  const byFullName = new Map<string, RepoProfile>();
  for (const profile of file.profiles) {
    byFullName.set(profile.fullName.toLowerCase(), profile);
  }
  cache = { mtimeMs, file, byFullName };
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
