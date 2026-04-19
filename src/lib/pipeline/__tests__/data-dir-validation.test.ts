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

test("currentDataDir() resolves relative paths against cwd", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  process.env.STARSCREENER_DATA_DIR = "./relative-dir";
  try {
    const mod = await reload();
    const dir = mod.currentDataDir();
    assert.equal(path.isAbsolute(dir), true);
    assert.equal(dir, path.resolve(process.cwd(), "relative-dir"));
  } finally {
    if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
    else delete process.env.STARSCREENER_DATA_DIR;
  }
});

test("currentDataDir() rejects any path containing '..' segments", async () => {
  const prior = process.env.STARSCREENER_DATA_DIR;
  const cases = [
    "../foo",
    "../../etc/passwd",
    `${os.tmpdir()}${path.sep}..${path.sep}evil`,
    "/absolute/../traversal",
  ];
  for (const c of cases) {
    process.env.STARSCREENER_DATA_DIR = c;
    const mod = await reload();
    assert.throws(
      () => mod.currentDataDir(),
      /must not contain '\.\.' segments/,
      `expected rejection for ${JSON.stringify(c)}`,
    );
  }
  if (prior !== undefined) process.env.STARSCREENER_DATA_DIR = prior;
  else delete process.env.STARSCREENER_DATA_DIR;
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
