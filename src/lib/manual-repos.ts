import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import manualReposJson from "../../data/manual-repos.json";
import type { RecentRepoRow } from "./recent-repos";
import {
  currentDataDir,
  readJsonlFile,
  writeJsonlFile,
} from "./pipeline/storage/file-persistence";
import type { Repo } from "./types";

export const MANUAL_REPOS_FILE = "manual-repos.jsonl";

export interface ManualRepoRecord extends RecentRepoRow {
  intakeSubmissionId: string | null;
  intakeSource: "manual_drop";
  addedAt: string;
  lastIntakeScanAt: string | null;
  whyNow: string | null;
  shareUrl: string | null;
}

interface ManualReposJsonFile {
  fetchedAt: string | null;
  items: RecentRepoRow[];
}

const committedManualRepos = manualReposJson as unknown as ManualReposJsonFile;

function normalizeFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

function runtimeManualReposPath(): string {
  return path.join(currentDataDir(), MANUAL_REPOS_FILE);
}

function parseJsonlRecords(raw: string): ManualRepoRecord[] {
  const out: ManualRepoRecord[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ManualRepoRecord);
    } catch {
      // Ignore corrupt runtime rows; submission records remain the source of
      // truth for operator review and the next upsert will rewrite this file.
    }
  }
  return out;
}

function dedupeRows(rows: RecentRepoRow[]): RecentRepoRow[] {
  const byName = new Map<string, RecentRepoRow>();
  for (const row of rows) {
    if (!row.fullName) continue;
    byName.set(normalizeFullName(row.fullName), row);
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
  );
}

export function manualRepoRecordFromRepo(
  repo: Repo,
  opts: {
    intakeSubmissionId?: string | null;
    whyNow?: string | null;
    shareUrl?: string | null;
    scannedAt?: string;
  } = {},
): ManualRepoRecord {
  const scannedAt = opts.scannedAt ?? new Date().toISOString();
  return {
    githubId: 0,
    fullName: repo.fullName,
    name: repo.name,
    owner: repo.owner,
    ownerAvatarUrl: repo.ownerAvatarUrl,
    description: repo.description,
    url: repo.url,
    language: repo.language,
    topics: repo.topics ?? [],
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    createdAt: repo.createdAt,
    updatedAt: repo.lastCommitAt || repo.createdAt,
    pushedAt: repo.lastCommitAt || repo.createdAt,
    intakeSubmissionId: opts.intakeSubmissionId ?? null,
    intakeSource: "manual_drop",
    addedAt: scannedAt,
    lastIntakeScanAt: scannedAt,
    whyNow: opts.whyNow ?? null,
    shareUrl: opts.shareUrl ?? null,
  };
}

export async function listManualRepoRecords(): Promise<ManualRepoRecord[]> {
  const records = await readJsonlFile<ManualRepoRecord>(MANUAL_REPOS_FILE);
  return records.sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
  );
}

export function listManualRepoRowsSync(): RecentRepoRow[] {
  const rows: RecentRepoRow[] = Array.isArray(committedManualRepos.items)
    ? [...committedManualRepos.items]
    : [];

  const filePath = runtimeManualReposPath();
  if (existsSync(filePath)) {
    try {
      rows.push(...parseJsonlRecords(readFileSync(filePath, "utf8")));
    } catch {
      // Runtime manual repo storage is best-effort for derived listings.
      // Broken rows should not take down public pages.
    }
  }

  return dedupeRows(rows);
}

export function getManualReposDataVersion(): string {
  const committedVersion = committedManualRepos.fetchedAt ?? "committed:none";
  const filePath = runtimeManualReposPath();
  if (!existsSync(filePath)) return committedVersion;
  try {
    const stat = statSync(filePath);
    return `${committedVersion}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return committedVersion;
  }
}

export async function upsertManualRepoRecord(
  record: ManualRepoRecord,
): Promise<ManualRepoRecord> {
  const existing = await listManualRepoRecords();
  const normalized = normalizeFullName(record.fullName);
  const next = [
    record,
    ...existing.filter((item) => normalizeFullName(item.fullName) !== normalized),
  ].sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
  );

  await writeJsonlFile(MANUAL_REPOS_FILE, next);
  return record;
}
