// StarScreener Pipeline — `persistAisoScan` tests.
//
// Covers:
//   - Persist adds a fresh entry when fullName absent
//   - Persist updates existing entry (preserves other fields; doesn't clobber)
//   - Concurrent persist calls on the same fullName serialize via the lock
//     (no lost updates)
//   - Read returns the persisted scan
//   - Null scan updates `lastProfiledAt` + sets `status: "scan_failed"`
//   - Idempotent: re-persist of same scan yields same profile shape
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/aiso-persist.test.ts
//
// Environment isolation: each test points STARSCREENER_REPO_PROFILES_PATH at
// a per-test temp file so lock keys + disk writes are isolated.

import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import type { AisoToolsScan } from "../../aiso-tools";
import type { RepoProfile, RepoProfilesFile } from "../../repo-profiles";

const TMP_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-aiso-persist-"));
// Unique file per invocation to keep lock keys clean; each test may also
// override via `setProfilePath()` below for finer isolation.
const DEFAULT_FILE = path.join(TMP_DIR, "repo-profiles.json");
process.env.STARSCREENER_REPO_PROFILES_PATH = DEFAULT_FILE;
process.env.STARSCREENER_PERSIST = "false";

function setProfilePath(p: string): void {
  process.env.STARSCREENER_REPO_PROFILES_PATH = p;
}

function freshPath(suffix: string): string {
  return path.join(TMP_DIR, `repo-profiles-${suffix}.json`);
}

function readFileParsed(filePath: string): RepoProfilesFile | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as RepoProfilesFile;
}

function writeSeed(filePath: string, file: RepoProfilesFile): void {
  writeFileSync(filePath, JSON.stringify(file, null, 2) + "\n", "utf8");
}

function makeCompletedScan(url: string, score = 72): AisoToolsScan {
  return {
    scanId: `scan-${score}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    projectName: null,
    projectUrl: null,
    source: null,
    status: "completed",
    score,
    tier: "visible",
    runtimeVisibility: score,
    scanDurationMs: 2000,
    completedAt: "2026-04-24T12:00:00.000Z",
    resultUrl: `https://aiso.tools/scan/fake-${score}`,
    dimensions: [
      {
        key: "facts",
        label: "Facts",
        weight: 20,
        score: 80,
        status: "pass",
        issuesCount: 0,
        details: {},
      },
    ],
    issues: [],
    promptTests: [],
  };
}

function makeRepoProfile(
  fullName: string,
  overrides: Partial<RepoProfile> = {},
): RepoProfile {
  return {
    fullName,
    rank: 42,
    selectedFrom: "trending_top_24h",
    websiteUrl: "https://preserved.example",
    websiteSource: "github_homepage",
    status: "scan_pending",
    lastProfiledAt: "2026-04-01T00:00:00.000Z",
    nextScanAfter: null,
    surfaces: {
      githubUrl: `https://github.com/${fullName}`,
      docsUrl: "https://docs.example",
      npmPackages: ["preserved-pkg"],
      productHuntLaunchId: "ph-1",
    },
    aisoScan: null,
    error: null,
    ...overrides,
  };
}

// Track per-test temp paths so `after()` can clean up.
const usedPaths: string[] = [];

before(() => {
  // Touch nothing; TMP_DIR is created above.
});

beforeEach(() => {
  // Reset the default path before each test; tests that want isolation
  // call setProfilePath() with a fresh one.
  setProfilePath(DEFAULT_FILE);
  try {
    rmSync(DEFAULT_FILE, { force: true });
  } catch {
    /* ignore */
  }
});

after(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  for (const p of usedPaths) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
});

// ---------------------------------------------------------------------------
// Fresh entry
// ---------------------------------------------------------------------------

test("persist adds a fresh entry when the profile file does not exist", async () => {
  const filePath = freshPath("fresh-absent");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan, readAisoScanFromProfile } = await import(
    "../../aiso-persist"
  );

  const scan = makeCompletedScan("https://nextjs.org");
  await persistAisoScan("vercel/next.js", scan);

  const file = readFileParsed(filePath);
  assert.ok(file, "file should exist after persist");
  assert.equal(file.profiles.length, 1);
  const profile = file.profiles[0];
  assert.equal(profile.fullName, "vercel/next.js");
  assert.equal(profile.status, "scanned");
  assert.equal(profile.aisoScan?.scanId, scan.scanId);
  assert.equal(profile.websiteUrl, "https://nextjs.org");
  assert.equal(profile.surfaces.githubUrl, "https://github.com/vercel/next.js");
  assert.ok(profile.lastProfiledAt, "lastProfiledAt should be stamped");

  const persisted = await readAisoScanFromProfile("vercel/next.js");
  assert.ok(persisted, "read should return the scan");
  assert.equal(persisted!.scanId, scan.scanId);
});

