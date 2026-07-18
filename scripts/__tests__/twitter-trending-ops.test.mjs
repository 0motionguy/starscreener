import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("X autopilot accepts five slots and carries the ranker through confirmation", async () => {
  const [route, runner] = await Promise.all([
    read("src/app/api/cron/twitter-trending/route.ts"),
    read("scripts/twitter-trending-run.mjs"),
  ]);
  assert.match(route, /z\.enum\(\["A", "B", "C", "D", "E"\]\)/);
  assert.match(route, /q === "D"/);
  assert.match(route, /q === "E"/);
  assert.match(runner, /\["A", "B", "C", "D", "E"\]/);
  assert.match(runner, /plan\.ranker \? \{ ranker: plan\.ranker \}/);
});

test("HOSTUP cron dispatches five UTC slots on a non-UTC host", async () => {
  const [autopilot, preflight, wrapper, preflightWrapper] = await Promise.all([
    read("scripts/ops/trendingrepo-x-autopilot.cron"),
    read("scripts/ops/trendingrepo-x-preflight.cron"),
    read("scripts/ops/trendingrepo-x-autopilot.sh"),
    read("scripts/ops/trendingrepo-x-preflight.sh"),
  ]);
  assert.match(
    autopilot,
    /^47 \* \* \* \* root \/usr\/local\/bin\/trendingrepo-x-autopilot\.sh --dispatch-utc$/m,
  );
  for (const mapping of [
    "04) set -- --slot D ;;",
    "08) set -- --slot A ;;",
    "12) set -- --slot B ;;",
    "17) set -- --slot C ;;",
    "21) set -- --slot E ;;",
  ]) {
    assert.ok(wrapper.includes(mapping), `missing UTC dispatch mapping: ${mapping}`);
  }
  assert.match(preflight, /^27 \* \* \* \* root .* --dispatch-utc/m);
  assert.match(preflightWrapper, /date -u \+%H/);
});
