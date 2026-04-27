#!/usr/bin/env node
// Bonus CI guard #2 (audit handoff) — fail when an API route handler echoes
// `err.message` directly back into a NextResponse body. This pattern leaks
// stack-shape internal text to clients and was swept across 6 routes during
// the APP-03 audit closure (commit c7f9e4b). Catch the next regression at
// PR time, point fixers at `src/lib/api/error-response.ts:serverError`.
//
// Run via `npm run lint:err-message`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

// The body-shape patterns we want to catch: an object property that
// directly assigns err.message into a response payload.
//   - { error: err.message ... }
//   - { message: err.message ... }
//   - { detail: e.message ... }
// A bare `err.message` occurrence (e.g. console.error logging) is fine —
// only response-body shapes matter.
const PATTERN = /[\{,]\s*\w+\s*:\s*err(?:or)?\.message\b/g;

// Files that legitimately surface err.message to the response (e.g. the
// shared error helper itself, dev-only routes, etc.). Every entry should
// be commented with a reason.
const ALLOW_PATHS = new Set([
  "src/lib/api/error-response.ts", // the canonical helper itself
]);

async function* walkRoutes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRoutes(full);
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full;
    }
  }
}

const violations = [];

for await (const file of walkRoutes(API_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOW_PATHS.has(rel)) continue;
  const content = await readFile(file, "utf8");

  PATTERN.lastIndex = 0;
  let m;
  while ((m = PATTERN.exec(content))) {
    // Map char offset → line number for a useful cite.
    const upto = content.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    const lineText = content.split("\n")[lineNo - 1].trim();
    violations.push({ file: rel, line: lineNo, snippet: lineText });
  }
}

if (violations.length === 0) {
  console.log(`[check-no-err-message-echoes] OK — scanned src/app/api/**/route.ts`);
  process.exit(0);
}

console.error(
  `[check-no-err-message-echoes] FAIL — ${violations.length} route handler(s) echo err.message.`,
);
console.error(
  "Use serverError(err, { scope: \"[<route>]\" }) from src/lib/api/error-response.ts instead.",
);
console.error("");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
process.exit(1);
