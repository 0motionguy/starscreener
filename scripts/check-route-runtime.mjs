#!/usr/bin/env node
// Bonus CI guard #7 (audit handoff) — fail when an API route file does
// not export `const runtime = "nodejs"` or `"edge"` explicitly. Next's
// inferred default is module-shape-dependent; making the runtime
// explicit prevents a future Edge experiment from silently downgrading
// a route that depends on Node APIs (most notably the Stripe webhook,
// where switching to Edge would break HMAC sig verification).
//
// Run via `npm run lint:runtime`. Exits 1 on any missing declaration.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

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

const RUNTIME_RE = /^export\s+const\s+runtime\s*=\s*["'](nodejs|edge)["']/m;

const violations = [];

for await (const file of walkRoutes(API_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const content = await readFile(file, "utf8");
  if (!RUNTIME_RE.test(content)) {
    violations.push(rel);
  }
}

if (violations.length === 0) {
  console.log(
    `[check-route-runtime] OK — every API route declares runtime explicitly.`,
  );
  process.exit(0);
}

console.error(
  `[check-route-runtime] FAIL — ${violations.length} route(s) missing runtime declaration.`,
);
console.error(
  'Add `export const runtime = "nodejs";` (or "edge") near the top of each file.',
);
console.error(
  "nodejs is the safe default — only switch to edge if the route never touches",
);
console.error("Node-only APIs (fs, child_process, Stripe SDK, etc.).");
console.error("");
for (const v of violations) {
  console.error(`  ${v}`);
}
process.exit(1);
