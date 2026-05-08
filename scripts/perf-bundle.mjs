#!/usr/bin/env node
// perf-bundle — parse .next/app-build-manifest.json after `next build`,
// flag routes over their first-load JS budget, surface the largest chunks,
// and detect forbidden imports (echarts in non-chart routes, posthog-js
// anywhere, large data/*.json blobs in client chunks).
//
// Usage:
//   node scripts/perf-bundle.mjs [--routes=<path>] [--json] [--out=<path>]
//                                [--strict] [--top=<N>]
//
// Defaults:
//   routes config: perf/routes.json
//   .next/app-build-manifest.json must exist (run `next build` first).
//
// Exit codes:
//   0  no violations
//   1  any route over budget OR forbidden import detected
//   2  configuration / runtime error (no .next build, missing manifest, etc.)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[3] === undefined ? true : m[3];
  }
  return out;
}

const args = parseArgs(process.argv);
const routesPath = resolve(args.routes ?? "perf/routes.json");
const wantJson = Boolean(args.json);
const outPath = args.out;
const strict = Boolean(args.strict);
const topN = Number.parseInt(args.top ?? "10", 10);

const NEXT_DIR = resolve(".next");
const APP_MANIFEST = join(NEXT_DIR, "app-build-manifest.json");
const BUILD_MANIFEST = join(NEXT_DIR, "build-manifest.json");

if (!existsSync(APP_MANIFEST)) {
  console.error(
    `error: ${APP_MANIFEST} not found. Run \`npm run build\` first.`,
  );
  process.exit(2);
}

let routesConfig;
try {
  routesConfig = JSON.parse(readFileSync(routesPath, "utf8"));
} catch (err) {
  console.error(`error: cannot read ${routesPath}: ${err.message}`);
  process.exit(2);
}

const defaults = routesConfig.globalDefaults ?? {};
const defaultBudget = defaults.firstLoadJsBudgetKb ?? 900;
const routeBudgets = new Map();
for (const r of routesConfig.routes ?? []) {
  routeBudgets.set(r.route, r.firstLoadJsBudgetKb ?? defaultBudget);
}

