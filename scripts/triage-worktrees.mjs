#!/usr/bin/env node
// B.21 — Worktree triage helper.
//
// Inventories every `git worktree` for the current repo and reports each
// branch's PR state, dirty-file count, and a recommended action (KEEP /
// REMOVE / ASK). Read-only — never modifies a worktree.
//
// Run from any clone of the repo:
//   node scripts/triage-worktrees.mjs
//
// Optional flags:
//   --json     Emit JSON instead of a table. Useful for piping to jq.
//   --pr-only  Skip worktrees whose branch has no associated PR.

import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const EMIT_JSON = args.has("--json");
const PR_ONLY = args.has("--pr-only");

function run(cmd, { cwd = process.cwd(), allowFail = false } = {}) {
  try {
    return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

function parseWorktreeList() {
  const out = run("git worktree list --porcelain");
  const blocks = out.split(/\n\n+/);
  const worktrees = [];
  for (const block of blocks) {
    const wt = {};
    for (const line of block.split("\n")) {
      const [k, ...rest] = line.split(" ");
      const v = rest.join(" ");
      if (k === "worktree") wt.path = v;
      else if (k === "HEAD") wt.head = v;
      else if (k === "branch") wt.branch = v.replace(/^refs\/heads\//, "");
      else if (k === "detached") wt.detached = true;
    }
    if (wt.path) worktrees.push(wt);
  }
  return worktrees;
}

function dirtyFileCount(path) {
  if (!existsSync(path)) return { exists: false, count: 0 };
  const result = spawnSync("git", ["status", "--short"], {
    cwd: path,
    encoding: "utf8",
  });
  if (result.status !== 0) return { exists: true, count: -1, error: result.stderr };
  const lines = result.stdout.split("\n").filter(Boolean);
  return { exists: true, count: lines.length };
}

function prStateForBranch(branch) {
  // Use `gh` to look up PRs whose head is this branch. We ask for all
  // states (open + closed + merged) so we can tell merged-and-can-remove
  // from open-and-keep. gh prints a JSON array; empty array means no PR.
  const result = spawnSync(
    "gh",
    ["pr", "list", "--head", branch, "--state", "all", "--json", "number,state,title,url"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { error: result.stderr?.trim() || "gh failed" };
  }
  try {
    const arr = JSON.parse(result.stdout);
    if (!Array.isArray(arr) || arr.length === 0) return { state: "none", prs: [] };
    // Pick the most relevant PR: open > merged > closed
    const open = arr.find((p) => p.state === "OPEN");
    const merged = arr.find((p) => p.state === "MERGED");
    const closed = arr.find((p) => p.state === "CLOSED");
    const primary = open || merged || closed || arr[0];
    return { state: primary.state.toLowerCase(), prs: arr, primary };
  } catch (err) {
    return { error: `parse: ${err.message}` };
  }
}

function recommendAction({ branch, detached, dirty, pr }) {
  if (dirty.count > 0) return { action: "KEEP", reason: `dirty (${dirty.count} files)` };
  if (detached) return { action: "ASK", reason: "detached HEAD — historical pointer?" };
  if (!branch) return { action: "ASK", reason: "no branch info" };
  if (pr.error) return { action: "ASK", reason: `gh error: ${pr.error.slice(0, 40)}` };
  if (pr.state === "merged") return { action: "REMOVE", reason: `PR #${pr.primary.number} merged` };
  if (pr.state === "closed") return { action: "REMOVE", reason: `PR #${pr.primary.number} closed (not merged)` };
  if (pr.state === "open") return { action: "KEEP", reason: `PR #${pr.primary.number} OPEN` };
  if (pr.state === "none") {
    // Branch with no PR — could be local-only WIP. Don't auto-remove.
    if (branch === "main" || branch === "master") return { action: "KEEP", reason: "main worktree" };
    return { action: "ASK", reason: "no PR, clean — local WIP or abandoned?" };
  }
  return { action: "ASK", reason: `unknown pr state: ${pr.state}` };
}

function main() {
  const worktrees = parseWorktreeList();
  const rows = [];

  for (const wt of worktrees) {
    const dirty = dirtyFileCount(wt.path);
    const pr = wt.branch ? prStateForBranch(wt.branch) : { state: "n/a" };
    const rec = recommendAction({
      branch: wt.branch,
      detached: wt.detached,
      dirty,
      pr,
    });
    rows.push({
      path: wt.path,
      branch: wt.branch ?? "(detached)",
      head: wt.head?.slice(0, 9) ?? "—",
      exists: dirty.exists,
      dirty_files: dirty.count,
      pr_state: pr.state ?? "error",
      pr_number: pr.primary?.number ?? null,
      pr_title: pr.primary?.title ?? null,
      action: rec.action,
      reason: rec.reason,
    });
  }

  if (PR_ONLY) {
    const filtered = rows.filter((r) => r.pr_state !== "none" && r.pr_state !== "n/a");
    if (EMIT_JSON) console.log(JSON.stringify(filtered, null, 2));
    else printTable(filtered);
    return;
  }

  if (EMIT_JSON) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  printTable(rows);
  printSummary(rows);
}

function printTable(rows) {
  console.log("");
  console.log("WORKTREE TRIAGE REPORT");
  console.log("======================");
  console.log("");
  for (const r of rows) {
    const dirtyStr =
      r.dirty_files === -1
        ? "ERR"
        : r.dirty_files > 0
        ? `${r.dirty_files} dirty`
        : "clean";
    const prStr =
      r.pr_state === "none"
        ? "no PR"
        : r.pr_state === "n/a"
        ? "n/a"
        : `PR #${r.pr_number} ${r.pr_state.toUpperCase()}`;
    console.log(`  ${pad(r.action, 7)}  ${pad(r.branch, 50)}  ${pad(dirtyStr, 11)}  ${pad(prStr, 22)}  ${r.path}`);
    if (r.pr_title) {
      console.log(`           ${pad("", 50)}  ${pad("", 11)}  ${pad("", 22)}  ↳ ${r.pr_title.slice(0, 80)}`);
    }
    console.log(`           reason: ${r.reason}`);
  }
}

function printSummary(rows) {
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.action] = (acc[r.action] || 0) + 1;
      return acc;
    },
    {},
  );
  console.log("");
  console.log("SUMMARY");
  console.log("=======");
  console.log(`  Total worktrees: ${rows.length}`);
  for (const [action, n] of Object.entries(counts)) {
    console.log(`  ${pad(action, 7)} ${n}`);
  }
  console.log("");
  console.log(
    "To remove a worktree:  git worktree remove --force <path>",
  );
  console.log("");
}

function pad(s, n) {
  s = String(s ?? "");
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

main();
