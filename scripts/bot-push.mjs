#!/usr/bin/env node
/**
 * scripts/bot-push.mjs
 *
 * Helper for Paperclip bot agents to ship code through the auto-merge pipeline.
 *
 * Usage:
 *   1. cd <repo>
 *   2. git checkout -b bot/<shortname>/<issue-id>
 *   3. (edit + commit your changes)
 *   4. node scripts/bot-push.mjs bot/<shortname>/<issue-id>
 *
 * What it does:
 *   - Pushes <branch> to origin (--set-upstream)
 *   - Opens a PR via `gh pr create --fill --label auto-merge`
 *   - Enables GitHub auto-merge (squash) — PR merges itself when CI is green
 *
 * Idempotent: if branch is already pushed or PR already open, it skips that step.
 *
 * Exit codes:
 *   0 = success (PR opened or already existed, auto-merge enabled)
 *   1 = bad usage
 *   2 = git push failed
 *   3 = PR create / auto-merge enable failed
 */
import { execSync } from "node:child_process";

const branch = process.argv[2];
if (!branch) {
  console.error("usage: node scripts/bot-push.mjs <branch-name>");
  console.error("       e.g. node scripts/bot-push.mjs bot/vito/AGN-541");
  process.exit(1);
}
if (!/^bot\/[a-z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(branch)) {
  console.error(`branch must match bot/<shortname>/<id>; got: ${branch}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts }).trim();
}

function tryRun(cmd) {
  try { return { ok: true, out: run(cmd) }; }
  catch (e) { return { ok: false, out: (e.stdout || "") + (e.stderr || ""), code: e.status }; }
}

const current = run("git rev-parse --abbrev-ref HEAD");
if (current !== branch) {
  console.error(`current branch is "${current}", expected "${branch}". Checkout first.`);
  process.exit(1);
}

console.log(`\n[1/3] Pushing ${branch} to origin...`);
const push = tryRun(`git push --set-upstream origin ${branch}`);
if (!push.ok) {
  console.error("git push failed:\n" + push.out);
  process.exit(2);
}

console.log(`\n[2/3] Opening PR (or finding existing one)...`);
const existing = tryRun(`gh pr list --head ${branch} --json number,url --jq ".[0]"`);
let prNumber, prUrl;
if (existing.ok && existing.out && existing.out !== "null" && existing.out.trim()) {
  const obj = JSON.parse(existing.out);
  prNumber = obj.number;
  prUrl = obj.url;
  console.log(`  existing PR: #${prNumber} ${prUrl}`);
} else {
  const create = tryRun(`gh pr create --fill --label auto-merge`);
  if (!create.ok) {
    console.error("gh pr create failed:\n" + create.out);
    process.exit(3);
  }
  // gh prints the PR URL on success
  prUrl = create.out.split("\n").find(l => l.startsWith("https://")) || create.out;
  const m = prUrl.match(/\/pull\/(\d+)/);
  prNumber = m ? Number(m[1]) : null;
  console.log(`  created PR: #${prNumber} ${prUrl}`);
}

console.log(`\n[3/3] Enabling auto-merge (squash)...`);
const am = tryRun(`gh pr merge ${prNumber} --auto --squash`);
if (!am.ok) {
  // Auto-merge can fail if branch protection rules are missing or already merged
  console.warn(`  auto-merge enable: ${am.out.trim()}`);
  // not fatal — the PR exists; user can merge manually if needed
}

console.log(`\n✓ done. PR #${prNumber}: ${prUrl}`);
console.log(`  auto-merge will trigger when CI passes.`);
