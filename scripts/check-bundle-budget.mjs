#!/usr/bin/env node
// Bundle-size budget guard (AGN-833) — fail when a route's first-load JS
// regresses above its baseline by more than the allowed grace.
//
// Reads `.next/app-build-manifest.json` (Next.js App Router) which maps
// every page route to the list of JS chunks it loads on first paint. We
// resolve each chunk to its on-disk size in `.next/static/`, sum the
// unique chunks per route, and compare against
// `scripts/_bundle-budget-baseline.json`.
//
// Why not size-limit?
//   The repo already uses Node-native scripts for every other CI guard
//   (lint:tokens, lint:v3-budget, lint:err-envelope, ...). Adding the
//   `size-limit` toolchain just for this would be a second package + a
//   second config format for the same job. The baseline-JSON pattern in
//   _v3-token-baseline.json is the house style — this script follows it.
//
// Usage:
//   npm run build                                  # required first
//   node scripts/check-bundle-budget.mjs           # check
//   node scripts/check-bundle-budget.mjs --snapshot   # write baseline
//   BUNDLE_BUDGET_SNAPSHOT=1 node ...                  # same, via env
//
// Exit codes:
//   0 — within budget (or snapshot written, or .next missing in a way
//       that's safe to skip — e.g. no build was run; we never block CI
//       for a missing build, the build job itself catches that)
//   1 — at least one route regressed above baseline + grace, or baseline
//       is missing on a non-snapshot run.
//
// Wire via npm run lint:bundle-budget. The CI workflow runs this AFTER
// `npm run build` so .next/ exists.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NEXT_DIR = resolve(ROOT, ".next");
const APP_MANIFEST = resolve(NEXT_DIR, "app-build-manifest.json");
const PAGES_MANIFEST = resolve(NEXT_DIR, "build-manifest.json");
const STATIC_DIR = resolve(NEXT_DIR, "static");
const BASELINE_PATH = resolve(__dirname, "_bundle-budget-baseline.json");

// Allow a small grace so that hash churn / minor codegen jitter doesn't
// fail PRs that didn't actually change the route. 5% or 5 KB, whichever
// is larger, per route. Tighten as the bundles stabilize.
const GRACE_PCT = 0.05;
const GRACE_MIN_BYTES = 5 * 1024;

// Routes we deliberately do not budget — RSC-only/route-handlers or
// dynamic image-generation endpoints that don't ship client JS in a
// meaningful way. The app-build-manifest already excludes pure /route
// entries, so this is mostly for completeness.
const SKIP_ROUTE_PREFIXES = ["/api/"];

const isSnapshot =
  process.argv.includes("--snapshot") ||
  process.env.BUNDLE_BUDGET_SNAPSHOT === "1";

async function readJSON(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function fileSize(path) {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return 0;
  }
}

// Sum the on-disk size of a list of chunk paths declared by Next.js.
// Paths in the manifest are relative to `.next/` (e.g.
// "static/chunks/main-app-abc.js"). We dedupe within a route — the same
// chunk listed twice should not count twice.
async function chunksTotal(chunkPaths) {
  const unique = Array.from(new Set(chunkPaths));
  let total = 0;
  const missing = [];
  for (const rel of unique) {
    const abs = resolve(NEXT_DIR, rel);
    const size = await fileSize(abs);
    if (size === 0) missing.push(rel);
    total += size;
  }
  return { total, missing };
}

function shouldSkipRoute(route) {
  return SKIP_ROUTE_PREFIXES.some((p) => route.startsWith(p));
}

// Build the {route -> sizeBytes} map from the app-build-manifest.
async function computeRouteSizes() {
  if (!existsSync(NEXT_DIR)) {
    return { sizes: {}, reason: "no-next-dir" };
  }
  if (!existsSync(APP_MANIFEST)) {
    return { sizes: {}, reason: "no-app-manifest" };
  }
  const manifest = await readJSON(APP_MANIFEST);
  const pages = manifest.pages || {};
  const sizes = {};
  for (const [route, chunks] of Object.entries(pages)) {
    if (!Array.isArray(chunks) || chunks.length === 0) continue;
    if (shouldSkipRoute(route)) continue;
    const { total } = await chunksTotal(chunks);
    sizes[route] = total;
  }
  return { sizes, reason: null };
}

async function readBaseline() {
  try {
    return await readJSON(BASELINE_PATH);
  } catch {
    return null;
  }
}

