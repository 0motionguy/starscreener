import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("HOSTUP installer deploys the five-slot autopilot and raises its cap", async () => {
  const [installer, packageJson] = await Promise.all([
    read("scripts/ops/install-trendingrepo-x-autopilot.sh"),
    read("package.json"),
  ]);

  for (const destination of [
    "/opt/trendingrepo-cron/scripts/twitter-trending-run.mjs",
    "/usr/local/bin/trendingrepo-x-autopilot.sh",
    "/usr/local/bin/trendingrepo-x-preflight.sh",
    "/etc/cron.d/trendingrepo-x-autopilot",
    "/etc/cron.d/trendingrepo-x-preflight",
  ]) {
    assert.ok(installer.includes(destination), `installer misses ${destination}`);
  }

  assert.match(installer, /TRENDING_POST_MAX_PER_DAY=5/);
  assert.match(
    installer,
    /docker compose -f "\$COMPOSE_FILE" up -d --force-recreate trendingrepo/,
  );
  assert.doesNotMatch(installer, /TWITTER_OUTBOUND_MODE=live/);
  assert.match(packageJson, /twitter-trending-install\.test\.mjs/);
});
