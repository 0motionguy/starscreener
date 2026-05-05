#!/usr/bin/env node
// CI guard: block `next/dynamic(..., { ssr: false })` inside Server Components.
// Scope: `src/app/**/*.tsx` files that do NOT declare `"use client"` at top.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP_DIR = resolve(ROOT, "src/app");

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (entry.isFile() && full.endsWith(".tsx")) {
      yield full;
    }
  }
}

function isClientComponent(source) {
  const prefix = source.slice(0, 512);
  return /^\s*["']use client["'];?/m.test(prefix);
}

const violations = [];

for await (const file of walk(APP_DIR)) {
  const source = await readFile(file, "utf8");
  if (isClientComponent(source)) continue;

  // Only flag files that import next/dynamic and pass ssr:false somewhere
  // in a dynamic() invocation options object.
  const importsDynamic = /\bfrom\s+["']next\/dynamic["']/.test(source);
  if (!importsDynamic) continue;
  const hasSsrFalseDynamic = /dynamic\s*\([\s\S]*?\{[\s\S]*?\bssr\s*:\s*false\b[\s\S]*?\}/m.test(
    source,
  );
  if (!hasSsrFalseDynamic) continue;

  violations.push(relative(ROOT, file).replaceAll("\\", "/"));
}

if (violations.length === 0) {
  console.log("[check-no-ssr-false-in-server-components] OK");
  process.exit(0);
}

console.error(
  `[check-no-ssr-false-in-server-components] FAIL - found ${violations.length} server component file(s) using dynamic(..., { ssr: false }).`,
);
console.error(
  "Move the dynamic() call into a client wrapper (`\"use client\"`) and import that wrapper from the Server Component.",
);
console.error("");
for (const rel of violations) {
  console.error(`  ${rel}`);
}
process.exit(1);

