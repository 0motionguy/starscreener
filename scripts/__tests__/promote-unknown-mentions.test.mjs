import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateUnknownMentions } from "../promote-unknown-mentions.mjs";

test("empty input yields empty rows + zero counts", () => {
  const out = aggregateUnknownMentions([]);
  assert.deepEqual(out, { rows: [], totalUnknownMentions: 0, distinctRepos: 0 });
});

test("single source with multiple observations of same fullName aggregates totalCount", () => {
  const rows = [
    { source: "bluesky", fullName: "foo/bar", observedAt: "2026-04-29T01:00:00Z" },
    { source: "bluesky", fullName: "foo/bar", observedAt: "2026-04-29T05:00:00Z" },
    { source: "bluesky", fullName: "foo/bar", observedAt: "2026-04-30T00:00:00Z" },
  ];
  const { rows: ranked, totalUnknownMentions, distinctRepos } =
    aggregateUnknownMentions(rows);
  assert.equal(totalUnknownMentions, 3);
  assert.equal(distinctRepos, 1);
  assert.deepEqual(ranked, [
    {
      fullName: "foo/bar",
      totalCount: 3,
      sourceCount: 1,
      sources: ["bluesky"],
      firstSeenAt: "2026-04-29T01:00:00Z",
      lastSeenAt: "2026-04-30T00:00:00Z",
    },
  ]);
});

test("multiple sources for same fullName: sourceCount + sorted dedupe", () => {
  const rows = [
    { source: "reddit", fullName: "openai/gym", observedAt: "2026-04-30T00:00:00Z" },
    { source: "bluesky", fullName: "openai/gym", observedAt: "2026-04-29T00:00:00Z" },
    { source: "bluesky", fullName: "openai/gym", observedAt: "2026-04-29T12:00:00Z" },
    { source: "hackernews", fullName: "openai/gym", observedAt: "2026-04-30T05:00:00Z" },
  ];
  const { rows: ranked } = aggregateUnknownMentions(rows);
  assert.equal(ranked.length, 1);
  assert.deepEqual(ranked[0].sources, ["bluesky", "hackernews", "reddit"]);
  assert.equal(ranked[0].sourceCount, 3);
  assert.equal(ranked[0].totalCount, 4);
  assert.equal(ranked[0].firstSeenAt, "2026-04-29T00:00:00Z");
  assert.equal(ranked[0].lastSeenAt, "2026-04-30T05:00:00Z");
});

test("minSources=2 filters out single-source repos", () => {
  const rows = [
    { source: "reddit", fullName: "single/source", observedAt: "2026-04-30T00:00:00Z" },
    { source: "reddit", fullName: "two/source", observedAt: "2026-04-30T00:00:00Z" },
    { source: "bluesky", fullName: "two/source", observedAt: "2026-04-30T01:00:00Z" },
  ];
  const { rows: ranked, distinctRepos } = aggregateUnknownMentions(rows, { minSources: 2 });
  assert.equal(distinctRepos, 2, "distinctRepos counts the lake, not the filtered set");
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].fullName, "two/source");
});

test("topN=3 caps output", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push({ source: "reddit", fullName: `r${i}/repo`, observedAt: "2026-04-30T00:00:00Z" });
  }
  const { rows: ranked } = aggregateUnknownMentions(rows, { topN: 3 });
  assert.equal(ranked.length, 3);
});

test("sort tiebreak: sourceCount > totalCount > lastSeenAt > fullName", () => {
  const rows = [
    // A: 2 sources, 2 total, lastSeen=04-29
    { source: "reddit", fullName: "a/a", observedAt: "2026-04-29T00:00:00Z" },
    { source: "bluesky", fullName: "a/a", observedAt: "2026-04-29T00:00:00Z" },
    // B: 2 sources, 2 total, lastSeen=04-30 (newer → outranks A)
    { source: "reddit", fullName: "b/b", observedAt: "2026-04-30T00:00:00Z" },
    { source: "bluesky", fullName: "b/b", observedAt: "2026-04-30T00:00:00Z" },
    // C: 1 source, 5 total (more total but fewer sources → ranks below A and B)
    { source: "reddit", fullName: "c/c", observedAt: "2026-05-01T00:00:00Z" },
    { source: "reddit", fullName: "c/c", observedAt: "2026-05-01T01:00:00Z" },
    { source: "reddit", fullName: "c/c", observedAt: "2026-05-01T02:00:00Z" },
    { source: "reddit", fullName: "c/c", observedAt: "2026-05-01T03:00:00Z" },
    { source: "reddit", fullName: "c/c", observedAt: "2026-05-01T04:00:00Z" },
  ];
  const { rows: ranked } = aggregateUnknownMentions(rows);
  assert.deepEqual(
    ranked.map((r) => r.fullName),
    ["b/b", "a/a", "c/c"],
  );
});

test("missing/invalid fullName rows are skipped without throwing", () => {
  const rows = [
    { source: "reddit", observedAt: "2026-04-30T00:00:00Z" },
    { source: "reddit", fullName: "", observedAt: "2026-04-30T00:00:00Z" },
    null,
    "not-an-object",
    { source: "reddit", fullName: "valid/repo", observedAt: "2026-04-30T00:00:00Z" },
  ];
  const { rows: ranked, totalUnknownMentions, distinctRepos } =
    aggregateUnknownMentions(rows);
  assert.equal(totalUnknownMentions, 1);
  assert.equal(distinctRepos, 1);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].fullName, "valid/repo");
});
