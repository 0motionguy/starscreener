#!/usr/bin/env node
// Design-system enforcement on the shell (Sidebar, Topbar, Statusbar,
// Brand mark + name, Freshness pill, etc.).
//
// Why this lint exists (2026-05-31): the wordmark grew 14 → 18 → 22px
// in 4 JSX commits within 90 minutes because the size lived in inline
// JSX `style={{ fontSize: ... }}` rather than the shell.css token
// ladder. Every "make it bigger" became a render cycle + deploy.
// shell.css is the single source of truth; per docs/DESIGN-SYSTEM.md.
//
// Bans in src/components/shell/**:
//   - inline `style={{ ... }}` (use CSS classes / tokens instead)
//   - hardcoded fontSize / color values (use var(--*) tokens)
//   - direct hex / rgb() in style strings (use var(--*) tokens)
//
// Existing violations are allow-listed with a TODO comment so the lint
// catches NEW patterns while documenting debt.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHELL_DIR = "src/components/shell";

// Files allow-listed as PRE-D.7 debt — they ship today with inline
// styles that should migrate to public/shell.css tokens. The lint
// preserves the current state while catching NEW shell files that
// violate the design-system contract from day one.
//
// To retire an entry: move the inline styles to shell.css + remove
// the file from this set + re-run `npm run lint:shell-ds`.
const ALLOW_FILES = new Set([
  "src/components/shell/Sidebar.tsx",
  "src/components/shell/Topbar.tsx",
  // Status/Ticker/FreshnessPill/NavLink/TopbarAuthChip currently clean
  // — keep out of allow-list so any new inline style there fails.
]);

// JSX inline-style — `style={{ ... }}`
const INLINE_STYLE_RE = /style=\{\{[^}]+\}\}/g;
// Hardcoded font-size value (numeric px, not var)
const HARDCODED_FONTSIZE_RE = /fontSize\s*:\s*["']?\d/g;
// Hex / rgb color literal in JSX style
const HARDCODED_COLOR_RE = /color\s*:\s*["'](#|rgb\()/g;

function walk(dir, out = []) {
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.match(/\.(ts|tsx|jsx|js)$/)) out.push(full);
  }
  return out;
}

const files = walk(SHELL_DIR);
const violations = [];

for (const rel of files) {
  const norm = rel.split(path.sep).join("/");
  if (norm.includes("__tests__") || norm.includes(".test.")) continue;
  if (ALLOW_FILES.has(norm)) continue;
  const src = fs.readFileSync(path.resolve(ROOT, rel), "utf8");

  const flag = (lineNum, snippet, label) => {
    violations.push({ file: norm, line: lineNum, label, snippet: snippet.slice(0, 100) });
  };

  for (const m of src.matchAll(INLINE_STYLE_RE)) {
    const lineNum = src.slice(0, m.index).split("\n").length;
    flag(lineNum, m[0], "inline style — move to shell.css");
  }
  for (const m of src.matchAll(HARDCODED_FONTSIZE_RE)) {
    const lineNum = src.slice(0, m.index).split("\n").length;
    const line = src.split("\n")[lineNum - 1] || "";
    flag(lineNum, line.trim(), "hardcoded fontSize — use var(--brand-*-size) token");
  }
  for (const m of src.matchAll(HARDCODED_COLOR_RE)) {
    const lineNum = src.slice(0, m.index).split("\n").length;
    flag(lineNum, src.split("\n")[lineNum - 1].trim(), "hex/rgb color — use var(--accent / --fg-*) token");
  }
}

if (violations.length === 0) {
  console.log(`[check-shell-design-system] OK — ${files.length} shell file(s) scanned, ${ALLOW_FILES.size} allow-listed (debt).`);
  process.exit(0);
}

console.error(`[check-shell-design-system] FAIL — ${violations.length} violation(s) in src/components/shell/**:`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.label}]  ${v.snippet}`);
}
console.error(``);
console.error(`Shell is the brand chrome — every visible diff there must go through`);
console.error(`shell.css tokens (see docs/DESIGN-SYSTEM.md and the --brand-name-size`);
console.error(`token added in D.7). Either:`);
console.error(`  1. Move the inline style to public/shell.css with a token`);
console.error(`  2. Add to ALLOW in this script with a one-line debt note + WHY`);
process.exit(1);
