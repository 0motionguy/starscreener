// Move 1 / Phase 4 — smoke tests for scripts/_source-script-runner.mjs.
//
// The shim is pure instrumentation: it loads sources.json, calls run(),
// emits a [run-summary] line, and re-throws on failure. Three tests cover
// the success path, the failure path, and the unknown-sourceId warning.
//
// We capture stdout/stderr by stubbing process.stdout.write / process.stderr.write
// — node:test doesn't ship a `t.snapshot` helper for stream output and the
// shim's contract is "one specific stdout line per run", which is easy to
// assert via substring match.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runAsRegisteredSource,
  _resetForTests,
} from "../_source-script-runner.mjs";

function captureStreams() {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const out = [];
  const err = [];
  process.stdout.write = (chunk, ...rest) => {
    out.push(typeof chunk === "string" ? chunk : chunk.toString());
    return origOut(chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    err.push(typeof chunk === "string" ? chunk : chunk.toString());
    return origErr(chunk, ...rest);
  };
  return {
    out,
    err,
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

test("runAsRegisteredSource: success path emits [run-summary] status=ok", async () => {
  _resetForTests();
  const cap = captureStreams();
  try {
    const result = await runAsRegisteredSource({
      sourceId: "bluesky",
      run: async () => "stub-ok",
    });
    assert.equal(result, "stub-ok");
    const summary = cap.out.find((line) => line.startsWith("[run-summary]"));
    assert.ok(summary, "expected a [run-summary] line on stdout");
    assert.match(summary, /source=bluesky/);
    assert.match(summary, /status=ok/);
    assert.match(summary, /duration_ms=\d+/);
  } finally {
    cap.restore();
  }
});

test("runAsRegisteredSource: failure path emits status=error and re-throws", async () => {
  _resetForTests();
  const cap = captureStreams();
  try {
    await assert.rejects(
      async () =>
        runAsRegisteredSource({
          sourceId: "bluesky",
          run: async () => {
            throw new Error("simulated upstream failure");
          },
        }),
      /simulated upstream failure/,
    );
    const summary = cap.out.find((line) => line.startsWith("[run-summary]"));
    assert.ok(summary, "expected a [run-summary] line on stdout even on failure");
    assert.match(summary, /source=bluesky/);
    assert.match(summary, /status=error/);
    assert.match(summary, /error="simulated upstream failure"/);
  } finally {
    cap.restore();
  }
});

test("runAsRegisteredSource: still emits run-summary for unknown / missing-registry sourceId", async () => {
  _resetForTests();
  const cap = captureStreams();
  try {
    const result = await runAsRegisteredSource({
      sourceId: "definitely-not-a-registered-source-xyzzy",
      run: async () => 42,
    });
    assert.equal(result, 42);
    // Either branch is acceptable: registry-missing OR slug-not-in-registry.
    // Both are graceful warnings that don't block collection. The contract
    // is that the run still completes and emits a run-summary line.
    const warned = cap.err.some(
      (line) =>
        line.includes("[source-script-runner] warn: sourceId") ||
        line.includes("[source-script-runner] warn: could not read registry"),
    );
    assert.ok(
      warned,
      "expected a registry-related warning on stderr (slug-missing OR registry-missing)",
    );
    const summary = cap.out.find((line) => line.startsWith("[run-summary]"));
    assert.ok(summary, "still expected the run-summary line for unknown source");
    assert.match(summary, /status=ok/);
  } finally {
    cap.restore();
  }
});

test("runAsRegisteredSource: rejects missing sourceId / run", async () => {
  _resetForTests();
  await assert.rejects(
    () => runAsRegisteredSource({ sourceId: "", run: async () => 0 }),
    /sourceId is required/,
  );
  await assert.rejects(
    () => runAsRegisteredSource({ sourceId: "bluesky", run: undefined }),
    /run must be an async function/,
  );
});
