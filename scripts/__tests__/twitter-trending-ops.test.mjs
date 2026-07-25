import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("X autopilot accepts seven slots and carries the ranker through confirmation", async () => {
  const [route, runner] = await Promise.all([
    read("src/app/api/cron/twitter-trending/route.ts"),
    read("scripts/twitter-trending-run.mjs"),
  ]);
  assert.match(route, /z\.enum\(\["A", "B", "C", "D", "E", "F", "G"\]\)/);
  // The ?slot= query param is validated through SlotSchema directly (no
  // per-letter drift), so widening the enum covers F/G automatically.
  assert.match(route, /SlotSchema\.safeParse\(q\)/);
  assert.match(runner, /\["A", "B", "C", "D", "E", "F", "G"\]/);
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

test("HOSTUP cron dispatches seven UTC slots on a non-UTC host", async () => {
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
    "10) set -- --slot F ;;",
    "12) set -- --slot B ;;",
    "14) set -- --slot G ;;",
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

// 2026-07-21 outage: a single failed `twitter post` left an intent with no
// tweetId, and the runner refused to do anything else until a human deleted the
// file — 21 consecutive slots lost. The ambiguity is now resolved against X's
// own timeline instead of blocking, so a transient error costs at most one slot.
const AMBIGUOUS_INTENT = {
  version: 1,
  createdAt: "2026-07-18T08:47:00.000Z",
  slot: "A",
  confirm: { fullNames: ["acme/repo"], text: "acme/repo\n+10 stars today" },
};

async function runAmbiguousReconcile(t, { label, timeline, propose }) {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    TRENDING_POST_INTENT_FILE: process.env.TRENDING_POST_INTENT_FILE,
  };
  const tempDir = await mkdtemp(join(tmpdir(), `trendingrepo-x-${label}-`));
  const intentFile = join(tempDir, "pending.json");
  process.env.CRON_SECRET = "test-secret";
  process.env.TRENDING_POST_INTENT_FILE = intentFile;
  await writeFile(intentFile, JSON.stringify(AMBIGUOUS_INTENT));

  const state = { exits: [], logs: [], proposals: 0, confirmations: 0, posts: 0, intentFile };
  let settled;
  const finished = new Promise((resolve) => {
    settled = resolve;
  });
  // The real process.exit never returns. A stub that does lets the runner fall
  // through into code paths production would never reach, so unwind instead —
  // and ignore the runner's own catch-handler exit(1) on the way out.
  let exited = false;
  t.mock.method(process, "exit", (code) => {
    if (exited) return;
    exited = true;
    state.exits.push(code);
    settled();
    throw new Error(`__exit_${code}__`);
  });
  t.mock.method(console, "log", (...args) => {
    const line = args.join(" ");
    state.logs.push(line);
    if (line.includes("tweet: https://")) settled();
  });
  t.mock.method(childProcess, "execFileSync", (_file, args) => {
    if (args[0] === "user-posts") return timeline();
    if (args[0] === "--compact") return "ok: true\nusername: trendingrepo\n";
    state.posts += 1;
    return JSON.stringify({ data: { id: "9999999999999999999" } });
  });
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    if (JSON.parse(init.body).confirm) {
      state.confirmations += 1;
      return Response.json({ ok: true });
    }
    state.proposals += 1;
    return Response.json(propose);
  });
  syncBuiltinESMExports();

  try {
    await import(`../twitter-trending-run.mjs?${label}=${Date.now()}`);
    await finished;
    // Let the runner's own catch handler settle while the mocks are still in
    // place — otherwise its exit(1) reaches the real process and kills the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Snapshot the intent BEFORE `finally` removes the temp dir, so callers
    // assert on what the runner left behind rather than on the cleanup.
    state.pendingAfter = await readFile(intentFile, "utf8").then(JSON.parse, (e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    return state;
  } finally {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("ambiguous outcome that DID land is confirmed from the timeline", async (t) => {
  const state = await runAmbiguousReconcile(t, {
    label: "landed",
    timeline: () =>
      JSON.stringify({
        ok: true,
        data: [
          {
            id: "2079578950368387576",
            // X renders newlines as spaces and shortens URLs — the match must survive both.
            text: "acme/repo +10 stars today https://t.co/abcd1234",
            createdAtISO: "2026-07-18T08:47:05+00:00",
          },
        ],
      }),
    propose: { post: false, reason: "unused" },
  });

  assert.equal(state.confirmations, 1, "landed post was not committed to the ledger");
  assert.equal(state.proposals, 0, "reconcile should not propose a duplicate");
  assert.equal(state.posts, 0, "reconcile must never re-post a tweet that already landed");
  assert.ok(
    state.logs.some((l) => l.includes("posted slot=A 2079578950368387576")),
    "missing slot-qualified success for the recovered tweet",
  );
  assert.equal(state.pendingAfter, null, "confirmed intent was not cleared");
});

test("ambiguous outcome that never landed is discarded and the slot recovered", async (t) => {
  const state = await runAmbiguousReconcile(t, {
    label: "absent",
    timeline: () =>
      JSON.stringify({
        ok: true,
        // Same pack header as a prior week, but outside the intent's window —
        // must NOT be mistaken for the pending post.
        data: [
          {
            id: "1111111111111111111",
            text: "acme/repo +10 stars today",
            createdAtISO: "2026-07-04T08:47:05+00:00",
          },
        ],
      }),
    propose: { post: false, reason: "no-candidates" },
  });

  assert.equal(state.confirmations, 0, "discarded intent must not hit the ledger");
  assert.equal(state.proposals, 1, "slot was not recovered after discarding the intent");
  assert.deepEqual(state.exits, [0], "a resolvable ambiguity must not exit non-zero");
  assert.ok(state.logs.some((l) => l.includes("never landed")));
  assert.equal(state.pendingAfter, null, "phantom intent was left on disk");
});

// X rejects some writes with error 226 ("this request looks like it might be
// automated") even when the account is healthy — twitter-cli can no longer send
// x-client-transaction-id, so a slot must survive a flagged attempt. The danger
// is that the CLI can also fail AFTER X accepted the tweet, so every retry has
// to re-check the timeline first.
const AUTOMATION_ERROR =
  '{"ok":false,"error":{"code":"api_error","message":"Twitter API error: Authorization: This request looks like it might be automated. (226)"}}';

async function runPostRetry(t, { label, postOutcomes, timeline }) {
  const env = {
    CRON_SECRET: process.env.CRON_SECRET,
    TRENDING_POST_INTENT_FILE: process.env.TRENDING_POST_INTENT_FILE,
    TRENDING_POST_RETRY_MS: process.env.TRENDING_POST_RETRY_MS,
  };
  const tempDir = await mkdtemp(join(tmpdir(), `trendingrepo-x-${label}-`));
  process.env.CRON_SECRET = "test-secret";
  process.env.TRENDING_POST_INTENT_FILE = join(tempDir, "pending.json");
  process.env.TRENDING_POST_RETRY_MS = "1"; // keep the backoff out of the test

  const state = { exits: [], logs: [], posts: 0, confirmations: 0, proposals: 0 };
  let settled;
  const finished = new Promise((resolve) => {
    settled = resolve;
  });
  let exited = false;
  t.mock.method(process, "exit", (code) => {
    if (exited) return;
    exited = true;
    state.exits.push(code);
    settled();
    throw new Error(`__exit_${code}__`);
  });
  t.mock.method(console, "log", (...args) => {
    const line = args.join(" ");
    state.logs.push(line);
    if (line.includes("tweet: https://")) settled();
  });
  t.mock.method(childProcess, "execFileSync", (_file, args) => {
    if (args[0] === "--compact") return "ok: true\nusername: trendingrepo\n";
    if (args[0] === "user-posts") return timeline();
    const outcome = postOutcomes[state.posts];
    state.posts += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    if (JSON.parse(init.body).confirm) {
      state.confirmations += 1;
      return Response.json({ ok: true });
    }
    state.proposals += 1;
    return Response.json({
      post: true,
      fullName: "acme/repo",
      fullNames: ["acme/repo"],
      text: "acme/repo\n+10 stars today",
      url: "https://trendingrepo.com/repo/acme/repo",
    });
  });
  syncBuiltinESMExports();

  try {
    await import(`../twitter-trending-run.mjs?${label}=${Date.now()}`);
    await finished;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return state;
  } finally {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("a flagged post that actually landed is confirmed, never re-posted", async (t) => {
  const err = Object.assign(new Error("Command failed: twitter post"), {
    stdout: AUTOMATION_ERROR,
  });
  const state = await runPostRetry(t, {
    label: "retry-landed",
    postOutcomes: [err],
    timeline: () =>
      JSON.stringify({
        ok: true,
        data: [
          {
            id: "2080860261301277176",
            text: "acme/repo +10 stars today https://t.co/abcd",
            createdAtISO: new Date().toISOString(),
          },
        ],
      }),
  });

  assert.equal(state.posts, 1, "a landed tweet must never be posted a second time");
  assert.equal(state.confirmations, 1, "the landed tweet was not committed to the ledger");
  assert.ok(state.logs.some((l) => l.includes("landed despite the CLI error")));
  assert.ok(state.logs.some((l) => l.includes("posted slot=unslotted 2080860261301277176")));
});

test("the automation flag is NOT retried inside the slot", async (t) => {
  const err = Object.assign(new Error("Command failed: twitter post"), {
    stdout: AUTOMATION_ERROR,
  });
  const state = await runPostRetry(t, {
    label: "retry-flagged",
    postOutcomes: [err, JSON.stringify({ data: { id: "2080860261301277177" } })],
    timeline: () => JSON.stringify({ ok: true, data: [{ id: "1", text: "unrelated", createdAtISO: "2026-01-01T00:00:00+00:00" }] }),
  });

  assert.equal(state.posts, 1, "retrying a bot-flag just feeds the detector");
  assert.equal(state.confirmations, 0);
  assert.deepEqual(state.exits, [1]);
});

test("a transient network error IS retried and succeeds", async (t) => {
  const err = Object.assign(new Error("Command failed: twitter post"), {
    stdout: '{"ok":false,"error":{"code":"api_error","message":"Twitter API error (HTTP 503): upstream unavailable"}}',
  });
  const state = await runPostRetry(t, {
    label: "retry-recovers",
    postOutcomes: [err, JSON.stringify({ data: { id: "2080860261301277177" } })],
    timeline: () => JSON.stringify({ ok: true, data: [{ id: "1", text: "unrelated", createdAtISO: "2026-01-01T00:00:00+00:00" }] }),
  });

  assert.equal(state.posts, 2, "the slot was lost instead of retried");
  assert.equal(state.confirmations, 1);
  assert.ok(state.logs.some((l) => l.includes("retriable — waiting")));
  assert.ok(state.logs.some((l) => l.includes("posted slot=unslotted 2080860261301277177")));
});

test("a fatal post error fails fast without a second attempt", async (t) => {
  const err = Object.assign(new Error("Command failed: twitter post"), {
    stdout: '{"ok":false,"error":{"code":"not_authenticated","message":"No Twitter cookies found."}}',
  });
  const state = await runPostRetry(t, {
    label: "retry-fatal",
    postOutcomes: [err, JSON.stringify({ data: { id: "999" } })],
    timeline: () => JSON.stringify({ ok: true, data: [{ id: "1", text: "unrelated", createdAtISO: "2026-01-01T00:00:00+00:00" }] }),
  });

  assert.equal(state.posts, 1, "a fatal error must not burn retries");
  assert.equal(state.confirmations, 0);
  assert.deepEqual(state.exits, [1]);
});

// 2026-07-25 05:44Z: a bare "Failed to create tweet" (HTTP 0) lost a slot
// because the matcher only whitelisted known-transient codes. Unknown errors on
// this transport are far more often transient than fatal.
test("an unknown post error is retried, not treated as fatal", async (t) => {
  const err = Object.assign(new Error("Command failed: twitter post"), {
    stdout:
      '{"ok":false,"error":{"code":"api_error","message":"Twitter API error (HTTP 0): Failed to create tweet"}}',
  });
  const state = await runPostRetry(t, {
    label: "retry-unknown",
    postOutcomes: [err, JSON.stringify({ data: { id: "2080999999999999999" } })],
    timeline: () => JSON.stringify({ ok: true, data: [{ id: "1", text: "unrelated", createdAtISO: "2026-01-01T00:00:00+00:00" }] }),
  });

  assert.equal(state.posts, 2, "an unknown error must not cost the slot");
  assert.equal(state.confirmations, 1);
  assert.ok(state.logs.some((l) => l.includes("posted slot=unslotted 2080999999999999999")));
});

test("unresolvable outcome keeps the intent and retries next slot", async (t) => {
  const state = await runAmbiguousReconcile(t, {
    label: "unreachable",
    timeline: () => {
      throw new Error("Command failed: twitter user-posts");
    },
    propose: { post: false, reason: "unused" },
  });

  assert.equal(state.exits[0], 0, "an unreachable probe must not exit non-zero");
  assert.equal(state.confirmations, 0);
  assert.equal(state.posts, 0);
  assert.ok(state.logs.some((l) => l.includes("outcome unresolved")));
  assert.ok(state.pendingAfter, "intent must survive an unreachable probe");
  assert.equal(
    state.pendingAfter.tweetId,
    undefined,
    "intent must stay unresolved for the next tick",
  );
});
