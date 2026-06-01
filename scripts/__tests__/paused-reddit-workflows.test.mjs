import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const PAUSED_REDDIT_WORKFLOWS = [
  ".github/workflows/cron-reddit-daily.yml",
  ".github/workflows/refresh-reddit-baselines.yml",
  ".github/workflows/probe-reddit.yml",
];

test("paused Reddit workflows cannot run Reddit collectors or probes", () => {
  for (const file of PAUSED_REDDIT_WORKFLOWS) {
    const source = readFileSync(file, "utf8");

    assert.match(
      source,
      /Reddit collection is paused end-to-end/,
      `${file} must state the paused operator contract`,
    );
    assert.doesNotMatch(
      source,
      /^\s*run:\s*(?:npm run scrape:reddit|node scripts\/(?:compute-reddit-baselines|scrape-reddit|probe-reddit-endpoints)\.mjs)/m,
      `${file} must not invoke Reddit scraping, baselines, or endpoint probes`,
    );
  }
});
