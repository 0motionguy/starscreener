import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterReposBySources,
  SLUG_TOPIC_NEEDLES,
  SLUG_TO_PLATFORM,
} from "../../filter/by-sources";
import type { Repo } from "../../types";

function repo(): Repo {
  return {
    fullName: "owner/repo",
    owner: "owner",
    name: "repo",
    description: "A small TypeScript package",
    stars: 100,
    starsDelta24h: 1,
    starsDelta7d: 2,
    starsDelta30d: 3,
    forks: 1,
    issues: 1,
    language: "TypeScript",
    topics: ["typescript"],
    tags: ["npm"],
    collectionNames: [],
    mentions: { perSource: {} },
  } as unknown as Repo;
}

test("source filter whitelist excludes retired or unwired source families", () => {
  const known = new Set([
    ...Object.keys(SLUG_TO_PLATFORM),
    ...Object.keys(SLUG_TOPIC_NEEDLES),
  ]);

  for (const retired of [
    "arxiv",
    "hf-models",
    "hf-datasets",
    "hf-spaces",
    "skills",
    "mcp",
    "openai",
    "anthropic",
  ]) {
    assert.equal(known.has(retired), false, `${retired} must not be filterable`);
  }
});

test("source filter ignores retired source URL params instead of hiding rows", () => {
  const repos = [repo()];
  assert.equal(filterReposBySources(repos, new Set(["mcp"])), repos);
  assert.equal(filterReposBySources(repos, new Set(["hf-models"])), repos);
});
