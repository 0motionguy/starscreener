#!/usr/bin/env node
// Fail if any src/lib/*.ts file that imports Node builtins, DB clients,
// or process-env secrets lacks `import "server-only"` as a top-of-file
// directive. Catches at build time the entire class of "Node-builtin
// called on client" runtime crashes (e.g. stars-by-category.ts
// shipping `resolve` from "path" into the client bundle).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Scan only src/lib — those files can be imported by client components.
// app/api/**/route.ts handlers are inherently server-only by Next.js; the
// directive is redundant there and would just be noise.
const SCAN_DIRS = ["src/lib"];

// Patterns whose presence ANYWHERE in the file imply server-only execution.
const SERVER_IMPORT_RE = /^import .* from ['"](?:node:(?:fs|path|crypto|child_process|http|https|net|os|stream|zlib|util|buffer)|fs|fs\/promises|ioredis|postgres|@supabase\/supabase-js|drizzle-orm(?:\/postgres-js)?)['"];?\s*$/m;
const SERVER_CALL_RE = /\b(readFileSync|writeFileSync|readdirSync|process\.env\.(?:GITHUB_TOKEN|CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY|REDIS_URL|UPSTASH_REDIS_REST_TOKEN|CLERK_SECRET_KEY))\b/;

const DIRECTIVE_RE = /^import\s+["']server-only["'];?\s*$/m;

// Files intentionally allowed without the directive. Document WHY.
const ALLOW_LIST = new Set([
  // Pure types / shared interfaces (no runtime side-effect on import)
  "src/lib/redis.ts", // RuntimeRedis interface only — actual client lives in callers
  // Tests run via vitest, not bundled into client
  // (any file matching __tests__ or .test. is auto-skipped below)
]);

function walk(dir, out = []) {
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const violations = [];
const scanned = SCAN_DIRS.flatMap((d) => walk(d));

for (const rel of scanned) {
  // Skip test files — they run in node, not in the client bundle
  if (rel.includes("__tests__") || rel.includes(".test.") || rel.includes("__vitest__")) continue;
  if (ALLOW_LIST.has(rel.split(path.sep).join("/"))) continue;

  const src = fs.readFileSync(path.resolve(ROOT, rel), "utf8");
  const needsDirective = SERVER_IMPORT_RE.test(src) || SERVER_CALL_RE.test(src);
  if (!needsDirective) continue;

  if (!DIRECTIVE_RE.test(src)) {
    violations.push(rel.split(path.sep).join("/"));
  }
}

if (violations.length === 0) {
  console.log(`[check-server-only-markers] OK — ${scanned.length} file(s) scanned, ${ALLOW_LIST.size} allow-listed.`);
  process.exit(0);
}

console.error(`[check-server-only-markers] FAIL — ${violations.length} file(s) missing 'import "server-only"':`);
for (const v of violations) console.error(`  - ${v}`);
console.error(``);
console.error(`Each file above imports a Node builtin / DB client / server secret but does NOT`);
console.error(`declare itself server-only. If accidentally imported by a client component, the`);
console.error(`build will succeed and Next will crash at runtime when that page is rendered`);
console.error(`(e.g. "resolve is not a function" from stars-by-category.ts on 2026-05-28).`);
console.error(``);
console.error(`Fix: add 'import "server-only";' as the first import line. If the file is`);
console.error(`genuinely isomorphic, add it to ALLOW_LIST in this script with a one-line WHY.`);
process.exit(1);
