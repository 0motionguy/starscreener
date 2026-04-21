// npm package telemetry loader.
//
// Reads data/npm-packages.json produced by scripts/scrape-npm.mjs. npm is a
// package-adoption signal, not a news/social feed: rows represent download
// velocity and registry metadata, then optionally link back to GitHub repos.

import npmData from "../../data/npm-packages.json";

export type NpmPackageStatus = "ok" | "missing" | "error";

export interface NpmDownloadDay {
  day: string;
  downloads: number;
}

export interface NpmPackageRow {
  name: string;
  status: NpmPackageStatus;
  npmUrl: string;
  description: string | null;
  latestVersion: string | null;
  publishedAt: string | null;
  repositoryUrl: string | null;
  linkedRepo: string | null;
  homepage: string | null;
  downloads: NpmDownloadDay[];
  downloadsLastDay: number;
  downloads7d: number;
  previous7d: number;
  downloads30d: number;
  delta7d: number;
  deltaPct7d: number;
  trendScore: number;
  error: string | null;
}

export interface NpmPackagesFile {
  fetchedAt: string;
  source: "npm";
  sourceUrl: string;
  registryUrl: string;
  windowDays: number;
  downloadRange: string;
  lagHint: string;
  counts: {
    total: number;
    ok: number;
    missing: number;
    error: number;
    linkedRepos: number;
  };
  packages: NpmPackageRow[];
}

const file = npmData as unknown as NpmPackagesFile;

export const npmFetchedAt: string = file.fetchedAt ?? "";
export const npmCold: boolean =
  !file.fetchedAt || !Array.isArray(file.packages);

export function getNpmPackagesFile(): NpmPackagesFile {
  return file;
}

export function getNpmPackages(): NpmPackageRow[] {
  return file.packages ?? [];
}

export function getNpmPackageByName(name: string): NpmPackageRow | null {
  const lower = name.toLowerCase();
  return getNpmPackages().find((pkg) => pkg.name.toLowerCase() === lower) ?? null;
}

export function getNpmPackagesForRepo(fullName: string): NpmPackageRow[] {
  const lower = fullName.toLowerCase();
  return getNpmPackages().filter(
    (pkg) => pkg.linkedRepo?.toLowerCase() === lower,
  );
}
