import repoMetadataJson from "../../data/repo-metadata.json";

export interface RepoMetadata {
  githubId: number | null;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  homepageUrl?: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  defaultBranch: string | null;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  fetchedAt: string;
}

export interface RepoMetadataFailure {
  fullName: string;
  reason: string;
  error?: string;
}

interface RepoMetadataFile {
  fetchedAt: string | null;
  sourceCount?: number;
  items: RepoMetadata[];
  failures?: RepoMetadataFailure[];
}

const data = repoMetadataJson as unknown as RepoMetadataFile;

export const repoMetadataFetchedAt: string | null = data.fetchedAt ?? null;

let _byFullName: Map<string, RepoMetadata> | null = null;

function byFullName(): Map<string, RepoMetadata> {
  if (_byFullName) return _byFullName;
  _byFullName = new Map();
  for (const item of data.items ?? []) {
    if (!item.fullName) continue;
    _byFullName.set(item.fullName.toLowerCase(), item);
  }
  return _byFullName;
}

export function getRepoMetadata(fullName: string): RepoMetadata | null {
  return byFullName().get(fullName.toLowerCase()) ?? null;
}

export function listRepoMetadata(): RepoMetadata[] {
  return data.items ?? [];
}

export function getRepoMetadataCount(): number {
  return data.items?.length ?? 0;
}

export function getRepoMetadataSourceCount(): number {
  return data.sourceCount ?? 0;
}

export function getRepoMetadataFailures(): RepoMetadataFailure[] {
  return Array.isArray(data.failures) ? data.failures : [];
}

export function getRepoMetadataCoveragePct(): number {
  const sourceCount = getRepoMetadataSourceCount();
  if (sourceCount <= 0) return 0;
  return (getRepoMetadataCount() * 100) / sourceCount;
}
