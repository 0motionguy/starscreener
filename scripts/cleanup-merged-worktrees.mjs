#!/usr/bin/env node
// Reads the JSON output of scripts/triage-worktrees.mjs (B.21) and removes
// every worktree whose recommendation is REMOVE (i.e. its branch's PR was
// merged or closed). Read-only by default; pass --execute to actually run
// `git worktree remove --force` on each.
//
// Pairs with scripts/triage-worktrees.mjs:
//   node scripts/triage-worktrees.mjs --json | node scripts/cleanup-merged-worktrees.mjs
//   node scripts/triage-worktrees.mjs --json > /tmp/wt.json
//   node scripts/cleanup-merged-worktrees.mjs --input /tmp/wt.json --execute
//
// Safety:
//   - Dry-run by default (prints planned removals, takes no action).
//   - Skips entries with dirty_files > 0 even if marked REMOVE — never
//     deletes uncommitted work.
//   - Skips entries whose path matches the current process's repo root
//     (refuses to remove the worktree we're running from).
//   - Aborts on the first git error rather than continuing — partial
//     cleanup is worse than no cleanup for diagnostic clarity.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const EXECUTE = flag("--execute");
const INPUT = value("--input");

let raw;
if (INPUT) {
  raw = readFileSync(resolve(INPUT), "utf8");
} else {
  raw = readFileSync(0, "utf8");
}

let rows;
try {
  rows = JSON.parse(raw);
} catch (err) {
  console.error("FATAL: could not parse JSON input:", err.message);
  console.error("Pipe JSON from `triage-worktrees.mjs --json` or pass `--input PATH`.");
  process.exit(2);
}

if (!Array.isArray(rows)) {
  console.error("FATAL: input must be a JSON array of triage rows");
  process.exit(2);
}

const cwd = process.cwd();

const planned = [];
const skipped = [];

for (const r of rows) {
  if (!r || typeof r !== "object") continue;
  const path = r.path;
  if (!path) continue;
  const action = r.action;
  if (action !== "REMOVE") {
    skipped.push({ path, reason: `action=${action}` });
    continue;
  }
  if (r.dirty_files && r.dirty_files > 0) {
    skipped.push({ path, reason: `dirty (${r.dirty_files} files) — refusing` });
    continue;
  }
  if (resolve(path) === cwd) {
    skipped.push({ path, reason: "current cwd — refusing to remove self" });
    continue;
  }
  planned.push(r);
}

console.log("");
console.log("WORKTREE CLEANUP PLAN");
console.log("======================");
console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to actually remove)"}`);
console.log(`Planned removals: ${planned.length}`);
console.log(`Skipped: ${skipped.length}`);
console.log("");
if (planned.length > 0) {
  console.log("Will remove:");
  for (const r of planned) {
    console.log(`  REMOVE  ${r.branch ?? "(detached)"}  -- ${r.path}`);
    console.log(`          reason: ${r.reason}`);
  }
  console.log("");
}
if (skipped.length > 0) {
  console.log("Will SKIP:");
  for (const s of skipped) {
    console.log(`  SKIP    ${s.path}`);
    console.log(`          reason: ${s.reason}`);
  }
  console.log("");
}

if (!EXECUTE) {
  console.log("Dry-run complete. Re-run with --execute to actually remove.");
  process.exit(0);
}

// Execute mode — run git worktree remove --force on each planned entry.
let removed = 0;
let failed = 0;
for (const r of planned) {
  console.log(`Removing ${r.path} ...`);
  const result = spawnSync("git", ["worktree", "remove", "--force", r.path], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`  FAIL: ${result.stderr || result.stdout || "exit " + result.status}`);
    failed += 1;
    // Abort the loop on first failure (per top-of-file safety note).
    break;
  }
  removed += 1;
  console.log(`  ok`);
}

console.log("");
console.log(`Done — removed ${removed}, failed ${failed}, planned ${planned.length}`);
if (failed > 0) process.exit(1);
