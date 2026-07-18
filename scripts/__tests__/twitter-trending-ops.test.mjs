import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    'log("posted", `slot=${intent.slot}`, intent.tweetId);',
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

test("X cookie rotation accepts secrets only on stdin and commits after verification", async () => {
  const [refresh, preflight] = await Promise.all([
    read("scripts/ops/trendingrepo-refresh-x-cookies.sh"),
    read("scripts/ops/trendingrepo-x-preflight.sh"),
  ]);

  assert.match(refresh, /\[ "\$\{1:-\}" = "--stdin" \] \|\|/);
  assert.doesNotMatch(refresh, /<auth_token> <ct0>/);
  assert.match(refresh, /mktemp/);
  const verification = refresh.indexOf("STATUS=$(twitter");
  const commit = refresh.indexOf('mv -f "$TMP" "$ENV"');
  assert.notEqual(verification, -1, "missing candidate-session verification");
  assert.notEqual(commit, -1, "missing atomic cookie commit");
  assert.ok(
    verification < commit,
    "cookies are committed before the session is verified",
  );
  assert.match(refresh, /--force-recreate trendingrepo/);
  assert.doesNotMatch(preflight, /<auth_token> <ct0>/);
});

test("host runner retries durable confirmation before proposing or posting again", async (t) => {
  const oldSecret = process.env.CRON_SECRET;
  const oldUrl = process.env.TRENDINGREPO_URL;
  const oldIntentFile = process.env.TRENDING_POST_INTENT_FILE;
  const tempDir = await mkdtemp(join(tmpdir(), "trendingrepo-x-intent-"));
  const intentFile = join(tempDir, "pending.json");
  process.env.CRON_SECRET = "test-secret";
  process.env.TRENDINGREPO_URL = "http://test.invalid";
  process.env.TRENDING_POST_INTENT_FILE = intentFile;

  const exits = [];
  const logs = [];
  let posts = 0;
  let failureExited;
  let posted;
  const failureExitReached = new Promise((resolve) => {
    failureExited = resolve;
  });
  const postedReached = new Promise((resolve) => {
    posted = resolve;
  });
  t.mock.method(process, "exit", (code) => {
    exits.push(code);
    if (code === 1) failureExited();
  });
  t.mock.method(console, "log", (...args) => {
    const line = args.join(" ");
    logs.push(line);
    if (line.includes("posted slot=unslotted 1234567890123456789")) posted();
  });
  t.mock.method(childProcess, "execFileSync", (_file, args) => {
    if (args[0] === "--compact") return "ok: true\nusername: trendingrepo\n";
    posts += 1;
    return JSON.stringify({ data: { id: "1234567890123456789" } });
  });
  syncBuiltinESMExports();

  let proposals = 0;
  let confirmations = 0;
  const confirmationWaiters = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    if (!body.confirm) {
      proposals += 1;
      return Response.json({
        post: true,
        fullName: "acme/repo",
        fullNames: ["acme/repo"],
        text: "acme/repo\n+10 stars today",
        url: "https://trendingrepo.com/repo/acme/repo",
      });
    }
    confirmations += 1;
    confirmationWaiters.shift()?.();
    return confirmations === 1
      ? new Response("ledger unavailable", { status: 503 })
      : Response.json({ ok: true });
  });

  try {
    const firstConfirmation = new Promise((resolve) => confirmationWaiters.push(resolve));
    await import(`../twitter-trending-run.mjs?confirm-failure=${Date.now()}`);
    await firstConfirmation;
    await failureExitReached;

    const pending = JSON.parse(await readFile(intentFile, "utf8"));
    assert.equal(pending.tweetId, "1234567890123456789");
    assert.deepEqual(pending.confirm.fullNames, ["acme/repo"]);

    const secondConfirmation = new Promise((resolve) => confirmationWaiters.push(resolve));
    await import(`../twitter-trending-run.mjs?confirm-retry=${Date.now()}`);
    await secondConfirmation;
    await postedReached;

    assert.deepEqual(exits, [1]);
    assert.equal(proposals, 1, "retry requested a fresh proposal");
    assert.equal(posts, 1, "retry posted a duplicate tweet");
    assert.equal(confirmations, 2);
    await assert.rejects(readFile(intentFile, "utf8"), { code: "ENOENT" });
    assert.ok(logs.some((line) => line.includes("posted slot=unslotted 1234567890123456789")));
  } finally {
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    if (oldUrl === undefined) delete process.env.TRENDINGREPO_URL;
    else process.env.TRENDINGREPO_URL = oldUrl;
    if (oldIntentFile === undefined) delete process.env.TRENDING_POST_INTENT_FILE;
    else process.env.TRENDING_POST_INTENT_FILE = oldIntentFile;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("host runner blocks when a prior post outcome is ambiguous", async (t) => {
  const oldSecret = process.env.CRON_SECRET;
  const oldIntentFile = process.env.TRENDING_POST_INTENT_FILE;
  const tempDir = await mkdtemp(join(tmpdir(), "trendingrepo-x-ambiguous-"));
  const intentFile = join(tempDir, "pending.json");
  process.env.CRON_SECRET = "test-secret";
  process.env.TRENDING_POST_INTENT_FILE = intentFile;
  await writeFile(
    intentFile,
    JSON.stringify({
      version: 1,
      createdAt: "2026-07-18T08:47:00.000Z",
      slot: "A",
      confirm: { fullNames: ["acme/repo"], text: "acme/repo" },
    }),
  );

  const exits = [];
  const logs = [];
  let twitterCalls = 0;
  let fetchCalls = 0;
  let blocked;
  const blockedReached = new Promise((resolve) => {
    blocked = resolve;
  });
  t.mock.method(process, "exit", (code) => {
    exits.push(code);
    if (code === 1) blocked();
  });
  t.mock.method(console, "log", (...args) => logs.push(args.join(" ")));
  t.mock.method(childProcess, "execFileSync", () => {
    twitterCalls += 1;
    return "ok: true\nusername: trendingrepo\n";
  });
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return Response.json({ post: false, reason: "no-candidates" });
  });
  syncBuiltinESMExports();

  try {
    await import(`../twitter-trending-run.mjs?ambiguous=${Date.now()}`);
    await blockedReached;
    assert.deepEqual(exits, [1]);
    assert.equal(twitterCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.ok(logs.some((line) => line.includes("pending post outcome unknown")));
  } finally {
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
    if (oldIntentFile === undefined) delete process.env.TRENDING_POST_INTENT_FILE;
    else process.env.TRENDING_POST_INTENT_FILE = oldIntentFile;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(tempDir, { recursive: true, force: true });
  }
});
