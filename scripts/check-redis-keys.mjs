#!/usr/bin/env node
// CI guard — fail when Redis keys are constructed inline instead of via
// the typed registry at src/lib/redis/keys.ts.
//
// Single source of truth: every key string flowing into a Redis client
// MUST come from a builder in `keys.<group>.<name>(...)`. Inline literals
// like `redis.get("ss:data:v1:" + slug)` or template-literal keys make
// renaming/grepping a search-and-replace hazard, which the registry
// exists to eliminate.
//
// What this guard catches: a string-literal first arg (single, double, or
// backtick) on `<ident>.<method>("ss:..."|"pool:..."|"ratelimit:..."|
// "recovery:...")` invocations of common Redis commands.
//
// Allowed surfaces (exemptions):
//   - The registry itself (src/lib/redis/keys.ts).
//   - The data-store core (src/lib/data-store.ts) — owns the
//     payloadKey/metaKey delegation.
//   - The worker registry (apps/trendingrepo-worker/src/lib/redis-keys.ts).
//   - The worker data-store core
//     (apps/trendingrepo-worker/src/lib/redis.ts) — owns writeDataStore /
//     readDataStore for the same ss:data:v1 / ss:meta:v1 namespaces.
//   - Tests under __tests__ — they assert on raw key shapes by design.
//
// Run via `npm run lint:redis-keys` (also wired into `npm run lint:guards`).
// Exits 1 on any violation; 0 if clean.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["src", "apps/trendingrepo-worker/src", "scripts"];
const FILE_EXTS = new Set([".ts", ".tsx", ".mjs", ".js"]);

const ALLOW_FILES = new Set([
  "src/lib/redis/keys.ts",
  "src/lib/data-store.ts",
  // Worker package mirror (Phase 4 part 2). The worker keeps its keys
  // file flat as `lib/redis-keys.ts` (sibling to `lib/redis.ts`) since
  // the protect-files PreToolUse hook gates the main app's path.
  "apps/trendingrepo-worker/src/lib/redis-keys.ts",
  "apps/trendingrepo-worker/src/lib/redis.ts",
  // Scripts-side data-store core (Phase 4 part 3). Owns the same
  // ss:data:v1 / ss:meta:v1 namespaces in plain ESM for collectors that
  // run as `node` (not tsx). Exports the typed `keys` shim that other
  // scripts/*.mjs files import.
  "scripts/_data-store-write.mjs",
  // Self-referential exemption: this guard's own doc-comment includes
  // a `redis.get("ss:data:v1:" + slug)` example string that would
  // self-flag once `scripts/` is in SCAN_DIRS.
  "scripts/check-redis-keys.mjs",
]);

const ALLOW_DIR_PREFIXES = [
  ".claude/",
  "node_modules/",
  ".next/",
  "tests/",
];

// Path segment markers that flag a file as test-only (allowed).
const TEST_PATH_MARKERS = [
  "/__tests__/",
  ".test.ts",
  ".test.tsx",
  ".test.mjs",
  ".test.js",
];

// Redis-ish methods we care about. Anchors on a word-boundary identifier
// so we don't trip on `someObject.set("...")` for non-Redis contexts; we
// further filter on key prefix.
const METHODS =
  "get|set|del|incr|expire|setex|hincrby|hset|hget|hgetall|sadd|srem|smembers|" +
  "zrange|zadd|zrem|zincrby|exists|mget|mset|xadd|xread|xlen|xrange|xrevrange";

// First arg starts with a known Redis namespace prefix. `tr:` is the
// worker-only liveness-probe namespace (see worker redis-keys.ts).
const NAMESPACES = "ss|pool|ratelimit|recovery|tr";

const PATTERN = new RegExp(
  String.raw`\b\w+\s*\.\s*(?:${METHODS})\s*\(\s*(['"\`])(${NAMESPACES}):`,
  "g",
);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (ALLOW_DIR_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (
      entry.isFile() &&
      FILE_EXTS.has(entry.name.slice(entry.name.lastIndexOf(".")))
    ) {
      yield full;
    }
  }
}

const violations = [];

for (const sub of SCAN_DIRS) {
  for await (const file of walk(resolve(ROOT, sub))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOW_FILES.has(rel)) continue;
    if (TEST_PATH_MARKERS.some((m) => rel.includes(m))) continue;
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      PATTERN.lastIndex = 0;
      const m = PATTERN.exec(line);
      if (m) {
        violations.push({ file: rel, line: i + 1, snippet: line.trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[check-redis-keys] OK — scanned ${SCAN_DIRS.join(", ")} for inline Redis key literals.`,
  );
  process.exit(0);
}

console.error(
  `[check-redis-keys] FAIL — ${violations.length} inline Redis key literal(s).`,
);
console.error(
  "Build keys via the registry: import { keys } from '@/lib/redis/keys'.",
);
console.error("");
for (const v of violations.slice(0, 80)) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 80) {
  console.error(`  ... and ${violations.length - 80} more`);
}
process.exit(1);
