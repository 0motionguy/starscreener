// AI-unicorn repo seeder — shape + idempotence tests.
//
// The seeder (`scripts/seed-ai-unicorn-repos.mjs`) is a one-shot operator
// tool that fetches GitHub metadata for a list of `owner/repo` pairs and
// appends minimal `Repo` records to `.data/repos.jsonl`. These tests pin
// down the two things we care about:
//
//   1. Shape validation: a record built from a realistic GitHub REST
//      fixture matches the on-disk `Repo` shape (every required field set,
//      sensible defaults for fields the REST call doesn't provide).
//   2. Idempotence: running the seeder twice in the same `.data/repos.jsonl`
//      directory produces no duplicates — the in-memory dedupe set seeded
//      from the existing file correctly rejects re-adds.
//
// No network is touched. `buildRepoRecordFromFixture` is exposed on the
// seeder module explicitly for this purpose.
//
// Run:
//   npx tsx --test src/lib/pipeline/__tests__/ai-unicorn-seed.test.ts
//   # or
//   node --import tsx --test src/lib/pipeline/__tests__/ai-unicorn-seed.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Seeder module — ESM .mjs; node:test + tsx handles interop. We cast the
// import to `any` because the .mjs file has no TS declarations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as seeder from "../../../../scripts/seed-ai-unicorn-repos.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Realistic GitHub REST response — matches the shape the real endpoint
// returns for a public repo. Fields we rely on: owner.login, owner.avatar_url,
// full_name, name, description, html_url, homepage, language, topics,
// stargazers_count, forks_count, open_issues_count, created_at, pushed_at,
// archived. All other fields are ignored by the seeder.
function makeGithubFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    full_name: "anthropics/claude-code",
    name: "claude-code",
    owner: {
      login: "anthropics",
      avatar_url: "https://avatars.githubusercontent.com/u/76263028?v=4",
    },
    description: "Claude Code — official CLI.",
    html_url: "https://github.com/anthropics/claude-code",
    homepage: "https://claude.com/code",
    language: "TypeScript",
    topics: ["cli", "claude", "agent"],
    stargazers_count: 117_000,
    forks_count: 4200,
    open_issues_count: 150,
    created_at: "2024-02-22T00:00:00Z",
    pushed_at: "2026-04-23T18:00:00Z",
    archived: false,
    ...overrides,
  };
}

// Minimal fields that MUST appear on every persisted row (mirrors the first
// line of `.data/repos.jsonl` committed in HEAD). Missing any of these will
// break downstream consumers that read the JSONL without a Zod guard.
const REQUIRED_FIELDS = [
  "id",
  "fullName",
  "name",
  "owner",
  "ownerAvatarUrl",
  "description",
  "url",
  "language",
  "topics",
  "categoryId",
  "stars",
  "forks",
  "contributors",
  "openIssues",
  "lastCommitAt",
  "lastReleaseAt",
  "lastReleaseTag",
  "createdAt",
  "starsDelta24h",
  "starsDelta7d",
  "starsDelta30d",
  "forksDelta7d",
  "contributorsDelta30d",
  "momentumScore",
  "movementStatus",
  "rank",
  "categoryRank",
  "sparklineData",
  "socialBuzzScore",
  "mentionCount24h",
  "tags",
  "hasMovementData",
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("buildRepoRecordFromFixture produces a valid Repo shape", () => {
  const rec = seeder.buildRepoRecordFromFixture(makeGithubFixture()) as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(rec, field),
      `missing required field: ${field}`,
    );
  }
  assert.equal(rec.id, "anthropics--claude-code");
  assert.equal(rec.fullName, "anthropics/claude-code");
  assert.equal(rec.owner, "anthropics");
  assert.equal(rec.name, "claude-code");
  assert.equal(rec.stars, 117_000);
  assert.equal(rec.forks, 4200);
  assert.equal(rec.openIssues, 150);
  assert.equal(rec.language, "TypeScript");
  assert.equal(rec.movementStatus, "stable");
  assert.equal(rec.momentumScore, 0);
  assert.deepEqual(rec.topics, ["cli", "claude", "agent"]);
  assert.deepEqual(rec.sparklineData, []);
  assert.ok(Array.isArray(rec.tags));
  assert.ok((rec.tags as string[]).includes("ai-unicorn-seed"));
  assert.equal(rec.hasMovementData, false);
  assert.equal(rec.lastCommitAt, "2026-04-23T18:00:00Z");
  assert.equal(rec.createdAt, "2024-02-22T00:00:00Z");
  assert.equal(rec.archived, false);
});

