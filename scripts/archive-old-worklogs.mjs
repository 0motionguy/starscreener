#!/usr/bin/env node
// archive-old-worklogs.mjs
// Walks repo root for AGN-*WORKLOG.md / AGN-*COVERAGE-REPORT.md files and
// relocates files whose last commit is >30 days old to docs/archive/worklogs/.
//
// Usage: node scripts/archive-old-worklogs.mjs
// Exit codes: 0 ok, 1 unexpected error.

import { execSync } from "node:child_process";
import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const ARCHIVE_DIR = "docs/archive/worklogs";
const CUTOFF_DAYS = 30;
const PATTERN = /^AGN-.*(WORKLOG|COVERAGE-REPORT)\.md$/;

function lastCommitDate(file) {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${file}"`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function daysBetween(isoDate) {
  const then = new Date(isoDate + "T00:00:00Z").getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function ensureArchiveDir() {
  const full = join(REPO_ROOT, ARCHIVE_DIR);
  if (!existsSync(full)) mkdirSync(full, { recursive: true });
}

function moveFile(file) {
  const dest = `${ARCHIVE_DIR}/${file}`;
  execSync(`git mv "${file}" "${dest}"`, { cwd: REPO_ROOT, stdio: "inherit" });
}

function main() {
  ensureArchiveDir();
  const entries = readdirSync(REPO_ROOT).filter((f) => PATTERN.test(f));
  let archived = 0;
  let kept = 0;
  for (const file of entries) {
    const date = lastCommitDate(file);
    if (!date) {
      kept += 1;
      continue;
    }
    const age = daysBetween(date);
    if (age > CUTOFF_DAYS) {
      moveFile(file);
      archived += 1;
    } else {
      kept += 1;
    }
  }
  console.log(`archived=${archived} kept=${kept}`);
}

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
