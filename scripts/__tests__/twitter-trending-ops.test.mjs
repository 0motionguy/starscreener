import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
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

test("host runner logs slot-qualified success only after confirmation", async () => {
  const runner = await read("scripts/twitter-trending-run.mjs");
  const confirmationGuard = runner.indexOf("if (!cres.ok)");
  const successLog = runner.indexOf(
    'log("posted", `slot=${SLOT ?? "unslotted"}`, tweetId);',
  );

  assert.notEqual(confirmationGuard, -1, "missing confirmation failure guard");
  assert.notEqual(successLog, -1, "missing slot-qualified success log");
  assert.ok(successLog > confirmationGuard, "success is logged before confirmation");
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
  assert.ok(
    preflightWrapper.includes("prior_day=$(date -u -d 'yesterday' +%F)"),
    "preflight does not target the prior UTC day",
  );
  assert.ok(
    preflightWrapper.includes("for slot in D A B C E; do"),
    "preflight does not inspect every posting slot",
  );
  assert.ok(
    preflightWrapper.includes('posted slot=${slot}'),
    "preflight does not match slot-qualified success logs",
  );
  assert.match(preflightWrapper, /missing confirmed posts/);
  assert.doesNotMatch(preflightWrapper, /OUTCOME_WINDOW_H/);
});

test("host runner fails when the posted tweet cannot be confirmed", async (t) => {
  const oldSecret = process.env.CRON_SECRET;
  const oldUrl = process.env.TRENDINGREPO_URL;
  process.env.CRON_SECRET = "test-secret";
  process.env.TRENDINGREPO_URL = "http://test.invalid";

  const exits = [];
  const logs = [];
  t.mock.method(process, "exit", (code) => {
    exits.push(code);
  });
  t.mock.method(console, "log", (...args) => {
    logs.push(args.join(" "));
  });
  t.mock.method(childProcess, "execFileSync", (_file, args) =>
    args[0] === "--compact"
      ? "ok: true\nusername: trendingrepo\n"
      : JSON.stringify({ data: { id: "1234567890123456789" } }),
  );
  syncBuiltinESMExports();

  let request = 0;
  let confirmed;
  const confirmationReached = new Promise((resolve) => {
    confirmed = resolve;
  });
  t.mock.method(globalThis, "fetch", async () => {
    request += 1;
    if (request === 1) {
      return Response.json({
        post: true,
        fullName: "acme/repo",
        fullNames: ["acme/repo"],
        text: "acme/repo\n+10 stars today",
        url: "https://trendingrepo.com/repo/acme/repo",
      });
    }
    confirmed();
    return new Response("ledger unavailable", { status: 503 });
  });

  try {
    await import(`../twitter-trending-run.mjs?confirm-failure=${Date.now()}`);
    await confirmationReached;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(exits, [1]);
    assert.equal(
      logs.some((line) => line.includes(" posted ")),
      false,
      "failed confirmation emitted a success marker",
    );
  } finally {
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    if (oldUrl === undefined) delete process.env.TRENDINGREPO_URL;
    else process.env.TRENDINGREPO_URL = oldUrl;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
