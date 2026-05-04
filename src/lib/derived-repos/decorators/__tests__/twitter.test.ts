import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { decorateWithTwitter } from "../twitter";
import type { Repo } from "../../../types";
import type { TwitterRepoSignal } from "../../../twitter/types";

// Hand-rolled minimal Repo used for shape + immutability assertions. We only
// need fields the decorator passes through (`fullName`) plus a small payload
// to verify deep equality after the call.
function makeRepo(overrides: Partial<Repo> = {}): Repo {
  const base: Repo = {
    id: "test--repo",
    fullName: "test/repo",
    name: "repo",
    owner: "test",
    ownerAvatarUrl: "",
    description: "",
    url: "https://github.com/test/repo",
    language: null,
    topics: ["a", "b"],
    categoryId: "uncategorized",
    stars: 0,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "2026-01-01T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
  return { ...base, ...overrides };
}

const SIGNALS_PATH = resolve(
  process.cwd(),
  ".data",
  "twitter-repo-signals.jsonl",
);

function readFirstSignal(): TwitterRepoSignal | null {
  if (!existsSync(SIGNALS_PATH)) return null;
  const raw = readFileSync(SIGNALS_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TwitterRepoSignal;
      if (parsed.githubFullName) return parsed;
    } catch {
      // skip malformed line
    }
  }
  return null;
}

test("decorateWithTwitter assigns twitter:null for repos with no signal", () => {
  const repo = makeRepo({
    fullName: "no-such-owner-xyz/no-such-repo-zzz-12345",
  });
  const [out] = decorateWithTwitter([repo]);
  assert.equal(out.twitter, null);
});

test("decorateWithTwitter does not mutate the input repos or array", () => {
  const repo = makeRepo({ fullName: "no-such-owner-xyz/no-such-repo-zzz" });
  const before = structuredClone(repo);
  const input = [repo];
  const inputBefore = structuredClone(input);

  const out = decorateWithTwitter(input);

  // Input array reference is preserved by caller; element identity should be
  // untouched and contents deep-equal to the pre-call snapshot.
  assert.deepEqual(input, inputBefore);
  assert.deepEqual(repo, before);
  assert.notEqual(out, input, "output array must be a new array");
  assert.notEqual(out[0], repo, "output repo must be a new object (spread)");
});

test("decorateWithTwitter maps signal metrics/score/badge fields onto the repo", () => {
  const signal = readFirstSignal();
  if (!signal) {
    // No fixture available — this assertion path only exercises the mapping
    // contract when a real signal is on disk; skip cleanly otherwise.
    return;
  }

  const repo = makeRepo({ fullName: signal.githubFullName });
  const [out] = decorateWithTwitter([repo]);

  assert.ok(out.twitter, "expected twitter rollup to be attached");
  if (!out.twitter) return; // narrow

  assert.equal(out.twitter.mentionCount24h, signal.metrics.mentionCount24h);
  assert.equal(out.twitter.uniqueAuthors24h, signal.metrics.uniqueAuthors24h);
  assert.equal(
    out.twitter.finalTwitterScore,
    signal.score.finalTwitterScore,
  );
  assert.equal(out.twitter.badgeState, signal.badge.state);
  assert.equal(out.twitter.topPostUrl, signal.metrics.topPostUrl);
  assert.equal(out.twitter.lastScannedAt, signal.updatedAt);

  // Mapping must not leak any other top-level field changes.
  const { twitter: _t, ...rest } = out;
  const { twitter: _orig, ...repoRest } = repo;
  assert.deepEqual(rest, repoRest);
});
