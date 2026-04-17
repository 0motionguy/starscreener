#!/usr/bin/env node
// reset-data.mjs — archive the local .data JSONL store into a dated backup
// folder and leave behind an empty .data directory ready for a fresh seed.
//
// Usage:
//   node scripts/reset-data.mjs
//
// Safety:
//   - Refuses to run when NODE_ENV === "production".
//   - Never deletes files. Every archive is a rename into .data/backup-YYYY-MM-DD/.
//   - Idempotent when .data does not exist: prints a note and exits 0.

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("[reset-data] refusing to run with NODE_ENV=production");
  process.exit(1);
}

const cwd = process.cwd();
const dataDir = resolve(cwd, ".data");

if (!existsSync(dataDir)) {
  console.log(`[reset-data] no .data directory at ${dataDir} — nothing to archive`);
  process.exit(0);
}

const stat = statSync(dataDir);
if (!stat.isDirectory()) {
  console.error(`[reset-data] ${dataDir} exists but is not a directory`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
let backupDir = join(dataDir, `backup-${today}`);

// If a backup for today already exists, suffix with -1, -2, ... to avoid
// clobbering a prior reset from earlier the same day.
let suffix = 1;
while (existsSync(backupDir)) {
  backupDir = join(dataDir, `backup-${today}-${suffix}`);
  suffix += 1;
}

mkdirSync(backupDir, { recursive: true });

const entries = readdirSync(dataDir, { withFileTypes: true });
let moved = 0;
let skipped = 0;
for (const entry of entries) {
  // Skip nested backup-* folders so repeated runs don't nest forever.
  if (entry.isDirectory() && entry.name.startsWith("backup-")) {
    skipped += 1;
    continue;
  }
  // Only move JSONL files — leave anything else alone so we don't surprise
  // operators who drop README / .gitkeep / tooling state into .data.
  if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
    skipped += 1;
    continue;
  }
  const from = join(dataDir, entry.name);
  const to = join(backupDir, entry.name);
  renameSync(from, to);
  moved += 1;
}

console.log(`[reset-data] archived ${moved} jsonl file(s) into ${backupDir}`);
if (skipped > 0) {
  console.log(`[reset-data] skipped ${skipped} non-jsonl / existing-backup entr(ies)`);
}
console.log(`[reset-data] .data is now clean — run \`npm run seed\` to repopulate`);
