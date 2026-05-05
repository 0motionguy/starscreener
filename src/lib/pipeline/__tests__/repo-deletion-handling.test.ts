import assert from "node:assert/strict";
import { test } from "node:test";

import type { Repo } from "@/lib/types";
import { decideCleanupChange } from "@/lib/pipeline/repo-deletion";
import type { GitHubRepoFetchOutcome } from "@/lib/pipeline/types";

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "vercel--next-js",
    fullName: "vercel/next.js",
    owner: "vercel",
    name: "next.js",
    description: "",
    url: "https://github.com/vercel/next.js",
    stars: 1,
    forks: 1,
    openIssues: 0,
    language: "TypeScript",
    topics: [],
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    contributors: 1,
    createdAt: new Date().toISOString(),
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 1,
    categoryRank: 1,
    sparklineData: [],
    categoryId: "other",
    ownerAvatarUrl: "",
    mentionCount24h: 0,
    socialBuzzScore: 0,
    archived: false,
    deleted: false,
    ...overrides,
  };
}

test("cleanup marks deleted only on verified not_found outcome", () => {
  const repo = makeRepo();
  const notFound: GitHubRepoFetchOutcome = { status: "not_found", repo: null };
  const unavailable: GitHubRepoFetchOutcome = {
    status: "unavailable",
    repo: null,
    reason: "http_500",
  };

  const deleted = decideCleanupChange(repo, notFound, "all");
  assert.equal(deleted.change, "deleted");
  assert.equal(deleted.nextRepo?.deleted, true);

  const skipped = decideCleanupChange(repo, unavailable, "all");
  assert.equal(skipped.change, "none");
  assert.equal(skipped.nextRepo, null);
});

test("cleanup revives repo when upstream is healthy and not archived", () => {
  const repo = makeRepo({ archived: true, deleted: true });
  const ok: GitHubRepoFetchOutcome = {
    status: "ok",
    repo: {
      id: 1,
      full_name: "vercel/next.js",
      name: "next.js",
      owner: { login: "vercel", avatar_url: "" },
      description: null,
      html_url: "https://github.com/vercel/next.js",
      homepage: null,
      language: "TypeScript",
      topics: [],
      stargazers_count: 1,
      forks_count: 1,
      open_issues_count: 0,
      watchers_count: 1,
      subscribers_count: 0,
      size: 1,
      default_branch: "main",
      license: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pushed_at: new Date().toISOString(),
      archived: false,
      disabled: false,
    },
  };

  const revived = decideCleanupChange(repo, ok, "all");
  assert.equal(revived.change, "revived");
  assert.equal(revived.nextRepo?.archived, false);
  assert.equal(revived.nextRepo?.deleted, false);
});
