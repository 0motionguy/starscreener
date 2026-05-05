import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getBriefDifferentiationLens,
  getCategoryKind,
  type RepoCategoryKind,
} from "@/lib/repo-category-details";
import type { Repo } from "@/lib/types";

function makeRepo(overrides: Partial<Repo>): Repo {
  return {
    id: "r1",
    source: "trending",
    owner: "acme",
    name: "base",
    fullName: "acme/base",
    description: null,
    url: "https://github.com/acme/base",
    stars: 100,
    forks: 10,
    language: "TypeScript",
    topics: [],
    categoryId: "frameworks",
    createdAt: "2026-01-01T00:00:00.000Z",
    pushedAt: "2026-01-02T00:00:00.000Z",
    score: 0,
    scoreBreakdown: {},
    starsDelta: { d1: 0, d7: 0, d30: 0 },
    ...overrides,
  } as Repo;
}

test("getCategoryKind classifies mcp/skill/agent/library", () => {
  const mcp = makeRepo({ categoryId: "mcp" });
  const skill = makeRepo({ name: "ops-skill-pack" });
  const agent = makeRepo({ topics: ["ai-agent"] });
  const library = makeRepo({ name: "http-client", topics: ["http"] });

  assert.equal(getCategoryKind(mcp), "mcp");
  assert.equal(getCategoryKind(skill), "skill");
  assert.equal(getCategoryKind(agent), "agent");
  assert.equal(getCategoryKind(library), "library");
});

test("getBriefDifferentiationLens returns a non-empty category-specific lens", () => {
  const kinds: RepoCategoryKind[] = ["mcp", "skill", "agent", "library"];
  const lenses = kinds.map((kind) => getBriefDifferentiationLens(kind));

  for (const lens of lenses) {
    assert.ok(lens.length > 40);
  }
  assert.equal(new Set(lenses).size, lenses.length);
});
