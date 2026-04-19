// StarScreener — Test fixtures for the agent-tool layer.
//
// Uses the same "reach-in" reset pattern as
// src/lib/pipeline/__tests__/featured.test.ts (which documents the same
// unknown-cast hack). Only meant for tests.

import type { Repo } from "../../lib/types";
import { repoStore } from "../../lib/pipeline/storage/singleton";

export function makeRepo(
  partial: Partial<Repo> & { id: string },
): Repo {
  const [owner = "", name = ""] = partial.id.split("--");
  const fullName = partial.fullName ?? `${owner}/${name}`;
  return {
    id: partial.id,
    fullName,
    name: partial.name ?? name,
    owner: partial.owner ?? owner,
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${fullName}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 1000,
    forks: partial.forks ?? 100,
    contributors: partial.contributors ?? 10,
    openIssues: partial.openIssues ?? 5,
    lastCommitAt: partial.lastCommitAt ?? new Date().toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? "2022-01-01T00:00:00.000Z",
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 50,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 100,
    categoryRank: partial.categoryRank ?? 10,
    sparklineData: partial.sparklineData ?? new Array(30).fill(10),
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
    archived: partial.archived,
    deleted: partial.deleted,
    tags: partial.tags,
  };
}

export function clearRepoStore(): void {
  const store = repoStore as unknown as {
    byId: Map<string, unknown>;
    byFullName: Map<string, unknown>;
  };
  store.byId.clear();
  store.byFullName.clear();
}

export function seedRepos(repos: Repo[]): void {
  for (const r of repos) repoStore.upsert(r);
}
