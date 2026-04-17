// StarScreener Pipeline — file-backed JSONL persistence tests.
//
// Run with: npm test (project script uses tsx --test).
//
// Uses node:test + node:assert. Every test sets `STARSCREENER_DATA_DIR` to a
// fresh temp directory via fs.mkdtemp() so tests never touch the project's
// real `.data/` dir and can run in parallel safely.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Per-test setup — fresh temp dir, fresh module so DATA_DIR is re-read.
// ---------------------------------------------------------------------------

interface TestHarness {
  dir: string;
  mod: typeof import("../storage/file-persistence");
}

async function setupHarness(): Promise<TestHarness> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "starscreener-persist-"));
  process.env.STARSCREENER_DATA_DIR = dir;
  // Re-import the module so the DATA_DIR constant picks up the new env var.
  // node's ESM loader caches by URL so we need a cache-busting query param.
  const modUrl = new URL(
    `../storage/file-persistence.ts?t=${Date.now()}-${Math.random()}`,
    import.meta.url,
  );
  const mod = (await import(modUrl.href)) as typeof import("../storage/file-persistence");
  return { dir, mod };
}

async function teardown(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.STARSCREENER_DATA_DIR;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface SamplePayload {
  id: string;
  name: string;
  value: number;
  nested: { tags: string[]; active: boolean };
}

const sample: SamplePayload[] = [
  { id: "a", name: "alpha", value: 1, nested: { tags: ["x", "y"], active: true } },
  { id: "b", name: "beta", value: 2, nested: { tags: [], active: false } },
  { id: "c", name: "gamma", value: 3.14, nested: { tags: ["z"], active: true } },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let harness: TestHarness;

beforeEach(async () => {
  harness = await setupHarness();
});

afterEach(async () => {
  await teardown(harness.dir);
});

test("writeJsonlFile + readJsonlFile round-trip preserves objects", async () => {
  const { writeJsonlFile, readJsonlFile } = harness.mod;
  await writeJsonlFile<SamplePayload>("roundtrip.jsonl", sample);
  const loaded = await readJsonlFile<SamplePayload>("roundtrip.jsonl");
  assert.deepEqual(loaded, sample);
});

test("readJsonlFile returns [] when file is missing", async () => {
  const { readJsonlFile } = harness.mod;
  const loaded = await readJsonlFile<SamplePayload>("definitely-missing.jsonl");
  assert.deepEqual(loaded, []);
});

test("appendJsonlFile adds new lines without clobbering earlier content", async () => {
  const { appendJsonlFile, readJsonlFile } = harness.mod;
  await appendJsonlFile<SamplePayload>("append.jsonl", sample[0]);
  await appendJsonlFile<SamplePayload>("append.jsonl", sample[1]);
  await appendJsonlFile<SamplePayload>("append.jsonl", sample[2]);

  const loaded = await readJsonlFile<SamplePayload>("append.jsonl");
  assert.equal(loaded.length, 3);
  assert.deepEqual(loaded[0], sample[0]);
  assert.deepEqual(loaded[1], sample[1]);
  assert.deepEqual(loaded[2], sample[2]);
});

test("writeJsonlFile with an empty array creates a zero-byte file", async () => {
  const { writeJsonlFile, readJsonlFile } = harness.mod;
  await writeJsonlFile<SamplePayload>("empty.jsonl", []);

  // Use the harness's current `dir` — `DATA_DIR` is captured at module load
  // and may reflect a stale value when the ESM cache serves an earlier copy
  // of file-persistence.ts. Internal I/O paths always resolve the live
  // STARSCREENER_DATA_DIR via `currentDataDir()`.
  const stat = await fs.stat(path.join(harness.dir, "empty.jsonl"));
  assert.equal(stat.size, 0);
  const loaded = await readJsonlFile<SamplePayload>("empty.jsonl");
  assert.deepEqual(loaded, []);
});

test("readJsonlFile skips malformed lines and warns", async () => {
  const { readJsonlFile, ensureDataDir } = harness.mod;
  await ensureDataDir();
  const filename = "malformed.jsonl";
  const goodA = JSON.stringify({ id: "a", ok: true });
  const goodB = JSON.stringify({ id: "b", ok: true });
  const body = [goodA, "{ not valid json", goodB, ""].join("\n");
  // Write directly to the harness dir (the live DATA_DIR). See note above.
  await fs.writeFile(path.join(harness.dir, filename), body, "utf8");

  // Capture warnings.
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(" "));
  };
  try {
    const loaded = await readJsonlFile<{ id: string; ok: boolean }>(filename);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].id, "a");
    assert.equal(loaded[1].id, "b");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /malformed JSONL line 2/);
  } finally {
    console.warn = originalWarn;
  }
});

test("atomic write — no .tmp file left after writeJsonlFile finishes", async () => {
  const { writeJsonlFile } = harness.mod;
  await writeJsonlFile<SamplePayload>("atomic.jsonl", sample);
  // Inspect the live harness dir — see note on the "empty array" test above.
  const entries = await fs.readdir(harness.dir);
  assert.ok(entries.includes("atomic.jsonl"), "target file should exist");
  assert.ok(
    !entries.some((e) => e.endsWith(".tmp")),
    `no .tmp leftovers should exist, got: ${entries.join(", ")}`,
  );
});

test("isPersistenceEnabled respects STARSCREENER_PERSIST env var", async () => {
  const { isPersistenceEnabled } = harness.mod;
  const before = process.env.STARSCREENER_PERSIST;
  try {
    delete process.env.STARSCREENER_PERSIST;
    assert.equal(isPersistenceEnabled(), true);

    process.env.STARSCREENER_PERSIST = "true";
    assert.equal(isPersistenceEnabled(), true);

    process.env.STARSCREENER_PERSIST = "false";
    assert.equal(isPersistenceEnabled(), false);

    process.env.STARSCREENER_PERSIST = "FALSE";
    assert.equal(isPersistenceEnabled(), false);
  } finally {
    if (before === undefined) {
      delete process.env.STARSCREENER_PERSIST;
    } else {
      process.env.STARSCREENER_PERSIST = before;
    }
  }
});
