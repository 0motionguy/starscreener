#!/usr/bin/env node
// bot-push.mjs — push current branch, open PR, enable auto-merge.
// Usage: node scripts/bot-push.mjs <branch-name>
import { execSync } from 'node:child_process';

const branch = process.argv[2];
if (!branch) {
  console.error('usage: node scripts/bot-push.mjs <branch-name>');
  process.exit(2);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8' }).toString().trim();
}
function shCapture(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).toString().trim();
}

const current = shCapture('git rev-parse --abbrev-ref HEAD');
if (current !== branch) {
  console.error(`refusing: current branch is "${current}", expected "${branch}"`);
  process.exit(2);
}

const status = shCapture('git status --porcelain');
if (status) {
  console.error('refusing: working tree has uncommitted changes. commit first.');
  console.error(status);
  process.exit(2);
}

console.log(`[bot-push] pushing ${branch} -> origin`);
sh(`git push -u origin "${branch}"`);

let prUrl = '';
try {
  prUrl = shCapture(`gh pr view "${branch}" --json url -q .url`);
} catch {
  prUrl = '';
}

if (!prUrl) {
  const issueId = (branch.match(/AGN-\d+/) || [''])[0];
  const title = issueId ? `${issueId}: ${branch}` : branch;
  const body = issueId
    ? `Automated PR for ${issueId}.\n\nLinked: https://app.paperclip.ing/AGN/issues/${issueId}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`
    : `Automated PR for branch ${branch}.\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`;
  console.log('[bot-push] opening PR');
  prUrl = shCapture(`gh pr create --base main --head "${branch}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
}

console.log(`[bot-push] PR: ${prUrl}`);

try {
  sh(`gh pr merge "${branch}" --auto --squash --delete-branch`);
  console.log('[bot-push] auto-merge enabled');
} catch (e) {
  console.warn('[bot-push] auto-merge enable failed (likely needs branch-protection or already merged) — PR is open, continue.');
}

console.log(`[bot-push] done: ${prUrl}`);
