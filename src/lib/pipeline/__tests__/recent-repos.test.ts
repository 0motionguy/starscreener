import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBaseRepoFromRecent,
  getRecentRepos,
} from "../../recent-repos";

test("recent repo fixture file loads even when empty", () => {
  const rows = getRecentRepos();
  assert.ok(Array.isArray(rows));
});

test("buildBaseRepoFromRecent maps recent discovery rows into Repo shape", () => {
  const repo = buildBaseRepoFromRecent({
    githubId: 1,
    fullName: "acme/fresh-launch",
    name: "fresh-launch",
    owner: "acme",
    ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    description: "new repo",
    url: "https://github.com/acme/fresh-launch",
    language: "TypeScript",
    topics: ["ai", "agents"],
    stars: 42,
    forks: 3,
    openIssues: 2,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T01:00:00.000Z",
    pushedAt: "2026-04-20T02:00:00.000Z",
  });

  assert.equal(repo.id, "acme--fresh-launch");
  assert.equal(repo.fullName, "acme/fresh-launch");
  assert.equal(repo.stars, 42);
  assert.equal(repo.forks, 3);
  assert.equal(repo.lastCommitAt, "2026-04-20T02:00:00.000Z");
  assert.equal(repo.createdAt, "2026-04-20T00:00:00.000Z");
  assert.deepEqual(repo.topics, ["ai", "agents"]);
  assert.equal(repo.starsDelta24h, 0);
  assert.equal(repo.hasMovementData, false);
  assert.equal(repo.starsDelta24hMissing, true);
  assert.equal(repo.starsDelta7dMissing, true);
  assert.equal(repo.starsDelta30dMissing, true);
  assert.equal(repo.trendScore24h, 0);
});
