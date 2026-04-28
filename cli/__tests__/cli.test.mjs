// SCR-16: black-box smoke tests for the cli/ss.mjs entry point.
//
// The CLI doesn't export its argv parser or table formatter — testing via
// the surface (spawn the cli, assert stdout/stderr/exit-code) avoids
// refactoring 572 LOC for a few sanity checks. Tests stay offline by
// hitting commands that don't require the dev server.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "ss.mjs");

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    // Force the CLI to skip any local network — tests assert on
    // exit code + stdout/stderr text only.
    env: { ...process.env, STARSCREENER_API_URL: "http://localhost:0" },
  });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("ss --version prints semver-shaped version", () => {
  const { code, stdout } = runCli(["--version"]);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^ss \d+\.\d+\.\d+/);
});

test("ss help lists every documented command", () => {
  const { code, stdout } = runCli(["help"]);
  assert.equal(code, 0);
  // Spot-check the top-line plus every documented command.
  assert.match(stdout, /TrendingRepo CLI/);
  for (const cmd of [
    "trending",
    "breakouts",
    "new",
    "search",
    "repo",
    "compare",
    "categories",
    "stream",
  ]) {
    assert.match(
      stdout,
      new RegExp(`\\b${cmd}\\b`),
      `help output should mention ${cmd}`,
    );
  }
});

test("ss with no args prints help", () => {
  const { code, stdout } = runCli([]);
  // No-arg invocation routes through the help path; should be exit 0
  // with the same shape as `ss help`.
  assert.equal(code, 0);
  assert.match(stdout, /USAGE\b/);
});

test("ss <unknown> errors with a helpful pointer", () => {
  const { code, stdout, stderr } = runCli(["definitely-not-a-command"]);
  assert.notEqual(code, 0, "should exit non-zero on unknown command");
  // stderr or stdout — the CLI prints to stderr but allow either.
  const combined = `${stdout}\n${stderr}`;
  assert.match(combined, /unknown command/i);
  assert.match(combined, /run "ss help"/i);
});

test("ss --json flag is recognized at the parser level", () => {
  // Use `repo` with a syntactically-invalid slug so the request never
  // reaches the network; we just want to verify the parser accepts
  // --json without crashing on argv layout.
  const { code, stdout, stderr } = runCli(["repo", "not-a-slug", "--json"]);
  // Either the CLI rejects the slug locally (exit non-zero with a
  // structured-ish error) or it tries to fetch and fails network. Both
  // are fine for this test — we're validating the argv parser doesn't
  // throw on the --json suffix.
  assert.ok(typeof code === "number");
  // Should NOT contain a JS stack trace — that would indicate parser
  // failure rather than handled error.
  const combined = `${stdout}\n${stderr}`;
  assert.doesNotMatch(combined, /TypeError|SyntaxError|at parseArgs/);
});