test("persist adds a fresh entry when the profile file exists but lacks the fullName", async () => {
  const filePath = freshPath("fresh-other-repos");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const seed: RepoProfilesFile = {
    generatedAt: "2026-04-01T00:00:00.000Z",
    version: 1,
    selection: {
      source: "incremental",
      limit: 50,
      maxScans: 5,
      scanned: 1,
      queued: 0,
      noWebsite: 0,
      failed: 0,
    },
    profiles: [makeRepoProfile("other/repo")],
  };
  writeSeed(filePath, seed);

  const { persistAisoScan } = await import("../../aiso-persist");
  const scan = makeCompletedScan("https://new.example");
  await persistAisoScan("fresh/one", scan);

  const file = readFileParsed(filePath)!;
  assert.equal(file.profiles.length, 2);
  const otherIdx = file.profiles.findIndex((p) => p.fullName === "other/repo");
  const newIdx = file.profiles.findIndex((p) => p.fullName === "fresh/one");
  assert.notEqual(otherIdx, -1);
  assert.notEqual(newIdx, -1);
  // Seed untouched:
  assert.equal(file.profiles[otherIdx].websiteUrl, "https://preserved.example");
  assert.equal(file.profiles[otherIdx].rank, 42);
  // New one stamped:
  assert.equal(file.profiles[newIdx].aisoScan?.scanId, scan.scanId);
  assert.equal(file.profiles[newIdx].status, "scanned");
});

// ---------------------------------------------------------------------------
// Update preserves other fields
// ---------------------------------------------------------------------------

test("persist updates existing entry without clobbering preserved fields", async () => {
  const filePath = freshPath("update-preserve");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const seed: RepoProfilesFile = {
    generatedAt: "2026-04-01T00:00:00.000Z",
    version: 1,
    selection: {
      source: "incremental",
      limit: 10,
      maxScans: 5,
      scanned: 1,
      queued: 0,
      noWebsite: 0,
      failed: 0,
    },
    profiles: [
      makeRepoProfile("vercel/next.js", {
        rank: 1,
        selectedFrom: "trending_top_24h",
        websiteUrl: "https://old.nextjs.org",
        websiteSource: "producthunt",
        error: "previous-error",
        surfaces: {
          githubUrl: "https://github.com/vercel/next.js",
          docsUrl: "https://nextjs.org/docs",
          npmPackages: ["next", "create-next-app"],
          productHuntLaunchId: "ph-next-js",
        },
      }),
    ],
  };
  writeSeed(filePath, seed);

  const { persistAisoScan } = await import("../../aiso-persist");
  const scan = makeCompletedScan("https://nextjs.org", 90);
  await persistAisoScan("vercel/next.js", scan);

  const file = readFileParsed(filePath)!;
  assert.equal(file.profiles.length, 1);
  const profile = file.profiles[0];
  // Preserved:
  assert.equal(profile.rank, 1);
  assert.equal(profile.selectedFrom, "trending_top_24h");
  assert.equal(profile.websiteSource, "producthunt");
  assert.deepEqual(profile.surfaces.npmPackages, ["next", "create-next-app"]);
  assert.equal(profile.surfaces.productHuntLaunchId, "ph-next-js");
  assert.equal(profile.surfaces.docsUrl, "https://nextjs.org/docs");
  // Overlaid:
  assert.equal(profile.status, "scanned");
  assert.equal(profile.websiteUrl, "https://nextjs.org"); // scan.url wins
  assert.equal(profile.aisoScan?.scanId, scan.scanId);
  assert.equal(profile.aisoScan?.score, 90);
  // Error cleared on successful scan:
  assert.equal(profile.error, null);
});

// ---------------------------------------------------------------------------
// Concurrent persists serialize
// ---------------------------------------------------------------------------

test("concurrent persist calls on the same fullName serialize via the lock", async () => {
  const filePath = freshPath("concurrent");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan } = await import("../../aiso-persist");

  // Fire 10 persist calls back-to-back (no awaits) with distinct scans.
  // If the lock works, the file ends up with exactly ONE profile and the
  // `aisoScan` field reflects one of the submitted scans (the last to
  // acquire the lock wins), with no torn JSON.
  const scans = Array.from({ length: 10 }, (_, i) =>
    makeCompletedScan(`https://r${i}.example`, 50 + i),
  );
  await Promise.all(
    scans.map((scan) => persistAisoScan("race/repo", scan)),
  );

  const file = readFileParsed(filePath);
  assert.ok(file, "file must be parseable (no torn writes)");
  assert.equal(file.profiles.length, 1, "must collapse into one profile");
  const profile = file.profiles[0];
  assert.equal(profile.fullName, "race/repo");
  assert.equal(profile.status, "scanned");
  // The scanId MUST match one of the submitted scans — any value means no
  // partial merge happened. Matching *any* proves no silent clobber of
  // the object shape.
  const submittedIds = new Set(scans.map((s) => s.scanId));
  assert.ok(
    profile.aisoScan?.scanId && submittedIds.has(profile.aisoScan.scanId),
    "aisoScan.scanId must match one of the submitted scans",
  );
});