async function writeBaseline(sizes) {
  const sorted = Object.fromEntries(
    Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)),
  );
  const payload = {
    _comment:
      "Bundle-size budget baseline (AGN-833). Per-route first-load JS in BYTES, " +
      "summed from .next/app-build-manifest.json. Guard fails when any route " +
      "exceeds baseline + max(5%, 5 KB). Regenerate after an intentional " +
      "increase or a real reduction with: node scripts/check-bundle-budget.mjs --snapshot",
    grace: { pct: GRACE_PCT, minBytes: GRACE_MIN_BYTES },
    generatedAt: new Date().toISOString(),
    sizes: sorted,
  };
  await writeFile(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function allowedCeiling(base) {
  return base + Math.max(GRACE_MIN_BYTES, Math.floor(base * GRACE_PCT));
}

const { sizes, reason } = await computeRouteSizes();

if (reason === "no-next-dir" || reason === "no-app-manifest") {
  // Don't fail CI for a missing build — the build job itself is the
  // authority on "did the build run". This script is a budget guard,
  // not a build presence check.
  console.warn(
    `[check-bundle-budget] SKIP — ${
      reason === "no-next-dir"
        ? ".next/ not found"
        : "app-build-manifest.json not found"
    }. Run \`npm run build\` first.`,
  );
  process.exit(0);
}

if (Object.keys(sizes).length === 0) {
  console.warn(
    "[check-bundle-budget] SKIP — no app-router routes with client chunks " +
      "found in app-build-manifest. Build may be empty or pages-only.",
  );
  process.exit(0);
}

if (isSnapshot) {
  await writeBaseline(sizes);
  const total = Object.keys(sizes).length;
  console.log(
    `[check-bundle-budget] OK — wrote baseline for ${total} route(s) to scripts/_bundle-budget-baseline.json`,
  );
  // Print the 10 largest so the diff is visible at snapshot time.
  const top = Object.entries(sizes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  for (const [route, size] of top) {
    console.log(`  ${route.padEnd(50)} ${fmtKB(size)}`);
  }
  process.exit(0);
}

const baseline = await readBaseline();
if (!baseline) {
  console.error(
    "[check-bundle-budget] FAIL — no baseline at scripts/_bundle-budget-baseline.json.",
  );
  console.error(
    "Initialize: npm run build && node scripts/check-bundle-budget.mjs --snapshot",
  );
  process.exit(1);
}

const baseSizes = baseline.sizes || {};
const regressed = [];
const reduced = [];
const newRoutes = [];
const removedRoutes = [];

for (const [route, cur] of Object.entries(sizes)) {
  if (!(route in baseSizes)) {
    newRoutes.push({ route, cur });
    continue;
  }
  const base = baseSizes[route];
  const ceiling = allowedCeiling(base);
  if (cur > ceiling) {
    regressed.push({ route, base, cur, ceiling, delta: cur - base });
  } else if (cur < base) {
    reduced.push({ route, base, cur, delta: base - cur });
  }
}

for (const route of Object.keys(baseSizes)) {
  if (!(route in sizes)) removedRoutes.push(route);
}

if (regressed.length === 0) {
  console.log(
    `[check-bundle-budget] OK — ${Object.keys(sizes).length} route(s) within budget (grace: ${(GRACE_PCT * 100).toFixed(0)}% or ${fmtKB(GRACE_MIN_BYTES)}).`,
  );
  if (newRoutes.length > 0) {
    console.log(
      `  ${newRoutes.length} new route(s) without a baseline entry — they will be added on the next snapshot:`,
    );
    for (const { route, cur } of newRoutes.slice(0, 10)) {
      console.log(`    ${route.padEnd(50)} ${fmtKB(cur)}`);
    }
  }
  if (reduced.length > 0) {
    const totalSaved = reduced.reduce((s, r) => s + r.delta, 0);
    console.log(
      `  ${reduced.length} route(s) shrank by ${fmtKB(totalSaved)} total. Consider snapshotting to lock in the win:`,
    );
    for (const r of reduced.slice(0, 5)) {
      console.log(
        `    ${r.route.padEnd(50)} ${fmtKB(r.base)} -> ${fmtKB(r.cur)}  (-${fmtKB(r.delta)})`,
      );
    }
    console.log(
      "  Update with: node scripts/check-bundle-budget.mjs --snapshot",
    );
  }
  if (removedRoutes.length > 0) {
    console.log(
      `  ${removedRoutes.length} route(s) in baseline no longer in build — snapshot to clean up:`,
    );
    for (const r of removedRoutes.slice(0, 10)) {
      console.log(`    ${r}`);
    }
  }
  process.exit(0);
}

console.error(
  `[check-bundle-budget] FAIL — ${regressed.length} route(s) exceed baseline + grace (max(${(GRACE_PCT * 100).toFixed(0)}%, ${fmtKB(GRACE_MIN_BYTES)})).`,
);
console.error(
  "If the increase is intentional, update the baseline AFTER the change lands:",
);
console.error("  node scripts/check-bundle-budget.mjs --snapshot");
console.error("");
for (const r of regressed.sort((a, b) => b.delta - a.delta)) {
  console.error(
    `  ${r.route.padEnd(50)} ${fmtKB(r.base)} -> ${fmtKB(r.cur)}  (+${fmtKB(r.delta)}, ceiling ${fmtKB(r.ceiling)})`,
  );
}
process.exit(1);
