#!/usr/bin/env node
// Phase 5 Stop hook — append a one-line session marker to tasks/HANDOFF.md.
// Defensive: any failure swallowed so we never crash the harness.

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const handoff = resolve(root, "tasks", "HANDOFF.md");
  const git = (args) =>
    execSync(`git ${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

  let branch = "unknown";
  let sha = "unknown";
  let count = 0;
  try { branch = git("rev-parse --abbrev-ref HEAD") || "unknown"; } catch {}
  try { sha = git("rev-parse --short HEAD") || "unknown"; } catch {}
  try {
    const status = git("status --porcelain");
    count = status ? status.split(/\r?\n/).filter(Boolean).length : 0;
  } catch {}

  const line = `${new Date().toISOString()} | branch=${branch} | files=${count} | last-sha=${sha}\n`;

  if (!existsSync(handoff)) {
    mkdirSync(dirname(handoff), { recursive: true });
    writeFileSync(
      handoff,
      "# Session Handoff Log\n\nAuto-appended by .claude/hooks/update-handoff.mjs on session Stop.\nMost recent entries at the bottom.\n\n",
    );
  }
  appendFileSync(handoff, line);
} catch {
  /* never crash the harness */
}
process.exit(0);
