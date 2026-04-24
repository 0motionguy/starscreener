// Tests for src/lib/npm-daily.ts and src/lib/npm-dependents.ts.
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/npm-daily.test.ts
//
// Uses node:test + node:assert. Each test points the loaders at a fixture
// file in ./fixtures via the __setXPathForTests helpers so we never touch
// the real .data/ directory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDailyDownloadsForPackage,
  __setDailyPathForTests,
} from "../../npm-daily";
import {
  getNpmDependentsCount,
  __setDependentsPathForTests,
} from "../../npm-dependents";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DAILY = path.join(__dirname, "fixtures", "npm-daily.jsonl");
const FIX_DEPS = path.join(__dirname, "fixtures", "npm-dependents.json");

// ---------------------------------------------------------------------------
// npm-daily.ts
// ---------------------------------------------------------------------------

test("getDailyDownloadsForPackage returns [] when file missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "npm-daily-"));
  try {
    __setDailyPathForTests(path.join(tmp, "does-not-exist.jsonl"));
    assert.deepEqual(getDailyDownloadsForPackage("next"), []);
  } finally {
    __setDailyPathForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("getDailyDownloadsForPackage returns [] for unknown package", () => {
  __setDailyPathForTests(FIX_DAILY);
  try {
    assert.deepEqual(getDailyDownloadsForPackage("not-tracked"), []);
  } finally {
    __setDailyPathForTests(null);
  }
});

test("getDailyDownloadsForPackage sorts ascending", () => {
  __setDailyPathForTests(FIX_DAILY);
  try {
    const rows = getDailyDownloadsForPackage("next");
    assert.ok(rows.length > 0);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        rows[i - 1].date.localeCompare(rows[i].date) < 0,
        `expected ${rows[i - 1].date} < ${rows[i].date}`,
      );
    }
  } finally {
    __setDailyPathForTests(null);
  }
});

test("getDailyDownloadsForPackage fills missing interior days with 0", () => {
  // Fixture has next: 2026-04-01, 2026-04-02, 2026-04-04, 2026-04-05
  // (missing 2026-04-03). Expect zero-fill.
  __setDailyPathForTests(FIX_DAILY);
  try {
    const rows = getDailyDownloadsForPackage("next");
    assert.equal(rows.length, 5);
    assert.deepEqual(rows, [
      { date: "2026-04-01", downloads: 1000 },
      { date: "2026-04-02", downloads: 1100 },
      { date: "2026-04-03", downloads: 0 },
      { date: "2026-04-04", downloads: 1300 },
      { date: "2026-04-05", downloads: 1400 },
    ]);
  } finally {
    __setDailyPathForTests(null);
  }
});

test("getDailyDownloadsForPackage caps at 30 days", () => {
  // Fixture has 31 consecutive days for react (2026-03-20 .. 2026-04-19).
  __setDailyPathForTests(FIX_DAILY);
  try {
    const rows = getDailyDownloadsForPackage("react");
    assert.equal(rows.length, 30);
    // Newest 30 means the oldest should be 2026-03-21, not 2026-03-20.
    assert.equal(rows[0].date, "2026-03-21");
    assert.equal(rows[rows.length - 1].date, "2026-04-19");
  } finally {
    __setDailyPathForTests(null);
  }
});

test("getDailyDownloadsForPackage tolerates malformed lines", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "npm-daily-"));
  const file = path.join(tmp, "mixed.jsonl");
  await fs.writeFile(
    file,
    [
      "not-json",
      '{"package":"good","date":"2026-04-01","downloads":10,"fetchedAt":"x"}',
      '{"missing":"fields"}',
      '{"package":"good","date":"not-a-date","downloads":10}',
      '{"package":"good","date":"2026-04-02","downloads":20,"fetchedAt":"x"}',
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    __setDailyPathForTests(file);
    const rows = getDailyDownloadsForPackage("good");
    assert.deepEqual(rows, [
      { date: "2026-04-01", downloads: 10 },
      { date: "2026-04-02", downloads: 20 },
    ]);
  } finally {
    __setDailyPathForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// npm-dependents.ts
// ---------------------------------------------------------------------------

test("getNpmDependentsCount returns null when file missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "npm-deps-"));
  try {
    __setDependentsPathForTests(path.join(tmp, "nope.json"));
    assert.equal(getNpmDependentsCount("next"), null);
  } finally {
    __setDependentsPathForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("getNpmDependentsCount returns null when package absent", () => {
  __setDependentsPathForTests(FIX_DEPS);
  try {
    assert.equal(getNpmDependentsCount("not-there"), null);
  } finally {
    __setDependentsPathForTests(null);
  }
});

test("getNpmDependentsCount returns number when present", () => {
  __setDependentsPathForTests(FIX_DEPS);
  try {
    assert.equal(getNpmDependentsCount("next"), 42);
  } finally {
    __setDependentsPathForTests(null);
  }
});

test("getNpmDependentsCount returns null when count is explicitly null", () => {
  __setDependentsPathForTests(FIX_DEPS);
  try {
    assert.equal(getNpmDependentsCount("react"), null);
  } finally {
    __setDependentsPathForTests(null);
  }
});
