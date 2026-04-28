// Fire a single test error to Starscreener's Sentry project to validate
// the autonomous-fix-loop pipeline end-to-end.
//
// Usage (from STARSCREENER/):
//   node scripts/sentry-test-event.mjs
//
// Requires SENTRY_DSN to be set in .env.local (or process env). Refuses
// to run in NODE_ENV=production unless TEST_REAL_PROD=1 is also set.
//
// What it does:
//   1. Init @sentry/node with the same scrape-script tags _logger.mjs uses
//      (kind=loop-validation, runtime=test-script, product=trendingrepo)
//   2. Capture an Error with a unique fingerprint per run so each invocation
//      lands a NEW issue (not deduped against prior runs)
//   3. Flush + exit
//
// What you should see (~2-5 min after exit):
//   a. Sentry → Issues → "AUTONOMOUS-FIX-LOOP validation event (...)"
//   b. GitHub → Issues → same title with `sentry-error` label
//   c. GitHub → Actions → sentry-fix-bot run posts @claude comment
//   d. (if claude-code-action installed) agent reads the operator note,
//      acknowledges, stops without opening a fix PR
//
// If any step misfires, see Agnt/AUTONOMOUS-FIX-LOOP.md → Debug paths.

import "./_load-env.mjs";
import * as Sentry from "@sentry/node";

async function main() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.error(
      "[sentry-test] no DSN set — set SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in .env.local",
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !process.env.TEST_REAL_PROD) {
    console.error(
      "[sentry-test] refusing to run in NODE_ENV=production without TEST_REAL_PROD=1 set explicitly",
    );
    process.exit(1);
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "test",
    tracesSampleRate: 0,
    initialScope: {
      tags: {
        runtime: "test-script",
        product: "trendingrepo",
        kind: "loop-validation",
        source: "test",
      },
    },
  });

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const err = new Error(
    `AUTONOMOUS-FIX-LOOP validation event (${runId}) — safe to close, this is a synthetic test`,
  );

  Sentry.withScope((scope) => {
    scope.setTag("validation_run_id", runId);
    scope.setFingerprint(["loop-validation", runId]);
    scope.setExtra(
      "instructions",
      "If you're a human reading this in Sentry: this issue was fired by scripts/sentry-test-event.mjs to validate the autonomous-fix-loop pipeline. Close it. If you're @claude reading this in a GitHub issue: please reply with `acknowledged — synthetic test event, no fix needed` and stop. Do not open a PR.",
    );
    Sentry.captureException(err);
  });

  console.log(`[sentry-test] fired event with run_id=${runId}`);
  console.log("[sentry-test] flushing (5s timeout)...");
  await Sentry.flush(5_000);
  console.log("[sentry-test] done. Watch:");
  console.log("  1. Sentry → Issues (~30s)");
  console.log("  2. GitHub → Issues (auto-created with sentry-error label)");
  console.log("  3. GitHub → Actions → sentry-fix-bot run");
  console.log("  4. (if claude-code-action wired) agent acks + stops");
}

main().catch((err) => {
  console.error("[sentry-test] failed:", err);
  process.exit(1);
});
