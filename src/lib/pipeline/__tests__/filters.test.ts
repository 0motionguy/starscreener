// StarScreener — filter + sort utility tests
//
// Covers applyMetaFilter / sortReposByColumn / extractLanguages /
// repoInStarsRange. Pure functions — no hooks, no store, no React.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  applyMetaFilter,
  applyTerminalTabFilter,
  extractLanguages,
  getEffectiveSortColumn,
  repoInStarsRange,
  trendScoreForTimeRange,
  sortReposForTerminal,
  sortReposByColumn,
} from "../../filters";
import type { Repo } from "../../types";

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = partial.fullName.split("/");
  return {
    id: partial.id ?? `${owner}--${name}`,
    fullName: partial.fullName,
    name: partial.name ?? name ?? "",
    owner: partial.owner ?? owner ?? "",
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${partial.fullName}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 0,
    forks: partial.forks ?? 0,
    contributors: partial.contributors ?? 0,
    openIssues: partial.openIssues ?? 0,
    lastCommitAt: partial.lastCommitAt ?? new Date().toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    trendScore24h: partial.trendScore24h ?? 0,
    trendScore7d: partial.trendScore7d ?? 0,
    trendScore30d: partial.trendScore30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 0,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 0,
    categoryRank: partial.categoryRank ?? 0,
    sparklineData: partial.sparklineData ?? [],
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
  };
}

const DAY_MS = 86_400_000;
const now = Date.now();
const iso = (offsetDays: number) =>
  new Date(now - offsetDays * DAY_MS).toISOString();

// ---------------------------------------------------------------------------
// applyMetaFilter
// ---------------------------------------------------------------------------

test("applyMetaFilter('hot') returns only hot repos", () => {
  const repos = [
    makeRepo({ fullName: "a/hot", movementStatus: "hot" }),
    makeRepo({ fullName: "b/stable", movementStatus: "stable" }),
    makeRepo({ fullName: "c/hot2", movementStatus: "hot" }),
    makeRepo({ fullName: "d/break", movementStatus: "breakout" }),
  ];
  const out = applyMetaFilter(repos, "hot");
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.movementStatus === "hot"));
});

test("applyMetaFilter('breakouts') returns only breakout repos", () => {
  const repos = [
    makeRepo({ fullName: "a/b", movementStatus: "breakout" }),
    makeRepo({ fullName: "b/h", movementStatus: "hot" }),
    makeRepo({ fullName: "c/qk", movementStatus: "quiet_killer" }),
  ];
  const out = applyMetaFilter(repos, "breakouts");
  assert.equal(out.length, 1);
  assert.equal(out[0].fullName, "a/b");
});

test("applyMetaFilter('quiet-killers') returns only quiet_killer repos", () => {
  const repos = [
    makeRepo({ fullName: "a/qk", movementStatus: "quiet_killer" }),
    makeRepo({ fullName: "b/qk", movementStatus: "quiet_killer" }),
    makeRepo({ fullName: "c/hot", movementStatus: "hot" }),
  ];
  const out = applyMetaFilter(repos, "quiet-killers");
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.movementStatus === "quiet_killer"));
});

test("applyMetaFilter('new') returns only repos created in the last 30 days", () => {
  const repos = [
    makeRepo({ fullName: "a/new", createdAt: iso(5) }),
    makeRepo({ fullName: "b/old", createdAt: iso(60) }),
    makeRepo({ fullName: "c/new", createdAt: iso(29) }),
    makeRepo({ fullName: "d/edge-old", createdAt: iso(31) }),
  ];
  const out = applyMetaFilter(repos, "new");
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.fullName).sort(),
    ["a/new", "c/new"],
  );
});

test("applyMetaFilter('discussed') keeps only repos with mentions in last 24h", () => {
  const repos = [
    makeRepo({ fullName: "a/buzz", mentionCount24h: 5 }),
    makeRepo({ fullName: "b/silent", mentionCount24h: 0 }),
    makeRepo({ fullName: "c/buzz", mentionCount24h: 1 }),
  ];
  const out = applyMetaFilter(repos, "discussed");
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.mentionCount24h > 0));
});

