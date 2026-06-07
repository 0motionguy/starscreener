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

test("package scripts cannot manually run paused Reddit collectors", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts ?? {};
  for (const name of [
    "scrape:reddit",
    "scrape:reddit:verbose",
    "compute:reddit-baselines",
  ]) {
    assert.equal(
      scripts[name],
      `node scripts/paused-source.mjs reddit ${name}`,
      `${name} must be an explicit paused-source no-op`,
    );
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.includes("reddit")) continue;
    assert.doesNotMatch(
      command,
      /scripts\/(?:scrape-reddit|compute-reddit-baselines|probe-reddit-endpoints)\.mjs/,
      `${name} must not call paused Reddit collectors directly`,
    );
  }
});
