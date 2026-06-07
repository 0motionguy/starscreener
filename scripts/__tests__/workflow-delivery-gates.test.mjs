import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("weekly digest workflow fails on disabled or delivery errors", () => {
  const workflow = readFileSync(".github/workflows/cron-digest-weekly.yml", "utf8");

  assert.match(workflow, /digest\/weekly returned skipped=disabled/);
  assert.match(workflow, /digest\/weekly returned user errors/);
  assert.match(workflow, /digest\/weekly returned newsletter errors/);
});

test("webhook flush workflow fails on delivery failure counters", () => {
  const workflow = readFileSync(".github/workflows/cron-webhooks-flush.yml", "utf8");

  assert.match(workflow, /cron\/webhooks\/scan returned ok=false/);
  assert.match(workflow, /cron\/webhooks\/flush returned ok=false/);
  assert.match(workflow, /webhook delivery not drained/);
});
