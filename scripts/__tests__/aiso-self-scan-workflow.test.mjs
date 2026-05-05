import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const WORKFLOW_PATH = resolve(ROOT, ".github", "workflows", "aiso-self-scan.yml");
const workflowText = readFileSync(WORKFLOW_PATH, "utf8");

test("AISO self-scan workflow keeps monthly schedule on day 1", () => {
  assert.match(
    workflowText,
    /cron:\s*"17 3 1 \* \*"/,
    "expected monthly day-1 cron `17 3 1 * *` in aiso-self-scan workflow",
  );
});

test("AISO self-scan workflow name documents monthly cadence", () => {
  assert.match(
    workflowText,
    /^\uFEFF?name:\s*AISO monthly self-scan dogfood\s*$/m,
    "expected workflow name to keep monthly cadence wording",
  );
});
