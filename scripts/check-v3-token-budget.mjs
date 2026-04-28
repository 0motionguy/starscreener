#!/usr/bin/env node
// V3 token budget guard — fail when NEW code reintroduces V1 alias names
// that the V3 design sweep cleaned up (commits 9aee3d9, 4b532bb, 9722a43,
// 14dca5e). Patterns covered:
//   - bg-up / bg-down / bg-warning / bg-info  (bare, not bg-up-bg etc.)
//   - text-up / text-down / text-warning / text-info
//   - border-up / border-down / border-warning / border-info
//   - bg-functional / text-functional / border-functional
//   - bg-functional-glow / bg-functional-subtle
//
// Many usages remain in the codebase today; this is a budget guard, NOT a
// sweep. We snapshot the current count per pattern in
// scripts/_v3-token-baseline.json and fail when any pattern's count grows.
// Counts that fall below baseline emit a hint to update the baseline.
//
// Usage:
//   node scripts/check-v3-token-budget.mjs              # check
//   node scripts/check-v3-token-budget.mjs --snapshot   # write baseline
//   V3_TOKEN_BUDGET_SNAPSHOT=1 node ...                  # same, via env
//
// Wire via npm run lint:v3-budget. Exits 1 on any regression.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASELINE_PATH = resolve(__dirname, "_v3-token-baseline.json");

const SCAN_DIRS = ["src/components", "src/app"];
const FILE_EXTS = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES = new Set(["__tests__", "__vitest__", "node_modules", ".next"]);

// Each pattern is checked independently so we can report which one regressed.
// Order matters only for readability of the output.
const PATTERNS = [
  // Bare bg-up / bg-down / bg-warning / bg-info — but NOT bg-up-bg, bg-up-glow, etc.
  // The negative lookahead `(?!-(bg|glow|subtle|fg|ink|ring))` allows the V3 forms
  // (bg-up-bg, bg-up-glow, ...) to pass while flagging the bare V1 alias.
  { name: "bg-up|down|warning|info", regex: /\bbg-(?:up|down|warning|info)\b(?!-(?:bg|glow|subtle|fg|ink|ring))/g },
  { name: "text-up|down|warning|info", regex: /\btext-(?:up|down|warning|info)\b/g },
  { name: "border-up|down|warning|info", regex: /\bborder-(?:up|down|warning|info)\b/g },
  // bg-functional and friends, but NOT bg-functional-glow / -subtle
  // (those have their own dedicated pattern below).
  { name: "bg-functional", regex: /\bbg-functional\b(?!-(?:glow|subtle))/g },
  { name: "text-functional", regex: /\btext-functional\b/g },
  { name: "border-functional", regex: /\bborder-functional\b/g },
  { name: "bg-functional-glow|subtle", regex: /\bbg-functional-(?:glow|subtle)\b/g },
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // directory might not exist; just no-op
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (FILE_EXTS.has(ext)) yield full;
    }
  }
}

async function countAll() {
  const counts = Object.fromEntries(PATTERNS.map((p) => [p.name, 0]));
  const examples = Object.fromEntries(PATTERNS.map((p) => [p.name, []]));

  for (const sub of SCAN_DIRS) {
    for await (const file of walk(resolve(ROOT, sub))) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (const { name, regex } of PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          let m;
          while ((m = regex.exec(lines[i]))) {
            counts[name] += 1;
            if (examples[name].length < 5) {
              examples[name].push({ file: rel, line: i + 1, match: m[0], snippet: lines[i].trim() });
            }
          }
        }
      }
    }
  }
  return { counts, examples };
}

async function readBaseline() {
  try {
    const raw = await readFile(BASELINE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeBaseline(counts) {
  const payload = {
    _comment:
      "V3 token budget baseline. Counts are CURRENT occurrences in src/components and src/app. " +
      "Guard fails when any count rises. Regenerate after a cleanup with: node scripts/check-v3-token-budget.mjs --snapshot",
    generatedAt: new Date().toISOString(),
    counts,
  };
  await writeFile(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

const isSnapshot = process.argv.includes("--snapshot") || process.env.V3_TOKEN_BUDGET_SNAPSHOT === "1";

const { counts, examples } = await countAll();

if (isSnapshot) {
  await writeBaseline(counts);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`[check-v3-token-budget] OK — wrote baseline with ${total} total occurrence(s) across ${PATTERNS.length} pattern(s) to scripts/_v3-token-baseline.json`);
  for (const { name } of PATTERNS) {
    console.log(`  ${name.padEnd(34)} ${counts[name]}`);
  }
  process.exit(0);
}

const baseline = await readBaseline();
if (!baseline) {
  console.error("[check-v3-token-budget] FAIL — no baseline found at scripts/_v3-token-baseline.json.");
  console.error("Run once to initialize: node scripts/check-v3-token-budget.mjs --snapshot");
  process.exit(1);
}

const baseCounts = baseline.counts || {};
const regressed = [];
const reduced = [];

for (const { name } of PATTERNS) {
  const cur = counts[name] ?? 0;
  const base = baseCounts[name] ?? 0;
  if (cur > base) regressed.push({ name, cur, base, delta: cur - base });
  else if (cur < base) reduced.push({ name, cur, base, delta: base - cur });
}

if (regressed.length === 0) {
  if (reduced.length > 0) {
    console.log(`[check-v3-token-budget] OK — counts dropped for ${reduced.length} pattern(s). Consider updating the baseline:`);
    for (const r of reduced) {
      console.log(`  ${r.name.padEnd(34)} ${r.base} -> ${r.cur} (-${r.delta})`);
    }
    console.log("Update with: node scripts/check-v3-token-budget.mjs --snapshot");
  } else {
    console.log(`[check-v3-token-budget] OK — all ${PATTERNS.length} pattern(s) at or below baseline.`);
  }
  process.exit(0);
}

console.error(`[check-v3-token-budget] FAIL — ${regressed.length} V1-alias pattern(s) regressed above baseline.`);
console.error("V3 design sweep replaced these with var(--v3-*) tokens / .v3-* classes.");
console.error("If this is intentional, update the baseline AFTER your fix lands a real cleanup.");
console.error("");
for (const r of regressed) {
  console.error(`  ${r.name.padEnd(34)} ${r.base} -> ${r.cur}  (+${r.delta} new)`);
  for (const ex of (examples[r.name] || []).slice(0, 3)) {
    console.error(`    ${ex.file}:${ex.line}  ${ex.match}`);
    console.error(`      ${ex.snippet}`);
  }
}
process.exit(1);
