#!/usr/bin/env node
// Bonus CI guard #2 (audit handoff) - fail when an API route handler echoes
// `err.message` directly or indirectly back into a NextResponse body.
// This pattern leaks stack-shape internal text to clients.
//
// Run via `npm run lint:err-message`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

// 1) Direct echo: { error: err.message }
const DIRECT_PATTERN = /[\{,]\s*\w+\s*:\s*err(?:or)?\.message\b/g;

// 2) Alias flow: const message = err instanceof Error ? err.message : String(err)
//                ... { error: message }
const ALIAS_DECL_PATTERN =
  /const\s+([A-Za-z_]\w*)\s*=\s*err(?:or)?\s+instanceof\s+Error\s*\?\s*err(?:or)?\.message\s*:\s*String\([^\)]*\)\s*;/g;

const ALLOW_PATHS = new Set([
  "src/lib/api/error-response.ts", // canonical helper itself
]);

// AGN-493 scope: unauth routes from docs/forensic/08-SCALE-HARDENING-AUDIT.md
const TARGET_ROUTES = new Set([
  "src/app/api/funding/events/route.ts",
  "src/app/api/funding/sectors/route.ts",
  "src/app/api/openapi.json/route.ts",
  "src/app/api/pipeline/featured/route.ts",
  "src/app/api/pipeline/meta-counts/route.ts",
  "src/app/api/pipeline/refresh/route.ts",
  "src/app/api/pipeline/sidebar-data/route.ts",
  "src/app/api/pipeline/status/route.ts",
  "src/app/api/predict/calibration/route.ts",
  "src/app/api/submissions/revenue/route.ts",
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
  if (!TARGET_ROUTES.has(rel)) continue;
  const content = await readFile(file, "utf8");

  // Direct pattern
  DIRECT_PATTERN.lastIndex = 0;
  let m;
  while ((m = DIRECT_PATTERN.exec(content))) {
    const upto = content.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    const lineText = content.split("\n")[lineNo - 1].trim();
    violations.push({ file: rel, line: lineNo, snippet: lineText });
  }

  // Alias flow inside catch blocks only.
  const catchBlocks = content.matchAll(/catch\s*\(\s*err(?:or)?\s*\)\s*\{[\s\S]*?\n\}/g);
  for (const block of catchBlocks) {
    const blockText = block[0];
    const blockOffset = block.index ?? 0;

    ALIAS_DECL_PATTERN.lastIndex = 0;
    let aliasDecl;
    while ((aliasDecl = ALIAS_DECL_PATTERN.exec(blockText))) {
      const alias = aliasDecl[1];
      const echoPattern = new RegExp(`[\\{,]\\s*\\w+\\s*:\\s*${alias}\\b`, "g");
      if (!echoPattern.test(blockText)) continue;

      const absoluteIndex = blockOffset + aliasDecl.index;
      const upto = content.slice(0, absoluteIndex);
      const lineNo = upto.split("\n").length;
      const lineText = content.split("\n")[lineNo - 1].trim();
      violations.push({
        file: rel,
        line: lineNo,
        snippet: `${lineText}  // alias '${alias}' echoed in response body`,
      });
    }
  }
}

if (violations.length === 0) {
  console.log("[check-no-err-message-echoes] OK - scanned src/app/api/**/route.ts");
  process.exit(0);
}

console.error(
  `[check-no-err-message-echoes] FAIL - ${violations.length} route handler(s) echo err.message.`,
);
console.error(
  'Use serverError(err, { scope: "[<route>]" }) from src/lib/api/error-response.ts instead.',
);
console.error("");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
process.exit(1);
