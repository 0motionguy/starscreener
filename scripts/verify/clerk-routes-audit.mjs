#!/usr/bin/env node
/**
 * Clerk publishable-routes audit (spec 001-v6-prod-cutover, FR-014 first sentence).
 *
 * Reads src/middleware.ts, extracts the Clerk `isProtectedRoute` pattern
 * list, and compares against a committed snapshot at
 * .perf/clerk-pre-cutover-public-routes.json. The post-cutover protected
 * set MUST be a subset of the pre-cutover protected set — i.e., NO route
 * that was public pre-cutover may be gated post-cutover.
 *
 * Modes:
 *   --snapshot   Write the current middleware's protected-route list to
 *                .perf/clerk-pre-cutover-public-routes.json (use ONCE
 *                pre-cutover to capture baseline).
 *   default      Assert current middleware ⊆ committed snapshot.
 *
 * Exit codes:
 *   0  — pass (no new gates) OR snapshot written
 *   1  — at least one route became newly gated post-cutover
 *   2  — snapshot missing in default mode
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const MIDDLEWARE_PATH = join(REPO_ROOT, "src", "middleware.ts");
const SNAPSHOT_PATH = join(
  REPO_ROOT,
  ".perf",
  "clerk-pre-cutover-public-routes.json",
);

const middlewareSrc = readFileSync(MIDDLEWARE_PATH, "utf8");
const currentProtected = extractMatcherPatterns(
  middlewareSrc,
  "isProtectedRoute",
);

if (process.argv.includes("--snapshot")) {
  writeFileSync(
    SNAPSHOT_PATH,
    `${JSON.stringify({ protectedRoutes: currentProtected, capturedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(
    `Snapshot written to ${SNAPSHOT_PATH} — ${currentProtected.length} protected patterns captured.`,
  );
  process.exit(0);
}

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(
    `ERROR: snapshot missing at ${SNAPSHOT_PATH}. Run --snapshot once pre-cutover to capture baseline.`,
  );
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
const baseline = new Set(snapshot.protectedRoutes);
const newlyGated = currentProtected.filter((r) => !baseline.has(r));

if (newlyGated.length === 0) {
  console.log(
    `Clerk publishable-routes audit OK — protected set unchanged or relaxed (${currentProtected.length} patterns).`,
  );
  process.exit(0);
}

console.error(
  `Clerk publishable-routes audit FAILED — ${newlyGated.length} new gated patterns:`,
);
for (const r of newlyGated) console.error(`  + ${r}`);
console.error(
  `\nA pattern in the current middleware is NOT in the pre-cutover snapshot. If this is intentional, regenerate the snapshot with --snapshot AFTER operator review.`,
);
process.exit(1);

function extractMatcherPatterns(source, matcherName) {
  const re = new RegExp(
    `${matcherName}\\s*=\\s*createRouteMatcher\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`,
    "m",
  );
  const match = re.exec(source);
  if (!match) {
    console.error(
      `ERROR: could not locate ${matcherName} = createRouteMatcher([...]) in ${MIDDLEWARE_PATH}`,
    );
    process.exit(2);
  }
  return [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)]
    .map((m) => m[1])
    .sort();
}
