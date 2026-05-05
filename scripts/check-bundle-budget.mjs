#!/usr/bin/env node
// Bundle-size budget guard (Wave 4 / AGN-803) — fail CI when a route's
// First Load JS exceeds its budget. Prevents silent client-bundle bloat
// from creeping into hot landing pages (home, /signals, etc.).
//
// When to run:
//   AFTER `npm run build`. Reads `.next/app-build-manifest.json` +
//   `.next/build-manifest.json` to derive each route's chunk graph,
//   then sums file sizes from `.next/static`. If `.next` does not
//   exist, the guard exits 0 with a warning (don't fail CI before
//   the build has run).
//
// How to update budgets:
//   Edit the BUDGETS object at the top of this file. Sizes are bytes.
//   Bump only after a deliberate decision — every kB on the home
//   route is a kB of TTI on a cold mobile connection.
//
// Run via `npm run bundle:check`. Exits 1 on any budget regression.

import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NEXT_DIR = resolve(ROOT, ".next");
const APP_MANIFEST = resolve(NEXT_DIR, "app-build-manifest.json");
const BUILD_MANIFEST = resolve(NEXT_DIR, "build-manifest.json");

// Per-route First Load JS budgets, in bytes. Add a key per route as
// needed; anything not listed falls back to DEFAULT.
const BUDGETS = {
  "/": 350_000, // 350 KB First Load JS — home with bubble map dynamic
  "/signals": 250_000, // streaming signals page
  "/githubrepo": 200_000,
  "/trends": 100_000, // index aggregator
  DEFAULT: 250_000, // any other route
};

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

// Map an app-build-manifest key (e.g. "/page", "/signals/page",
// "/githubrepo/[owner]/[repo]/page") to the public route the user
// visits ("/", "/signals", "/githubrepo/[owner]/[repo]").
function manifestKeyToRoute(key) {
  // Drop the trailing "/page" or "/route" segment; keep "/" for the
  // root which is just "/page".
  let route = key.replace(/\/(page|route)$/, "");
  if (route === "") route = "/";
  return route;
}

function pickBudget(route) {
  if (route in BUDGETS) return BUDGETS[route];
  return BUDGETS.DEFAULT;
}

async function chunkSize(chunkPath) {
  // Manifest chunk paths are relative to .next (e.g. "static/chunks/abc.js").
  const abs = resolve(NEXT_DIR, chunkPath);
  try {
    const s = await stat(abs);
    return s.size;
  } catch {
    return 0;
  }
}

async function main() {
  if (!(await fileExists(NEXT_DIR))) {
    console.warn(
      "[check-bundle-budget] WARN — .next not found. Run `npm run build` first. Skipping (exit 0).",
    );
    process.exit(0);
  }
  if (!(await fileExists(APP_MANIFEST))) {
    console.warn(
      "[check-bundle-budget] WARN — .next/app-build-manifest.json not found. Skipping (exit 0).",
    );
    process.exit(0);
  }

  const appManifest = await readJson(APP_MANIFEST);
  const buildManifest = (await fileExists(BUILD_MANIFEST))
    ? await readJson(BUILD_MANIFEST)
    : {};

  const pages = appManifest.pages || {};
  // rootMainFiles is the shared baseline every app-router page loads
  // before its own chunks (framework + main + polyfills). Counting it
  // toward First Load JS matches Next's own build output table.
  const rootMain = Array.isArray(buildManifest.rootMainFiles)
    ? buildManifest.rootMainFiles
    : [];

  const keys = Object.keys(pages);
  if (keys.length === 0) {
    console.warn(
      "[check-bundle-budget] WARN — app-build-manifest.json has zero pages (likely a dev-server stub, not a production build). Skipping (exit 0).",
    );
    process.exit(0);
  }

  const results = [];
  for (const key of keys) {
    const route = manifestKeyToRoute(key);
    const chunks = new Set([...(pages[key] || []), ...rootMain]);
    let total = 0;
    for (const chunk of chunks) {
      total += await chunkSize(chunk);
    }
    const budget = pickBudget(route);
    results.push({ route, total, budget, pass: total <= budget });
  }

  results.sort((a, b) => a.route.localeCompare(b.route));

  const fails = results.filter((r) => !r.pass);

  const fmtKB = (n) => `${(n / 1024).toFixed(1)} KB`;
  const widest = Math.max(...results.map((r) => r.route.length), 10);

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(
      `[check-bundle-budget] ${status}  ${r.route.padEnd(widest)}  ${fmtKB(r.total).padStart(10)}  / budget ${fmtKB(r.budget)}`,
    );
  }

  if (fails.length === 0) {
    console.log(
      `[check-bundle-budget] OK — ${results.length} route(s) within budget.`,
    );
    process.exit(0);
  }

  console.error("");
  console.error(
    `[check-bundle-budget] FAIL — ${fails.length}/${results.length} route(s) over budget.`,
  );
  console.error(
    "Either trim the route's client bundle (dynamic import, code-split, drop deps),",
  );
  console.error(
    "or — if the increase is intentional and reviewed — bump the BUDGETS entry in",
  );
  console.error("scripts/check-bundle-budget.mjs.");
  process.exit(1);
}

await main();
