#!/usr/bin/env node
// Phase 5 PreToolUse guard — protected-paths gate.
// Reads the Claude Code tool-event JSON from stdin and blocks edits to
// security/infra files unless the user has explicitly approved.
// Exits 2 on match (Claude Code treats stderr+exit2 as a hard block);
// exits 0 otherwise so other tools/files proceed normally.

import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const PROTECTED = [
  "src/lib/redis/keys.ts",
  "src/lib/api/auth.ts",
  "vercel.json",
  "next.config.ts",
];
const WORKFLOW_RE = /(^|[\\/])\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i;

let event = {};
try {
  event = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0);
}

const tool = event.tool_name || event.tool || "";
if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/i.test(tool)) process.exit(0);

const input = event.tool_input || event.input || {};
const candidate = input.file_path || input.path || input.notebook_path || "";
if (!candidate) process.exit(0);

const norm = String(candidate).replace(/\\/g, "/").toLowerCase();
const matched =
  PROTECTED.some((p) => norm.endsWith("/" + p) || norm === p) ||
  WORKFLOW_RE.test(String(candidate));

if (matched) {
  // Escape hatch for documented workflows (e.g. legitimate .github/workflows
  // YAML edits during a release sweep). Logged to stderr so the bypass shows
  // up in the harness audit trail. See .claude/hooks/README.md.
  if (process.env.BYPASS_PROTECTION === "true") {
    process.stderr.write(
      `[protect-files] BYPASS_PROTECTION=true -- allowing edit to ${candidate}\n`,
    );
    process.exit(0);
  }
  process.stderr.write(
    `Protected file ${candidate}; ask the user before editing. Override with BYPASS_PROTECTION=true (visible in audit log).\n`,
  );
  process.exit(2);
}

process.exit(0);