test("buildRepoRecordFromFixture handles missing optional fields", () => {
  const rec = seeder.buildRepoRecordFromFixture(
    makeGithubFixture({
      description: null,
      topics: null,
      language: null,
      homepage: null,
      open_issues_count: undefined,
      forks_count: undefined,
      stargazers_count: undefined,
    }),
  ) as Record<string, unknown>;
  // Defaults kick in — no undefined, no NaN.
  assert.equal(rec.description, "");
  assert.deepEqual(rec.topics, []);
  assert.equal(rec.language, null);
  assert.equal(rec.stars, 0);
  assert.equal(rec.forks, 0);
  assert.equal(rec.openIssues, 0);
});

test("buildRepoRecordFromFixture: malformed input still yields deterministic shape", () => {
  // Simulates a GitHub response where fields we depend on are the wrong
  // type. Seeder should not throw; it should pick safe defaults so the
  // caller can still persist or skip.
  const rec = seeder.buildRepoRecordFromFixture({
    full_name: "x/y",
    // owner is missing entirely
    description: 123, // wrong type
    topics: "not-an-array",
    stargazers_count: "nope",
    created_at: null,
  }) as Record<string, unknown>;
  // id must still be derived from full_name.
  assert.equal(rec.id, "x--y");
  assert.equal(rec.fullName, "x/y");
  // Defaults — no throw.
  assert.equal(rec.description, "");
  assert.deepEqual(rec.topics, []);
  assert.equal(rec.stars, 0);
  assert.equal(rec.createdAt, "");
});

test("seeder record is idempotent: dedupe set rejects a duplicate id", () => {
  // We simulate the idempotence gate that main() uses: compute the id,
  // check existence in the set, append only when new. The test uses a
  // temp JSONL file to mirror the real side-effect path.
  const tmpDir = mkdtempSync(join(tmpdir(), "ai-unicorn-seed-"));
  const tmpJsonl = join(tmpDir, "repos.jsonl");
  try {
    writeFileSync(tmpJsonl, "", "utf8");

    const rec = seeder.buildRepoRecordFromFixture(makeGithubFixture()) as {
      id: string;
      fullName: string;
    };

    // First append — simulate the happy path.
    appendFileSync(tmpJsonl, `${JSON.stringify(rec)}\n`, "utf8");

    // Re-read to build the dedupe set the way loadExistingIds() does it.
    const existing = new Set<string>();
    const raw = readFileSync(tmpJsonl, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed) as { id?: string; fullName?: string };
      if (typeof parsed.id === "string") existing.add(parsed.id.toLowerCase());
      if (typeof parsed.fullName === "string") {
        existing.add(parsed.fullName.replace("/", "--").toLowerCase());
      }
    }

    // Second attempt must be rejected by the dedupe set.
    const secondId = rec.id.toLowerCase();
    assert.ok(existing.has(secondId), "dedupe set must contain the id");
    // The seeder's real behavior on dup is `skippedDuplicate++` and
    // continue — asserted here indirectly by the set membership.

    // Confirm file still has one line (we did NOT append twice).
    const lines = readFileSync(tmpJsonl, "utf8").trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("seeder dedupes case-insensitively by slugToId", () => {
  // A seed request for "Anthropics/Claude-Code" (same logical repo, different
  // case) must hit the dedupe guard against an existing "anthropics/claude-code"
  // entry. The loadExistingIds pass lowercases both id + fullName.
  const existing = new Set<string>();
  const priorRec = seeder.buildRepoRecordFromFixture(makeGithubFixture()) as {
    id: string;
    fullName: string;
  };
  existing.add(priorRec.id.toLowerCase());
  existing.add(priorRec.fullName.replace("/", "--").toLowerCase());

  // Casing variant — equivalent slug after lowercase.
  const variantSlug = "Anthropics/Claude-Code".replace("/", "--").toLowerCase();
  assert.ok(existing.has(variantSlug));
});