// ---------------------------------------------------------------------------
// Read helper
// ---------------------------------------------------------------------------

test("readAisoScanFromProfile returns null for an unknown repo", async () => {
  const filePath = freshPath("read-unknown");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { readAisoScanFromProfile } = await import("../../aiso-persist");
  const out = await readAisoScanFromProfile("unknown/repo");
  assert.equal(out, null);
});

test("readAisoScanFromProfile returns the persisted scan", async () => {
  const filePath = freshPath("read-hit");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan, readAisoScanFromProfile } = await import(
    "../../aiso-persist"
  );
  const scan = makeCompletedScan("https://example.com");
  await persistAisoScan("hit/repo", scan);

  const out = await readAisoScanFromProfile("hit/repo");
  assert.ok(out);
  assert.equal(out!.scanId, scan.scanId);
  assert.equal(out!.status, "completed");
});

test("readAisoScanFromProfile is case-insensitive on fullName", async () => {
  const filePath = freshPath("read-case");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan, readAisoScanFromProfile } = await import(
    "../../aiso-persist"
  );
  const scan = makeCompletedScan("https://mixed.example");
  await persistAisoScan("MixedCase/Repo", scan);

  const lowered = await readAisoScanFromProfile("mixedcase/repo");
  const upper = await readAisoScanFromProfile("MIXEDCASE/REPO");
  assert.ok(lowered);
  assert.ok(upper);
  assert.equal(lowered!.scanId, scan.scanId);
  assert.equal(upper!.scanId, scan.scanId);
});

// ---------------------------------------------------------------------------
// Null scan path
// ---------------------------------------------------------------------------

test("null scan updates lastProfiledAt and sets status to scan_failed", async () => {
  const filePath = freshPath("null-scan");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const seed: RepoProfilesFile = {
    generatedAt: "2026-04-01T00:00:00.000Z",
    version: 1,
    selection: {
      source: "incremental",
      limit: 10,
      maxScans: 5,
      scanned: 0,
      queued: 0,
      noWebsite: 0,
      failed: 0,
    },
    profiles: [
      makeRepoProfile("ghost/repo", {
        status: "scan_pending",
        lastProfiledAt: "2026-04-01T00:00:00.000Z",
        aisoScan: null,
      }),
    ],
  };
  writeSeed(filePath, seed);

  const { persistAisoScan } = await import("../../aiso-persist");

  const before = Date.now();
  await persistAisoScan("ghost/repo", null);
  const after = Date.now();

  const file = readFileParsed(filePath)!;
  assert.equal(file.profiles.length, 1);
  const profile = file.profiles[0];
  assert.equal(profile.status, "scan_failed");
  assert.equal(profile.aisoScan, null);
  const stampedAt = Date.parse(profile.lastProfiledAt);
  assert.ok(Number.isFinite(stampedAt));
  assert.ok(stampedAt >= before, "lastProfiledAt must advance past before");
  assert.ok(stampedAt <= after, "lastProfiledAt must not exceed after");
});

test("null scan on an absent repo creates a new scan_failed profile", async () => {
  const filePath = freshPath("null-scan-absent");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan } = await import("../../aiso-persist");
  await persistAisoScan("ghost/absent", null);

  const file = readFileParsed(filePath)!;
  assert.equal(file.profiles.length, 1);
  assert.equal(file.profiles[0].fullName, "ghost/absent");
  assert.equal(file.profiles[0].status, "scan_failed");
  assert.equal(file.profiles[0].aisoScan, null);
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

test("re-persisting the same scan is a benign no-op except for lastProfiledAt", async () => {
  const filePath = freshPath("idempotent");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan } = await import("../../aiso-persist");
  const scan = makeCompletedScan("https://stable.example");

  await persistAisoScan("idem/repo", scan);
  const first = readFileParsed(filePath)!;

  await persistAisoScan("idem/repo", scan);
  const second = readFileParsed(filePath)!;

  assert.equal(first.profiles.length, 1);
  assert.equal(second.profiles.length, 1);
  const a = first.profiles[0];
  const b = second.profiles[0];
  assert.equal(a.fullName, b.fullName);
  assert.deepEqual(a.aisoScan, b.aisoScan);
  assert.equal(a.status, b.status);
  // lastProfiledAt may advance; everything else should match.
  assert.equal(a.websiteUrl, b.websiteUrl);
  assert.equal(a.selectedFrom, b.selectedFrom);
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test("persist rejects empty fullName", async () => {
  const filePath = freshPath("bad-input");
  usedPaths.push(filePath);
  setProfilePath(filePath);

  const { persistAisoScan } = await import("../../aiso-persist");
  await assert.rejects(() => persistAisoScan("", makeCompletedScan("x")));
  await assert.rejects(() => persistAisoScan("no-slash", makeCompletedScan("x")));
});
