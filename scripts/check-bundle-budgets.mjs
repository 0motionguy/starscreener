#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const appManifestPath = resolve(root, ".next", "app-build-manifest.json");
const buildManifestPath = resolve(root, ".next", "build-manifest.json");
const budgetPath = resolve(root, "bundle-budgets.json");
const growthRatio = Number(process.env.BUNDLE_BUDGET_GROWTH_RATIO ?? "1.10");

const args = new Set(process.argv.slice(2));
const snapshotMode = args.has("--snapshot");

function fail(message) {
  console.error(`[bundle-budgets] FAIL ${message}`);
  process.exit(1);
}

function readJson(path) {
  if (!existsSync(path)) {
    fail(`required manifest missing: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`invalid JSON at ${path}: ${message}`);
  }
}

function normalizeRoute(pageKey) {
  if (pageKey === "/page") return "/";
  if (!pageKey.endsWith("/page")) return null;
  return pageKey.slice(0, -5) || "/";
}

function toFileSizeMap(appManifest, buildManifest) {
  const pages = appManifest?.pages;
  if (!pages || typeof pages !== "object") {
    fail("app-build-manifest.json missing pages object");
  }

  const rootMainFiles = Array.isArray(buildManifest?.rootMainFiles)
    ? buildManifest.rootMainFiles
    : [];

  const routeToBytes = new Map();

  for (const [pageKey, files] of Object.entries(pages)) {
    const route = normalizeRoute(pageKey);
    if (!route) continue;

    const candidates = new Set([...(Array.isArray(files) ? files : []), ...rootMainFiles]);
    let totalBytes = 0;

    for (const rel of candidates) {
      if (typeof rel !== "string") continue;
      if (!rel.endsWith(".js")) continue;
      if (!rel.startsWith("static/chunks/")) continue;

      const abs = resolve(root, ".next", rel);
      if (!existsSync(abs)) {
        fail(`chunk referenced by manifest not found: ${rel}`);
      }
      totalBytes += statSync(abs).size;
    }

    routeToBytes.set(route, totalBytes);
  }

  if (routeToBytes.size === 0) {
    fail("no app page routes resolved from app-build-manifest.json");
  }

  return routeToBytes;
}

function sortedObjectFromMap(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

const appManifest = readJson(appManifestPath);
const buildManifest = readJson(buildManifestPath);
const current = toFileSizeMap(appManifest, buildManifest);

if (snapshotMode) {
  const payload = {
    generatedAt: new Date().toISOString(),
    growthRatio,
    routes: sortedObjectFromMap(current),
  };
  writeFileSync(budgetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[bundle-budgets] SNAPSHOT wrote ${current.size} route baseline(s) to bundle-budgets.json`);
  process.exit(0);
}

if (!existsSync(budgetPath)) {
  fail("bundle-budgets.json missing. Generate with: node scripts/check-bundle-budgets.mjs --snapshot");
}

const budget = readJson(budgetPath);
const routes = budget?.routes;
if (!routes || typeof routes !== "object") {
  fail("bundle-budgets.json missing routes object");
}

const failures = [];
const missingBudgets = [];
for (const [route, bytes] of current.entries()) {
  const baseline = routes[route];
  if (typeof baseline !== "number" || Number.isNaN(baseline) || baseline <= 0) {
    missingBudgets.push(route);
    continue;
  }
  const limit = Math.floor(baseline * growthRatio);
  if (bytes > limit) {
    failures.push({ route, baseline, limit, bytes });
  }
}

if (missingBudgets.length > 0) {
  fail(
    `missing baseline for ${missingBudgets.length} route(s): ${missingBudgets.join(", ")}. Refresh bundle-budgets.json with --snapshot`,
  );
}

const staleBudgets = Object.keys(routes).filter((route) => !current.has(route));
if (staleBudgets.length > 0) {
  console.warn(
    `[bundle-budgets] WARN ${staleBudgets.length} stale route baseline(s) not in current build: ${staleBudgets.join(", ")}`,
  );
}

if (failures.length > 0) {
  console.error(
    `[bundle-budgets] FAIL ${failures.length} route(s) exceeded baseline * ${growthRatio.toFixed(2)}`,
  );
  for (const item of failures.sort((a, b) => b.bytes - a.bytes)) {
    const actualKb = (item.bytes / 1024).toFixed(1);
    const baseKb = (item.baseline / 1024).toFixed(1);
    const limitKb = (item.limit / 1024).toFixed(1);
    const ratio = (item.bytes / item.baseline).toFixed(2);
    console.error(
      ` - ${item.route}: actual=${actualKb}KB baseline=${baseKb}KB limit=${limitKb}KB ratio=${ratio}x`,
    );
  }
  process.exit(1);
}

console.log(
  `[bundle-budgets] OK ${current.size} route(s) within baseline * ${growthRatio.toFixed(2)}`,
);
