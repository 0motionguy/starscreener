// Tests for `scripts/reconcile-repo-stores.mjs` + the union candidate-build
// path in `src/lib/funding/repo-events.ts`.
//
// Exercises:
//   1. Reconciler merges stores: A = {a,b,c}, B = {c,d,e} → output = {a,b,c,d,e}.
//   2. Existing metadata is preserved byte-for-byte on merge.
//   3. Reconciler is idempotent — running twice produces identical output.
//   4. buildCandidates() returns the UNION of repo-metadata + pipeline JSONL,
//      so repos that live only in `.data/repos.jsonl` still surface to the
//      funding matcher.
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/repo-store-reconciliation.test.ts

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { buildCandidates } from "../../funding/repo-events";

// ---------------------------------------------------------------------------
// Test harness — drives the reconciler against fixture files in a tempdir.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const RECONCILE_SCRIPT = resolve(REPO_ROOT, "scripts", "reconcile-repo-stores.mjs");

interface Harness {
  rootDir: string;
  jsonlPath: string;
  metadataPath: string;
  runReconciler: () => void;
  readMetadata: () => {
    items: Array<{ fullName: string; [k: string]: unknown }>;
    [k: string]: unknown;
  };
}

function makeHarness(): Harness {
  // The reconciler hard-codes ROOT = ../ so we must mirror that layout:
  // ROOT/.data/repos.jsonl and ROOT/data/repo-metadata.json, with the
  // script copied to ROOT/scripts/reconcile-repo-stores.mjs.
  const root = mkdtempSync(join(tmpdir(), "repo-reconcile-"));
  const dataDir = join(root, ".data");
  const outDir = join(root, "data");
  const scriptsDir = join(root, "scripts");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(scriptsDir, { recursive: true });
  const scriptCopy = join(scriptsDir, "reconcile-repo-stores.mjs");
  writeFileSync(scriptCopy, readFileSync(RECONCILE_SCRIPT, "utf8"));

  const jsonlPath = join(dataDir, "repos.jsonl");
  const metadataPath = join(outDir, "repo-metadata.json");

  return {
    rootDir: root,
    jsonlPath,
    metadataPath,
    runReconciler: () => {
      execFileSync(process.execPath, [scriptCopy], {
        cwd: root,
        stdio: "pipe",
      });
    },
    readMetadata: () => JSON.parse(readFileSync(metadataPath, "utf8")),
  };
}