test("applyMetaFilter('fresh-releases') keeps only repos with a release in last 14 days", () => {
  const repos = [
    makeRepo({ fullName: "a/fresh", lastReleaseAt: iso(3) }),
    makeRepo({ fullName: "b/stale", lastReleaseAt: iso(60) }),
    makeRepo({ fullName: "c/norelease", lastReleaseAt: null }),
    makeRepo({ fullName: "d/fresh", lastReleaseAt: iso(13) }),
  ];
  const out = applyMetaFilter(repos, "fresh-releases");
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.fullName).sort(),
    ["a/fresh", "d/fresh"],
  );
});

// ---------------------------------------------------------------------------
// sortReposByColumn
// ---------------------------------------------------------------------------

test("sortReposByColumn by stars desc puts max first", () => {
  const repos = [
    makeRepo({ fullName: "a/small", stars: 100 }),
    makeRepo({ fullName: "b/huge", stars: 50_000 }),
    makeRepo({ fullName: "c/mid", stars: 5_000 }),
  ];
  const out = sortReposByColumn(repos, "stars", "desc");
  assert.equal(out[0].fullName, "b/huge");
  assert.equal(out[2].fullName, "a/small");
});

test("sortReposByColumn by stars asc puts min first", () => {
  const repos = [
    makeRepo({ fullName: "a/small", stars: 100 }),
    makeRepo({ fullName: "b/huge", stars: 50_000 }),
    makeRepo({ fullName: "c/mid", stars: 5_000 }),
  ];
  const out = sortReposByColumn(repos, "stars", "asc");
  assert.equal(out[0].fullName, "a/small");
  assert.equal(out[2].fullName, "b/huge");
});

test("sortReposByColumn does not mutate the input array", () => {
  const repos = [
    makeRepo({ fullName: "a/x", stars: 10 }),
    makeRepo({ fullName: "b/x", stars: 20 }),
  ];
  const before = repos.map((r) => r.fullName);
  sortReposByColumn(repos, "stars", "desc");
  const after = repos.map((r) => r.fullName);
  assert.deepEqual(after, before);
});

test("sortReposByColumn by repo (string column) sorts alphabetically", () => {
  const repos = [
    makeRepo({ fullName: "zed/z" }),
    makeRepo({ fullName: "alpha/a" }),
    makeRepo({ fullName: "mango/m" }),
  ];
  const asc = sortReposByColumn(repos, "repo", "asc");
  assert.deepEqual(
    asc.map((r) => r.fullName),
    ["alpha/a", "mango/m", "zed/z"],
  );
  const desc = sortReposByColumn(repos, "repo", "desc");
  assert.deepEqual(
    desc.map((r) => r.fullName),
    ["zed/z", "mango/m", "alpha/a"],
  );
});

test("applyTerminalTabFilter('new') keeps only repos created recently", () => {
  const repos = [
    makeRepo({ fullName: "a/new", createdAt: iso(3) }),
    makeRepo({ fullName: "b/old", createdAt: iso(45) }),
    makeRepo({ fullName: "c/fresh", createdAt: iso(29) }),
  ];

  const out = applyTerminalTabFilter(repos, "new", [], now);
  assert.deepEqual(
    out.map((repo) => repo.fullName).sort(),
    ["a/new", "c/fresh"],
  );
});

test("applyTerminalTabFilter('watchlisted') keeps only watched repos", () => {
  const repos = [
    makeRepo({ fullName: "a/one", id: "a--one" }),
    makeRepo({ fullName: "b/two", id: "b--two" }),
    makeRepo({ fullName: "c/three", id: "c--three" }),
  ];

  const out = applyTerminalTabFilter(repos, "watchlisted", [
    "b--two",
    "c--three",
  ]);
  assert.deepEqual(
    out.map((repo) => repo.id).sort(),
    ["b--two", "c--three"],
  );
});

test("getEffectiveSortColumn maps gainers sort to the selected time range", () => {
  assert.equal(getEffectiveSortColumn("delta24h", "gainers", "24h"), "delta24h");
  assert.equal(getEffectiveSortColumn("delta24h", "gainers", "7d"), "delta7d");
  assert.equal(
    getEffectiveSortColumn("delta24h", "gainers", "30d"),
    "delta30d",
  );
  assert.equal(
    getEffectiveSortColumn("momentum", "trending", "30d"),
    "momentum",
  );
});

