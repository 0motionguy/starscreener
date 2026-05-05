import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(process.cwd(), "scripts", "__tests__", "fixtures", "agn-564");
const OUT_DIR = join(process.cwd(), "qa-artifacts", "AGN-564");
const OUT_FILE = join(OUT_DIR, "smoke-result.json");

function classify(input) {
  if (input.localhostMissing) return "environment_blocker";
  if (input.blockingNonGreen > 0) return "product_stale";
  return "green";
}

test("AGN-564 verify protocol smoke fixtures", () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json")).sort();
  assert.equal(files.length, 3, "expected exactly 3 fixtures");

  const results = [];
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8"));
    const actual = classify(fixture.input);
    assert.equal(actual, fixture.expected.classification, `fixture failed: ${fixture.name}`);
    results.push({
      file,
      name: fixture.name,
      expected: fixture.expected.classification,
      actual,
      pass: true,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        fixtureCount: files.length,
        passCount: results.length,
        failCount: 0,
        results,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
});
