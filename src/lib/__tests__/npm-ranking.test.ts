import assert from "node:assert/strict";
import test from "node:test";

import {
  deltaForNpmWindow,
  getNpmPackages,
  getTopNpmPackages,
  type NpmWindow,
} from "../npm";

test("getTopNpmPackages keeps the full repo-linked corpus for each window", () => {
  const all = getNpmPackages();
  const windows: NpmWindow[] = ["24h", "7d", "30d"];

  assert.ok(all.length > 2, "fixture should contain more than the 24h gainers");

  for (const window of windows) {
    const rows = getTopNpmPackages(window, 1_000);
    assert.equal(rows.length, all.length);
  }
});

test("getTopNpmPackages ranks active-window movers first", () => {
  const [first] = getTopNpmPackages("24h", 1);

  assert.ok(first);
  assert.ok(deltaForNpmWindow(first, "24h") > 0);
});
