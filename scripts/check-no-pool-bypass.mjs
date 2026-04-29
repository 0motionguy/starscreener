#!/usr/bin/env node
// CI guard — fail when GitHub API calls bypass the token pool.
//
// The pool (src/lib/github-token-pool.ts) holds N PATs and rotates by
// remaining-quota. Every call that grabs `process.env.GITHUB_TOKEN` directly
// or instantiates Octokit/fetch outside the pool burns quota outside the
// pool's accounting and defeats the rotation. Two recent ones:
//   - src/app/api/admin/stats/route.ts (admin dashboard)
//   - src/lib/github-compare.ts (compare page, 7 endpoints/request)
// were silently single-tokening the on-demand surface.
//
// Allowed surfaces (exemptions):
//   - The pool itself.
//   - `src/lib/github-fetch.ts` — the pool-aware helper everyone else uses.
//   - The pipeline adapter — pulls from the pool internally.
//   - The pool tests.
//   - Any file containing the literal escape comment `// pool-bypass: <reason>`
//     ON THE SAME LINE as the offending pattern. Use sparingly.
//
// Run via `npm run lint:bypass`. Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Scope the scan to runtime app code. CLI scripts (scripts/, bin/, cli/) are
// run separately on a developer machine or in GitHub Actions with their own
// PAT — they're not competing with the production pool's quota lane, and
// requiring them to import the pool would force every one-off dev script to
// pull in the whole singleton tree. If a script becomes part of the runtime
// (e.g., via Vercel cron), move it into src/ where this guard applies.
const SCAN_DIRS = ["src"];

// Files that are allowed to reference these patterns (pool internals + the
// shimmed helper). Paths are repo-relative, posix-style.
const ALLOW_FILES = new Set([
  "src/lib/github-token-pool.ts",
  "src/lib/github-fetch.ts",
  "src/lib/__tests__/github-token-pool.test.ts",
  // Adapter holds an Octokit-shape internally but pulls tokens from the pool.
  "src/lib/pipeline/adapters/github-adapter.ts",
  // Backfill helpers branch on token: empty string → use pool.
  "src/lib/pipeline/ingestion/stargazer-backfill.ts",
  "src/lib/pipeline/ingestion/events-backfill.ts",
  // Backfill API routes pass empty string to the helpers above to activate
  // the pool path; they reference GITHUB_TOKEN only in error messages now.
  "src/app/api/pipeline/rebuild/route.ts",
  "src/app/api/pipeline/backfill-history/route.ts",
  // social-adapters.ts builds the search URL as a literal string but pulls
  // tokens from the pool a few lines below — confirmed via reading the
  // file. Once `githubFetch` covers POST/search the helper can replace it.
  "src/lib/pipeline/adapters/social-adapters.ts",
]);

const ALLOW_DIR_PREFIXES = [
  ".claude/",
  "node_modules/",
  ".next/",
  "tests/",
];

const FILE_EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"]);

// Patterns that indicate a direct GitHub API call outside the pool.
//   1. `process.env.GITHUB_TOKEN`               — single-PAT escape hatch
//   2. `api.github.com`                          — raw URL string
//   3. `new Octokit(`                            — direct Octokit instantiation
const PATTERNS = [
  { name: "process.env.GITHUB_TOKEN", re: /process\.env\.GITHUB_TOKEN/g },
  { name: "api.github.com", re: /api\.github\.com/g },
  { name: "new Octokit(", re: /new\s+Octokit\s*\(/g },
];

// Per-line opt-out marker. Use only when there's a documented reason and the
// reviewer is OK with the single-PAT path. Example:
//   const token = process.env.GITHUB_TOKEN; // pool-bypass: dev-script log only
const ESCAPE_COMMENT = /\/\/\s*pool-bypass:/;

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
    } else if (entry.isFile() && FILE_EXTS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      yield full;
    }
  }
}

const violations = [];

for (const sub of SCAN_DIRS) {
  for await (const file of walk(resolve(ROOT, sub))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOW_FILES.has(rel)) continue;
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ESCAPE_COMMENT.test(line)) continue;
      for (const { name, re } of PATTERNS) {
        re.lastIndex = 0;
        if (re.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            pattern: name,
            snippet: line.trim(),
          });
          break;
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[check-no-pool-bypass] OK — scanned ${SCAN_DIRS.join(", ")} for pool bypass patterns.`,
  );
  process.exit(0);
}

console.error(
  `[check-no-pool-bypass] FAIL — ${violations.length} GitHub call(s) bypassing the token pool.`,
);
console.error(
  "Route GitHub calls through `githubFetch()` from src/lib/github-fetch.ts,",
);
console.error(
  'or annotate the line with `// pool-bypass: <reason>` if there\'s a documented',
);
console.error(
  "exception (e.g., a one-off dev script that intentionally skips the pool).",
);
console.error("");
for (const v of violations.slice(0, 80)) {
  console.error(`  ${v.file}:${v.line}  →  ${v.pattern}`);
  console.error(`    ${v.snippet}`);
}
if (violations.length > 80) {
  console.error(`  ... and ${violations.length - 80} more`);
}
process.exit(1);
