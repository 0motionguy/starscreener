#!/usr/bin/env node
// lighthouse-routes — run Lighthouse against every route in perf/routes.json.
//
// Usage:
//   node scripts/lighthouse-routes.mjs [--base-url=<url>] [--only=/foo,/bar]
//                                      [--out-dir=<dir>] [--prod] [--summary-only]
//
// Defaults:
//   base URL: http://localhost:3023 (use --prod for https://trendingrepo.com)
//   out dir: docs/audits/lighthouse/<timestamp>/
//   one .json report per route + summary.md
//
// Requires:
//   - lighthouse@13 (already in devDeps)
//   - Chrome installed (chrome-launcher finds it automatically)
//   - The base URL must be serving the routes (run `npm run build && npm run start` first
//     for prod-like local audit; or `npm run dev` for dev-mode audit)
//
// Exit codes:
//   0  all routes scored under target thresholds
//   1  one or more routes failed thresholds
//   2  configuration or runtime error

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

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
const baseUrl = args.prod
  ? "https://trendingrepo.com"
  : (args["base-url"] ?? "http://localhost:3023");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = args["out-dir"] ?? resolve(projectRoot, "docs/audits/lighthouse", stamp);
const onlyFilter = args.only ? new Set(String(args.only).split(",").map((s) => s.trim())) : null;
const summaryOnly = Boolean(args["summary-only"]);

// Thresholds — match Lighthouse's "good" bands. These are aspirational for
// production, conservative for local dev (dev mode disables many optimizations
// so Lighthouse always scores lower locally).
const THRESHOLDS = {
  performance: 80,
  accessibility: 90,
  "best-practices": 90,
  seo: 90,
};

// ---------------------------------------------------------------------------
// Route list
// ---------------------------------------------------------------------------

const routesPath = resolve(projectRoot, "perf/routes.json");
const routesConfig = JSON.parse(readFileSync(routesPath, "utf8"));
const routes = routesConfig.routes
  .filter((r) => r.warmupOnDeploy !== false)
  .map((r) => r.route)
  .filter((route) => !onlyFilter || onlyFilter.has(route));

if (routes.length === 0) {
  console.error("[lighthouse-routes] no routes matched filter");
  process.exit(2);
}

console.log(`[lighthouse-routes] base=${baseUrl} routes=${routes.length} out=${outDir}`);
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Run lighthouse per route
// ---------------------------------------------------------------------------

const results = [];

function safeFileName(route) {
  return route.replace(/^\//, "").replace(/[\/?&=]/g, "_") || "home";
}

async function runOne(route) {
  return new Promise((resolveP) => {
    const url = `${baseUrl}${route}`;
    const fileSlug = safeFileName(route);
    const outFile = resolve(outDir, `${fileSlug}.json`);

    const lhArgs = [
      "lighthouse",
      url,
      "--output=json",
      `--output-path=${outFile}`,
      "--chrome-flags=--headless --no-sandbox --disable-gpu",
      "--only-categories=performance,accessibility,best-practices,seo",
      "--quiet",
      // Use mobile by default — that's where perf hurts.
      "--preset=desktop",
    ];

    const t0 = Date.now();
    const child = spawn("npx", lhArgs, { cwd: projectRoot, shell: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      const elapsed = Date.now() - t0;
      if (code !== 0) {
        console.error(`[lighthouse-routes] ${route} FAILED in ${elapsed}ms: ${stderr.slice(0, 200)}`);
        results.push({ route, ok: false, elapsed, scores: null, error: stderr.slice(0, 400) });
        resolveP();
        return;
      }
      try {
        const report = JSON.parse(readFileSync(outFile, "utf8"));
        const scores = {
          performance: Math.round((report.categories.performance?.score ?? 0) * 100),
          accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
          "best-practices": Math.round((report.categories["best-practices"]?.score ?? 0) * 100),
          seo: Math.round((report.categories.seo?.score ?? 0) * 100),
        };
        const failures = [];
        for (const [cat, threshold] of Object.entries(THRESHOLDS)) {
          if (scores[cat] < threshold) failures.push(`${cat}:${scores[cat]}<${threshold}`);
        }
        results.push({ route, ok: failures.length === 0, elapsed, scores, failures });
        const status = failures.length === 0 ? "PASS" : `FAIL ${failures.join(",")}`;
        console.log(
          `${route.padEnd(36)} P:${scores.performance} A:${scores.accessibility} B:${scores["best-practices"]} S:${scores.seo} ${status} (${(elapsed/1000).toFixed(1)}s)`,
        );
      } catch (err) {
        console.error(`[lighthouse-routes] ${route} parse failure:`, err.message);
        results.push({ route, ok: false, elapsed, scores: null, error: err.message });
      }
      resolveP();
    });
  });
}

console.log("ROUTE                                P    A    B    S    STATUS");
for (const route of routes) {
  // Run serial — running parallel would saturate the dev server and skew scores.
  // 24 routes × ~30s = ~12 minutes.
  await runOne(route);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n=== ${passed}/${results.length} routes pass thresholds ===`);

const summaryLines = [
  `# Lighthouse run ${stamp}`,
  "",
  `Base URL: \`${baseUrl}\``,
  `Thresholds: ${Object.entries(THRESHOLDS).map(([k, v]) => `${k}≥${v}`).join(", ")}`,
  "",
  "| Route | Perf | A11y | Best-Pr | SEO | Status |",
  "|---|---|---|---|---|---|",
];
for (const r of results) {
  const s = r.scores ?? { performance: 0, accessibility: 0, "best-practices": 0, seo: 0 };
  const status = r.ok ? "PASS" : (r.error ? `ERR: ${r.error.slice(0, 80)}` : `FAIL ${r.failures.join(", ")}`);
  summaryLines.push(`| ${r.route} | ${s.performance} | ${s.accessibility} | ${s["best-practices"]} | ${s.seo} | ${status} |`);
}
const summaryPath = resolve(outDir, "summary.md");
writeFileSync(summaryPath, summaryLines.join("\n"), "utf8");
console.log(`Summary: ${summaryPath}`);

if (summaryOnly) process.exit(failed === 0 ? 0 : 1);
process.exit(failed === 0 ? 0 : 1);
