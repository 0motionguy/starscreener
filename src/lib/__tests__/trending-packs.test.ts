// Pack selection (CE-3): predicate matching, cooldown exclusion, thin-pack
// fallback, and the discovery-ranked fresh-finds pack. Pure — synthetic repos.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../types";
import { PACKS, getPack, selectPackRepos } from "../twitter/outbound/packs";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  return {
    id: partial.fullName.replace("/", "--"),
    fullName: partial.fullName,
    name: partial.fullName.split("/")[1] ?? "",
    owner: partial.fullName.split("/")[0] ?? "",
    ownerAvatarUrl: "",
    description: partial.description ?? "",
    url: `https://github.com/${partial.fullName}`,
    language: null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 1000,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2022-01-01T00:00:00.000Z",
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 100,
    categoryRank: 10,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}

const NO_COOLDOWN = new Set<string>();

test("every enabled pack id resolves via getPack; disabled ones don't", () => {
  for (const p of PACKS.filter((p) => p.enabled)) {
    assert.equal(getPack(p.id)?.id, p.id);
  }
  assert.equal(getPack("funding"), undefined); // registered but disabled
  assert.equal(getPack("llm-models"), undefined);
  assert.equal(getPack("nope"), undefined);
});

test("selectPackRepos matches on topics/description, minSize floor to size cap", () => {
  const agents = Array.from({ length: 7 }, (_, i) =>
    makeRepo({
      fullName: `acme/agent${i}`,
      topics: ["ai-agents"],
      description: "An autonomous agent framework",
      starsDelta24h: 50 + i,
    }),
  );
  const noise = [
    makeRepo({ fullName: "acme/css-lib", description: "CSS utilities", starsDelta24h: 900 }),
    makeRepo({ fullName: "acme/game", description: "A voxel game", starsDelta24h: 800 }),
  ];
  const pack = getPack("ai-agents")!;
  // 7 matches with size 10 / minSize 5 -> all 7 ride; noise never sneaks in.
  const picked = selectPackRepos([...agents, ...noise], pack, NO_COOLDOWN);
  assert.equal(picked.length, 7);
  for (const r of picked) {
    assert.match(r.fullName, /agent/, `unexpected member ${r.fullName}`);
  }

  // 14 matches -> capped at pack.size.
  const many = Array.from({ length: 14 }, (_, i) =>
    makeRepo({ fullName: `acme/more${i}`, topics: ["ai-agents"], starsDelta24h: 20 + i }),
  );
  assert.equal(selectPackRepos(many, pack, NO_COOLDOWN).length, pack.size);
});

test("selectPackRepos excludes cooldown members", () => {
  const agents = Array.from({ length: 6 }, (_, i) =>
    makeRepo({
      fullName: `acme/agent${i}`,
      topics: ["agentic"],
      starsDelta24h: 100 + i,
    }),
  );
  const cooldown = new Set(["acme/agent5"]);
  const members = selectPackRepos(agents, getPack("ai-agents")!, cooldown);
  assert.equal(members.length, 5);
  assert.ok(!members.some((r) => r.fullName === "acme/agent5"));
});

test("selectPackRepos returns [] for a thin pack (caller falls back to single)", () => {
  const agents = Array.from({ length: 4 }, (_, i) =>
    makeRepo({ fullName: `acme/agent${i}`, topics: ["agents"], starsDelta24h: 10 }),
  );
  assert.deepEqual(selectPackRepos(agents, getPack("ai-agents")!, NO_COOLDOWN), []);
});

test("weekly-top10 matches everything and returns 10", () => {
  const repos = Array.from({ length: 14 }, (_, i) =>
    makeRepo({ fullName: `o/r${i}`, starsDelta7d: 50 + i, starsDelta24h: 5 + i }),
  );
  const picked = selectPackRepos(repos, getPack("weekly-top10")!, NO_COOLDOWN);
  assert.equal(picked.length, 10);
});

test("fresh-finds uses discovery eligibility — big established repos yield []", () => {
  const giants = Array.from({ length: 8 }, (_, i) =>
    makeRepo({ fullName: `big/repo${i}`, stars: 100_000, starsDelta24h: 500 }),
  );
  assert.deepEqual(selectPackRepos(giants, getPack("fresh-finds")!, NO_COOLDOWN), []);

  const gems = Array.from({ length: 6 }, (_, i) =>
    makeRepo({ fullName: `tiny/gem${i}`, stars: 40 + i, starsDelta24h: 12 }),
  );
  const picked = selectPackRepos(gems, getPack("fresh-finds")!, NO_COOLDOWN);
  assert.equal(picked.length, 6); // every genuine gem rides; zero-score filler never pads to size

  // Mixed pool: giants are score-0 and must not pad the card past the gems.
  const mixed = selectPackRepos([...giants, ...gems], getPack("fresh-finds")!, NO_COOLDOWN);
  assert.equal(mixed.length, 6);
  assert.ok(mixed.every((r) => r.fullName.startsWith("tiny/")));
});
