// StarScreener Pipeline — STARSCREENER_DATA_DIR safety tests.
//
// Phase 2 P-111 (F-DATA-003) — currentDataDir() must reject relative paths
// and non-canonical absolute paths so a misconfigured env var cannot
// silently redirect JSONL writes to arbitrary filesystem locations.

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

// The helper reads process.env at call time, so each test flips the env
// around the assertion. Always restore at the end to avoid cross-test
// pollution with the existing persistence tests that set it themselves.

async function reload(): Promise<
  typeof import("../storage/file-persistence")
> {
  const bust = `${Date.now()}-${Math.random()}`;
  const url = new URL(
    `../storage/file-persistence.ts?t=${bust}`,
    import.meta.url,
  );
  return (await import(url.href)) as typeof import("../storage/file-persistence");
}

test("currentDataDir() defaults to <cwd>/.data when env unset", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  delete process.env.STARSCREENER_DATA_DIR;
  try {
    const mod = await reload();
    const dir = mod.currentDataDir();
    assert.equal(dir, path.join(process.cwd(), ".data"));
  } finally {
    if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
  }
});

test("currentDataDir() rejects relative paths", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  process.env.STARSCREENER_DATA_DIR = "./relative-dir";
  try {
    const mod = await reload();
    assert.throws(() => mod.currentDataDir(), /must be an absolute path/);
  } finally {
    if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
    else delete process.env.STARSCREENER_DATA_DIR;
  }
});

test("currentDataDir() rejects absolute paths with traversal segments", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  // Construct an absolute-but-non-canonical path as a raw string so that
  // path.join doesn't helpfully normalize it before our validator sees it.
  // path.sep is used so the test works on both POSIX and Windows.
  const tmp = os.tmpdir();
  const sep = path.sep;
  const nonCanonical = `${tmp}${sep}..${sep}${path.basename(tmp)}${sep}foo`;
  // Sanity — this string should NOT already equal its normalized form.
  assert.notEqual(path.normalize(nonCanonical), nonCanonical);
  process.env.STARSCREENER_DATA_DIR = nonCanonical;
  try {
    const mod = await reload();
    assert.throws(() => mod.currentDataDir(), /non-canonical segments/);
  } finally {
    if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
    else delete process.env.STARSCREENER_DATA_DIR;
  }
});

test("currentDataDir() accepts a canonical absolute path", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  const clean = path.join(os.tmpdir(), "starscreener-datadir-test");
  process.env.STARSCREENER_DATA_DIR = clean;
  try {
    const mod = await reload();
    const dir = mod.currentDataDir();
    assert.equal(dir, clean);
  } finally {
    if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
    else delete process.env.STARSCREENER_DATA_DIR;
  }
});