test("sortReposForTerminal uses time range when gainers tab is active", () => {
  const repos = [
    makeRepo({
      fullName: "a/steady",
      stars: 1000,
      starsDelta24h: 10,
      starsDelta7d: 80,
      starsDelta30d: 100,
    }),
    makeRepo({
      fullName: "b/spiky",
      stars: 1000,
      starsDelta24h: 30,
      starsDelta7d: 40,
      starsDelta30d: 50,
    }),
  ];

  const daily = sortReposForTerminal(repos, {
    sortColumn: "delta24h",
    sortDirection: "desc",
    activeTab: "gainers",
    timeRange: "24h",
  });
  assert.equal(daily[0].fullName, "b/spiky");

  const weekly = sortReposForTerminal(repos, {
    sortColumn: "delta24h",
    sortDirection: "desc",
    activeTab: "gainers",
    timeRange: "7d",
  });
  assert.equal(weekly[0].fullName, "a/steady");
});

test("sortReposForTerminal uses OSSInsight trend score when trending tab is active", () => {
  const repos = [
    makeRepo({
      fullName: "a/top-this-week",
      trendScore24h: 80,
      trendScore7d: 900,
      trendScore30d: 910,
      starsDelta24h: 10,
    }),
    makeRepo({
      fullName: "b/top-today",
      trendScore24h: 120,
      trendScore7d: 300,
      trendScore30d: 400,
      starsDelta24h: 50,
    }),
  ];

  const weekly = sortReposForTerminal(repos, {
    sortColumn: "rank",
    sortDirection: "asc",
    activeTab: "trending",
    timeRange: "7d",
  });
  assert.equal(weekly[0].fullName, "a/top-this-week");

  const daily = sortReposForTerminal(repos, {
    sortColumn: "rank",
    sortDirection: "asc",
    activeTab: "trending",
    timeRange: "24h",
  });
  assert.equal(daily[0].fullName, "b/top-today");
  assert.equal(trendScoreForTimeRange(daily[0], "24h"), 120);
});

test("sortReposForTerminal sorts new tab by createdAt when using the default preset", () => {
  const repos = [
    makeRepo({
      fullName: "a/older-created",
      createdAt: iso(10),
      lastCommitAt: iso(0),
    }),
    makeRepo({
      fullName: "b/newer-created",
      createdAt: iso(2),
      lastCommitAt: iso(4),
    }),
  ];

  const out = sortReposForTerminal(repos, {
    sortColumn: "lastCommit",
    sortDirection: "desc",
    activeTab: "new",
    timeRange: "7d",
  });
  assert.equal(out[0].fullName, "b/newer-created");
});

// ---------------------------------------------------------------------------
// extractLanguages
// ---------------------------------------------------------------------------

test("extractLanguages returns unique sorted list and skips null", () => {
  const repos = [
    makeRepo({ fullName: "a/ts", language: "TypeScript" }),
    makeRepo({ fullName: "b/py", language: "Python" }),
    makeRepo({ fullName: "c/ts", language: "TypeScript" }),
    makeRepo({ fullName: "d/go", language: "Go" }),
    makeRepo({ fullName: "e/null", language: null }),
  ];
  const out = extractLanguages(repos);
  assert.deepEqual(out, ["Go", "Python", "TypeScript"]);
});

// ---------------------------------------------------------------------------
// repoInStarsRange
// ---------------------------------------------------------------------------

test("repoInStarsRange returns true when range is null", () => {
  const repo = makeRepo({ fullName: "a/x", stars: 999 });
  assert.equal(repoInStarsRange(repo, null), true);
});

test("repoInStarsRange respects inclusive bounds", () => {
  const repo = makeRepo({ fullName: "a/x", stars: 5_000 });
  assert.equal(repoInStarsRange(repo, [1_000, 10_000]), true);
  assert.equal(repoInStarsRange(repo, [5_000, 5_000]), true); // inclusive
  assert.equal(repoInStarsRange(repo, [6_000, 10_000]), false);
  assert.equal(repoInStarsRange(repo, [0, 4_999]), false);
});
