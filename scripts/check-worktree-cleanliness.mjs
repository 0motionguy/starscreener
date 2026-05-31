#!/usr/bin/env node
// Session-start (or any-time) audit of git worktree health.
//
// Runs `git worktree list --porcelain` then for each worktree:
//   - reports staged + unstaged file counts
//   - flags HIGH-CONFLICT files that get touched by multiple agents
//     (Sidebar.tsx, shell.css, package.json, next.config.ts, etc.)
//   - flags branches that are >7 commits ahead of origin (stale; needs
//     reconcile before more work piles on)
//
// History (2026-05-31): the main /opt/trendingrepo checkout was found
// to be 115 commits behind origin AND have 215 staged worker-files
// from another agent's in-progress work. The deploy almost merged a
// huge stale state. Running this script at session start would have
// surfaced both red flags in 2 seconds.
//
// Usage:
//   node scripts/check-worktree-cleanliness.mjs           # exit 0 / warn
//   node scripts/check-worktree-cleanliness.mjs --strict  # exit 1 on red flag

import { execFileSync } from "node:child_process";

const STRICT = process.argv.includes("--strict");

// Files commonly touched by multiple agents in parallel.
// A pending change in one worktree means high risk of conflict in others.
const HIGH_CONFLICT = new Set([
  "src/components/shell/Sidebar.tsx",
  "src/components/shell/Topbar.tsx",
  "public/shell.css",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "src/lib/auth/clerk-config.ts",
  "src/lib/auth/clerk-appearance.ts",
]);

const STALE_AHEAD_THRESHOLD = 7;
const STALE_BEHIND_THRESHOLD = 7;

function gitFrom(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function listWorktrees() {
  const out = gitFrom(process.cwd(), ["worktree", "list", "--porcelain"]);
  const trees = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) trees.push(cur);
      cur = { path: line.slice("worktree ".length), branch: null, head: null };
    } else if (line.startsWith("HEAD ") && cur) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ") && cur) {
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line.startsWith("detached") && cur) {
      cur.branch = "(detached)";
    }
  }
  if (cur) trees.push(cur);
  return trees;
}

function auditWorktree(tree) {
  const flags = [];
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let aheadBehind = null;

  try {
    const status = gitFrom(tree.path, ["status", "--porcelain"]);
    for (const line of status.split("\n").filter(Boolean)) {
      const x = line[0];
      const y = line[1];
      const file = line.slice(3);
      if (x !== " " && x !== "?") staged++;
      if (y !== " ") unstaged++;
      if (x === "?" && y === "?") untracked++;
      if (HIGH_CONFLICT.has(file.replaceAll("\\", "/"))) {
        flags.push(`high-conflict file pending: ${file}`);
      }
    }

    // Branch tracking: count ahead/behind vs origin
    if (tree.branch && tree.branch !== "(detached)") {
      try {
        const counts = gitFrom(tree.path, [
          "rev-list",
          "--left-right",
          "--count",
          `origin/${tree.branch}...HEAD`,
        ]);
        const [behindStr, aheadStr] = counts.split(/\s+/);
        const behind = Number(behindStr);
        const ahead = Number(aheadStr);
        aheadBehind = { ahead, behind };
        if (ahead > STALE_AHEAD_THRESHOLD) {
          flags.push(`${ahead} commits ahead of origin — push or reconcile`);
        }
        if (behind > STALE_BEHIND_THRESHOLD) {
          flags.push(`${behind} commits behind origin — pull or rebase`);
        }
      } catch {
        // origin branch may not exist yet (new branch); ignore
      }
    }
  } catch (err) {
    flags.push(`status failed: ${(err && err.message) || err}`);
  }

  return { ...tree, staged, unstaged, untracked, aheadBehind, flags };
}

const worktrees = listWorktrees().map(auditWorktree);

console.log(`[check-worktree-cleanliness] ${worktrees.length} worktree(s)`);
console.log();

let redFlags = 0;
for (const wt of worktrees) {
  const label = wt.branch || "(no-branch)";
  console.log(`  ${label}`);
  console.log(`    path:        ${wt.path}`);
  console.log(`    file state:  staged=${wt.staged} unstaged=${wt.unstaged} untracked=${wt.untracked}`);
  if (wt.aheadBehind) {
    console.log(`    vs origin:   ahead=${wt.aheadBehind.ahead} behind=${wt.aheadBehind.behind}`);
  }
  if (wt.flags.length) {
    redFlags += wt.flags.length;
    for (const f of wt.flags) console.log(`    ! ${f}`);
  } else {
    console.log(`    clean`);
  }
  console.log();
}

if (redFlags === 0) {
  console.log(`[check-worktree-cleanliness] OK — all worktrees clean.`);
  process.exit(0);
}

console.log(`[check-worktree-cleanliness] ${redFlags} red flag(s) above.`);
if (STRICT) process.exit(1);
process.exit(0);
