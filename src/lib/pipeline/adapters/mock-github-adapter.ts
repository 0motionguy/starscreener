// StarScreener — Mock GitHub adapter.
//
// Deterministic implementation of GitHubAdapter backed by a caller-provided
// repo fixture list. Used in dev/test scenarios where the real GitHub API
// isn't reachable. Phase 0 stripped the bundled mockRepos dataset — callers
// must now pass their own fixtures (typically synthesized in a test helper).
// Constructing this adapter with zero arguments yields an empty dataset;
// every fetch returns null/0 rather than crashing.

import type { Repo } from "@/lib/types";
import type {
  GitHubAdapter,
  GitHubRepoRaw,
  GitHubReleaseRaw,
} from "../types";

export class MockGitHubAdapter implements GitHubAdapter {
  public readonly id = "mock-github" as const;

  private readonly byFullName: Map<string, Repo>;

  constructor(repos: Repo[] = []) {
    this.byFullName = new Map(repos.map((r) => [r.fullName.toLowerCase(), r]));
  }

  async fetchRepo(fullName: string): Promise<GitHubRepoRaw | null> {
    const repo = this.byFullName.get(fullName.toLowerCase());
    if (!repo) return null;
    return synthesizeRepoRaw(repo);
  }

  async fetchLatestRelease(
    fullName: string,
  ): Promise<GitHubReleaseRaw | null> {
    const repo = this.byFullName.get(fullName.toLowerCase());
    if (!repo) return null;
    if (!repo.lastReleaseTag || !repo.lastReleaseAt) return null;
    return {
      tag_name: repo.lastReleaseTag,
      name: repo.lastReleaseTag,
      published_at: repo.lastReleaseAt,
      html_url: `${repo.url}/releases/tag/${repo.lastReleaseTag}`,
      prerelease: false,
      draft: false,
    };
  }

  async fetchContributorCount(fullName: string): Promise<number> {
    const repo = this.byFullName.get(fullName.toLowerCase());
    if (!repo) return 0;
    return repo.contributors;
  }

  async getRateLimit(): Promise<{ remaining: number; reset: string } | null> {
    return {
      remaining: 5000,
      reset: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a GitHubRepoRaw shape from the compact Repo, filling in defaults for
 * fields that aren't represented on the public Repo type.
 */
function synthesizeRepoRaw(repo: Repo): GitHubRepoRaw {
  return {
    id: stableNumericId(repo.id),
    full_name: repo.fullName,
    name: repo.name,
    owner: {
      login: repo.owner,
      avatar_url: repo.ownerAvatarUrl,
    },
    description: repo.description || null,
    html_url: repo.url,
    homepage: null,
    language: repo.language,
    topics: repo.topics,
    stargazers_count: repo.stars,
    forks_count: repo.forks,
    open_issues_count: repo.openIssues,
    watchers_count: repo.stars,
    subscribers_count: Math.round(repo.stars * 0.08),
    size: 5000,
    default_branch: "main",
    license: { spdx_id: "MIT", key: "mit", name: "MIT License" },
    created_at: repo.createdAt,
    updated_at: repo.lastCommitAt,
    pushed_at: repo.lastCommitAt,
    archived: false,
    disabled: false,
  };
}

/**
 * Deterministic positive integer derived from a slug id. Gives each mock
 * repo a stable synthetic GitHub numeric id without collisions for our
 * fixture size.
 */
function stableNumericId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return (h >>> 0) || 1;
}