// Forbidden import config — lives inline; can be promoted to a separate
// file if it grows. Each entry: pattern (regex), allowedRoutes (array of
// route templates that may import it), description.
const FORBIDDEN = [
  {
    name: "echarts",
    pattern: /(echarts\/(lib|core)|zrender\/lib)/,
    allowedRoutePrefixes: [
      "/signals",
      "/compare",
      "/repo/", // detail page renders RepoDetailChart eagerly
      "/funding",
      "/consensus",
      "/model-usage",
      "/news",
      "/tools/star-history",
      "/tools/treemap",
      "/mcp/", // MCP detail uses sparkline
    ],
    description: "ECharts/zrender chunk landing on a route not allowlisted",
  },
  {
    name: "posthog-js",
    pattern: /(["'`])posthog-js\1|posthog-js\/dist/,
    allowedRoutePrefixes: [],
    description:
      "posthog-js eagerly imported (must be dynamic-loaded after first paint / on interaction)",
  },
  {
    name: "static-data-blob",
    pattern:
      /data\/(arxiv-recent|hackernews-repo-mentions|bluesky-mentions|lobsters-mentions|producthunt-launches|collection-rankings|devto-recent)/,
    allowedRoutePrefixes: [],
    description:
      "Static JSON data file leaked into a client chunk via a server-only lib import path",
  },
];

const appManifest = JSON.parse(readFileSync(APP_MANIFEST, "utf8"));
const buildManifest = existsSync(BUILD_MANIFEST)
  ? JSON.parse(readFileSync(BUILD_MANIFEST, "utf8"))
  : null;

// Chunk → size cache (raw bytes from disk)
const chunkSizeCache = new Map();
function chunkSize(relPath) {
  if (chunkSizeCache.has(relPath)) return chunkSizeCache.get(relPath);
  let size = 0;
  if (relPath.endsWith(".js")) {
    const p = join(NEXT_DIR, relPath);
    try {
      size = gzipSync(readFileSync(p)).length;
    } catch {
      size = 0;
    }
  }
  chunkSizeCache.set(relPath, size);
  return size;
}

// Read source of a chunk (gzip-decoded if needed). For forbidden-import
// scanning we read raw text; webpack output for client chunks is JS source
// (no gzip on disk).
const chunkSourceCache = new Map();
function chunkSource(relPath) {
  if (chunkSourceCache.has(relPath)) return chunkSourceCache.get(relPath);
  const p = join(NEXT_DIR, relPath);
  let src = "";
  try {
    src = readFileSync(p, "utf8");
  } catch {
    src = "";
  }
  chunkSourceCache.set(relPath, src);
  return src;
}

// Normalize app-build-manifest "pages" keys to our route-template form.
// In Next 15 App Router, keys look like:
//   "/page", "/signals/page", "/repo/[owner]/[name]/page", "/api/...".
// We strip the trailing "/page" so the key matches perf/routes.json route
// templates ("/", "/signals", "/repo/[owner]/[name]").
function normalizeKey(key) {
  if (key === "/page") return "/";
  if (key.endsWith("/page")) return key.slice(0, -"/page".length);
  if (key === "/layout") return "__layout__";
  return key;
}

const appPages = appManifest.pages ?? {};
const manifestRoutes = new Map();
for (const rawKey of Object.keys(appPages)) {
  if (rawKey === "/layout") continue;
  const normalized = normalizeKey(rawKey);
  if (normalized === "__layout__") continue;
  manifestRoutes.set(normalized, rawKey);
}

function manifestRouteForConfiguredRoute(route) {
  const pathOnly = route.split("?")[0];
  if (pathOnly.startsWith("/api/")) return null;
  if (manifestRoutes.has(pathOnly)) return pathOnly;

  const parts = pathOnly.split("/").filter(Boolean);
  if (parts[0] === "repo" && parts.length === 3) {
    return "/repo/[owner]/[name]";
  }
  return pathOnly;
}

// Build per-route totals. Completeness lives in check-routes-config; this gate
// only enforces routes explicitly listed in perf/routes.json.
const routeTotals = [];
const rootChunks = new Set();
if (buildManifest?.rootMainFiles) {
  for (const f of buildManifest.rootMainFiles) rootChunks.add(f);
}
const layoutChunks = appPages["/layout"] ?? [];
for (const c of layoutChunks) rootChunks.add(c);

const violations = [];
const skippedRoutes = [];

for (const config of routesConfig.routes ?? []) {
  const route = config.route;
  const manifestRoute = manifestRouteForConfiguredRoute(route);
  if (!manifestRoute) {
    skippedRoutes.push({ route, reason: "non-page route" });
    continue;
  }

  const rawKey = manifestRoutes.get(manifestRoute);
  if (!rawKey) {
    violations.push({
      kind: "missing_manifest_route",
      route,
      manifestRoute,
    });
    continue;
  }
  const chunks = appPages[rawKey] ?? [];

  // First-load JS = layout chunks ∪ route-specific chunks
  const allChunks = new Set(
    [...layoutChunks, ...chunks].filter((c) => c.endsWith(".js")),
  );
  let totalBytes = 0;
  const chunkBreakdown = [];
  for (const c of allChunks) {
    const sz = chunkSize(c);
    totalBytes += sz;
    chunkBreakdown.push({ chunk: c, bytes: sz });
  }
  chunkBreakdown.sort((a, b) => b.bytes - a.bytes);

  const totalKb = Math.round(totalBytes / 1024);
  const budget = config.firstLoadJsBudgetKb ?? routeBudgets.get(route) ?? defaultBudget;
  const overBudget = totalKb > budget;
  if (overBudget) {
    violations.push({
      kind: "budget_exceeded",
      route,
      totalKb,
      budget,
      overBy: totalKb - budget,
    });
  }

  // Forbidden-import scan
  const routeForbidden = [];
  for (const { name, pattern, allowedRoutePrefixes, description } of FORBIDDEN) {
    const allowed = allowedRoutePrefixes.some(
      (p) =>
        route === p ||
        route.startsWith(p) ||
        manifestRoute === p ||
        manifestRoute.startsWith(p) ||
        (p.endsWith("/") && route.startsWith(p)),
    );
    if (allowed) continue;
    for (const c of allChunks) {
      const src = chunkSource(c);
      if (pattern.test(src)) {
        routeForbidden.push({ chunk: c, name, description });
        violations.push({
          kind: "forbidden_import",
          route,
          chunk: c,
          name,
          description,
        });
        break; // one hit per (route, name) is enough for the report
      }
    }
  }

  routeTotals.push({
    route,
    manifestRoute,
    totalKb,
    budget,
    overBy: overBudget ? totalKb - budget : 0,
    overBudget,
    chunks: chunkBreakdown,
    forbidden: routeForbidden,
  });
}

routeTotals.sort((a, b) => b.totalKb - a.totalKb);

// Largest chunks across all routes (deduped)
const allChunkSizes = new Map();
for (const r of routeTotals) {
  for (const c of r.chunks) {
    if (!allChunkSizes.has(c.chunk)) allChunkSizes.set(c.chunk, c.bytes);
  }
}
const largestChunks = [...allChunkSizes.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN)
  .map(([chunk, bytes]) => ({ chunk, kb: Math.round(bytes / 1024) }));

const summary = {
  runAt: new Date().toISOString(),
  routes: routeTotals.length,
  skippedRoutes,
  violations: violations.length,
  byKind: {
    budget_exceeded: violations.filter((v) => v.kind === "budget_exceeded").length,
    forbidden_import: violations.filter((v) => v.kind === "forbidden_import").length,
  },
  defaultBudgetKb: defaultBudget,
  routeTotals,
  largestChunks,
};

if (outPath) writeFileSync(outPath, JSON.stringify(summary, null, 2));

if (wantJson) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
} else {
  function pad(s, n) {
    s = String(s ?? "");
    return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
  }
  function color(label, code) {
    if (process.env.NO_COLOR || !process.stdout.isTTY) return label;
    return `\x1b[${code}m${label}\x1b[0m`;
  }

  console.log(color("\n=== Route first-load JS ===", 1));
  console.log(pad("ROUTE", 38), pad("GZIP JS", 8), pad("BUDGET", 8), "STATUS");
  for (const r of routeTotals) {
    const status = r.overBudget
      ? color(`OVER by ${r.overBy}kb`, 31)
      : color("ok", 32);
    const forbid = r.forbidden.length
      ? " " + color(`forbidden:${r.forbidden.map((f) => f.name).join(",")}`, 31)
      : "";
    console.log(pad(r.route, 38), pad(`${r.totalKb}kb`, 8), pad(`${r.budget}kb`, 8), status + forbid);
  }

  console.log(color(`\n=== Top ${topN} chunks ===`, 1));
  for (const { chunk, kb } of largestChunks) {
    console.log(pad(`${kb}kb`, 8), chunk);
  }

  if (violations.length > 0) {
    console.log(color("\n=== Violations ===", 1));
    for (const v of violations) {
      if (v.kind === "budget_exceeded") {
        console.log(
          color("BUDGET", 31),
          v.route,
          `${v.totalKb}kb > ${v.budget}kb (over by ${v.overBy}kb)`,
        );
      } else if (v.kind === "forbidden_import") {
        console.log(
          color("FORBIDDEN", 31),
          v.route,
          `${v.name} in ${v.chunk} — ${v.description}`,
        );
      } else if (v.kind === "missing_manifest_route") {
        console.log(
          color("MISSING", 31),
          v.route,
          `manifest route ${v.manifestRoute} was not found`,
        );
      }
    }
  }

  console.error(
    `\n${routeTotals.length} configured page routes / ${skippedRoutes.length} skipped / ${violations.length} violations / ${largestChunks.length} largest chunks shown`,
  );
}

const exitCode = violations.length === 0 ? 0 : strict ? 1 : 1;
process.exit(exitCode);
