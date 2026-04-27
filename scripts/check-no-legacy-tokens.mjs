#!/usr/bin/env node
// Bonus CI guard #1 (audit handoff) — fail when legacy Tailwind grayscale
// tokens (text-zinc-*, bg-gray-*, border-neutral-*, etc.) appear in
// components/app code. The V2 design system uses CSS vars (var(--v2-*))
// and .v2-* classes; introducing a Tailwind grayscale escape valve causes
// visible drift from the rebrand.
//
// Run via `npm run lint:tokens`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_DIRS = [
  "src/components",
  "src/app",
];

// Skip the V2 primitives + locked-in legacy V1 surfaces that the V2 rebrand
// intentionally leaves alone. Add paths here only when there's a documented
// reason — every entry is debt to retire.
const ALLOW_PATHS = new Set([
  // (none yet)
]);

const FILE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const PATTERN = /(text|bg|border|ring|divide|placeholder|outline|caret|fill|stroke|accent|shadow|from|via|to)-(zinc|gray|neutral|slate|stone)-\d+/g;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && FILE_EXTS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      yield full;
    }
  }
}

const violations = [];

for (const sub of SCAN_DIRS) {
  for await (const file of walk(resolve(ROOT, sub))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOW_PATHS.has(rel)) continue;
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      PATTERN.lastIndex = 0;
      let m;
      while ((m = PATTERN.exec(line))) {
        violations.push({ file: rel, line: i + 1, match: m[0], snippet: line.trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`[check-no-legacy-tokens] OK — scanned ${SCAN_DIRS.join(", ")}`);
  process.exit(0);
}

console.error(
  `[check-no-legacy-tokens] FAIL — ${violations.length} legacy Tailwind grayscale token(s) found.`,
);
console.error("Use V2 tokens instead: var(--v2-bg-*), --v2-line-*, --v2-ink-*, --v2-sig-*.");
console.error("");
for (const v of violations.slice(0, 50)) {
  console.error(`  ${v.file}:${v.line}  →  ${v.match}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 50) {
  console.error(`  ... and ${violations.length - 50} more`);
}
process.exit(1);