function writeJsonl(path: string, rows: unknown[]): void {
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

let harness: Harness;
beforeEach(() => {
  harness = makeHarness();
});
afterEach(() => {
  if (harness && existsSync(harness.rootDir)) {
    rmSync(harness.rootDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("reconciler merges stores: A = {a,b,c}, B = {c,d,e} → {a,b,c,d,e}", () => {
  writeJsonl(harness.jsonlPath, [
    { fullName: "alpha/a", name: "a", owner: "alpha", url: "https://github.com/alpha/a" },
    { fullName: "alpha/b", name: "b", owner: "alpha", url: "https://github.com/alpha/b" },
    { fullName: "alpha/c", name: "c", owner: "alpha", url: "https://github.com/alpha/c" },
  ]);
  writeFileSync(
    harness.metadataPath,
    JSON.stringify({
      fetchedAt: "2026-04-24T00:00:00.000Z",
      sourceCount: 3,
      items: [
        {
          fullName: "alpha/c",
          name: "c",
          owner: "alpha",
          url: "https://github.com/alpha/c",
          homepageUrl: "https://c.example.com",
          topics: ["scraped"],
        },
        { fullName: "alpha/d", name: "d", owner: "alpha", homepageUrl: "https://d.example.com" },
        { fullName: "alpha/e", name: "e", owner: "alpha", homepageUrl: null },
      ],
      failures: [],
    }),
  );

  harness.runReconciler();

  const merged = harness.readMetadata();
  const fullNames = merged.items.map((i) => i.fullName).sort();
  assert.deepEqual(fullNames, ["alpha/a", "alpha/b", "alpha/c", "alpha/d", "alpha/e"]);
  assert.equal(merged.items.length, 5);
});

test("existing metadata entries are preserved unchanged on merge", () => {
  writeJsonl(harness.jsonlPath, [
    { fullName: "alpha/c", name: "c", owner: "alpha" },
    { fullName: "alpha/new", name: "new", owner: "alpha" },
  ]);
  const originalC = {
    githubId: 999,
    fullName: "alpha/c",
    name: "c",
    owner: "alpha",
    ownerAvatarUrl: "https://x/alpha.png",
    description: "real scraped description",
    url: "https://github.com/alpha/c",
    homepageUrl: "https://c.example.com",
    language: "TypeScript",
    topics: ["real", "topics"],
    stars: 1234,
    forks: 56,
    openIssues: 7,
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    pushedAt: "2026-01-01T00:00:00Z",
    defaultBranch: "main",
    archived: false,
    disabled: false,
    fork: false,
    fetchedAt: "2026-04-24T00:00:00Z",
  };
  writeFileSync(
    harness.metadataPath,
    JSON.stringify({
      fetchedAt: "2026-04-24T00:00:00.000Z",
      sourceCount: 1,
      items: [originalC],
      failures: [],
    }),
  );

  harness.runReconciler();

  const merged = harness.readMetadata();
  const cEntry = merged.items.find((i) => i.fullName === "alpha/c");
  assert.ok(cEntry, "expected alpha/c to still be present");
  // Byte-for-byte preservation: the existing scraped entry is not
  // overwritten by the reconciler.
  assert.deepEqual(cEntry, originalC);

  const newEntry = merged.items.find((i) => i.fullName === "alpha/new");
  assert.ok(newEntry, "expected alpha/new to be stubbed in");
  assert.equal(newEntry.homepageUrl, null);
  assert.equal(newEntry.source, "pipeline-jsonl-stub");
});

test("reconciler is idempotent — second run produces identical items", () => {
  writeJsonl(harness.jsonlPath, [
    { fullName: "alpha/a", name: "a", owner: "alpha" },
    { fullName: "alpha/b", name: "b", owner: "alpha" },
  ]);
  writeFileSync(
    harness.metadataPath,
    JSON.stringify({
      fetchedAt: "2026-04-24T00:00:00.000Z",
      sourceCount: 0,
      items: [],
      failures: [],
    }),
  );

  harness.runReconciler();
  const firstRun = harness.readMetadata();
  const firstItems = JSON.stringify(firstRun.items);

  harness.runReconciler();
  const secondRun = harness.readMetadata();
  const secondItems = JSON.stringify(secondRun.items);

  // Items (the load-bearing payload) must be byte-stable across runs. The
  // top-level `reconciledAt` timestamp is expected to drift but is
  // advisory; tests focus on the stable items payload.
  assert.equal(secondItems, firstItems);
  assert.equal(secondRun.items.length, 2);
});

// ---------------------------------------------------------------------------
// buildCandidates() union-coverage test.
// This exercises the real repo-events.ts against the real `.data/repos.jsonl`
// and `data/repo-metadata.json`, so the assertion is "union covers both
// stores", not "count matches a hard-coded number".
// ---------------------------------------------------------------------------

test("buildCandidates() returns UNION of repo-metadata and pipeline JSONL", () => {
  const candidates = buildCandidates();
  const candidateNames = new Set(candidates.map((c) => c.fullName.toLowerCase()));

  // Read the same sources as the production code path.
  const metadataRaw = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "data", "repo-metadata.json"), "utf8"),
  ) as { items?: Array<{ fullName: string }> };
  const metadataFullNames = (metadataRaw.items ?? [])
    .map((i) => i.fullName)
    .filter((n): n is string => typeof n === "string");

  const jsonlPath = resolve(REPO_ROOT, ".data", "repos.jsonl");
  const jsonlFullNames: string[] = [];
  if (existsSync(jsonlPath)) {
    for (const line of readFileSync(jsonlPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { fullName?: string };
        if (typeof row.fullName === "string" && row.fullName.includes("/")) {
          jsonlFullNames.push(row.fullName);
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  for (const name of metadataFullNames) {
    assert.ok(
      candidateNames.has(name.toLowerCase()),
      `metadata repo missing from candidates: ${name}`,
    );
  }
  for (const name of jsonlFullNames) {
    assert.ok(
      candidateNames.has(name.toLowerCase()),
      `pipeline JSONL repo missing from candidates: ${name}`,
    );
  }

  // Candidate count is at least the size of the union (dedup on lowercase
  // fullName) — which is what "coverage" means.
  const unionSize = new Set(
    [...metadataFullNames, ...jsonlFullNames].map((n) => n.toLowerCase()),
  ).size;
  assert.ok(
    candidates.length >= unionSize,
    `expected candidates (${candidates.length}) to cover union of ${unionSize}`,
  );
});
