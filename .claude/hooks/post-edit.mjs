#!/usr/bin/env node
// Phase 5 post-edit hook — Karpathy K4 / project M-rules.
// Runs ESLint --fix then tsc --noEmit on the file Claude just edited.
// - Fails (exit 2) only on real ESLint *errors* or TypeScript errors. Warnings pass.
// - Debounced 2s per file via os.tmpdir() to avoid thrashing on multi-edit bursts.
// - Silent no-op for non-JS/TS files.
// Invoked by Claude Code with the edited path as argv[2].

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// Resolve edited file path. Claude Code passes tool input as JSON on stdin
// (see .claude/hooks/protect-files.mjs for the same pattern). Fall back to
// argv[2] so the hook is also invokable manually for smoke-testing.
function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
let file = process.argv[2] || "";
if (!file) {
  const raw = readStdinSync();
  if (raw) {
    try {
      const evt = JSON.parse(raw);
      file = evt?.tool_input?.file_path || evt?.tool_input?.path || "";
    } catch {
      /* not JSON — leave file empty */
    }
  }
}
if (!file) process.exit(0);
const ext = extname(file).toLowerCase();
const allowed = new Set([".ts", ".tsx", ".mjs", ".js"]);
if (!allowed.has(ext)) process.exit(0);

const debouncePath = join(tmpdir(), "starscreener-post-edit-debounce.json");
let debounce = {};
try {
  if (existsSync(debouncePath)) debounce = JSON.parse(readFileSync(debouncePath, "utf8"));
} catch {
  debounce = {};
}
const now = Date.now();
const last = debounce[file] || 0;
if (now - last < 2000) process.exit(0);
debounce[file] = now;
try {
  writeFileSync(debouncePath, JSON.stringify(debounce));
} catch {
  /* tmp dir non-writable — degrade silently */
}

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

const lint = spawnSync(npxCmd, ["eslint", "--fix", file], { encoding: "utf8" });
const lintOut = `${lint.stdout || ""}\n${lint.stderr || ""}`;
if (lint.status && /\b\d+\s+error(s)?\b/.test(lintOut)) {
  process.stderr.write(`[post-edit] eslint errors in ${file}:\n`);
  process.stderr.write(lintOut.split(/\r?\n/).slice(0, 20).join("\n") + "\n");
  process.exit(2);
}

if (ext === ".ts" || ext === ".tsx") {
  const tsc = spawnSync(npxCmd, ["tsc", "--noEmit"], { encoding: "utf8" });
  if (tsc.status) {
    const out = `${tsc.stdout || ""}\n${tsc.stderr || ""}`;
    process.stderr.write(`[post-edit] tsc --noEmit failed after editing ${file}:\n`);
    process.stderr.write(out.split(/\r?\n/).slice(0, 20).join("\n") + "\n");
    process.exit(2);
  }
}

process.exit(0);
