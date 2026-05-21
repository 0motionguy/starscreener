#!/usr/bin/env node
/**
 * Lighthouse baseline assertion (spec 001-v6-prod-cutover, SC-004).
 *
 * Compares .perf/lighthouse-mobile-cutover.json (this run) against
 * .perf/lighthouse-mobile-prod.json (committed baseline). Asserts:
 *   - No individual route's mobile performance score regresses more
 *     than 5 points vs baseline.
 *   - Mean mobile performance score across all baselined routes is
 *     >= baseline mean.
 *
 * Exit codes:
 *   0  — pass
 *   1  — any per-route regression > 5 points, or mean regression
 *   2  — baseline or cutover file missing / malformed
 *
 * Usage:
 *   node scripts/verify/assert-lighthouse-baseline.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const BASELINE_PATH = join(REPO_ROOT, ".perf", "lighthouse-mobile-prod.json");
const CUTOVER_PATH = join(REPO_ROOT, ".perf", "lighthouse-mobile-cutover.json");

const MAX_PER_ROUTE_REGRESS = 5;

for (const p of [BASELINE_PATH, CUTOVER_PATH]) {
  if (!existsSync(p)) {
    console.error(`ERROR: ${p} missing.`);
    if (p === BASELINE_PATH)
      console.error(
        `  Capture baseline once pre-cutover with: PAGESPEED_API_KEY=<key> DEPLOY_URL=https://trendingrepo.com npm run lighthouse:routes:prod && cp .perf/lighthouse-mobile-prod.json .perf/lighthouse-mobile-prod.json`,
      );
    process.exit(2);
  }
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const cutover = JSON.parse(readFileSync(CUTOVER_PATH, "utf8"));

const baselineByRoute = indexByRoute(baseline);
const cutoverByRoute = indexByRoute(cutover);

const regressions = [];
const baselineScores = [];
const cutoverScores = [];

for (const [route, baseScore] of Object.entries(baselineByRoute)) {
  const cutScore = cutoverByRoute[route];
  if (cutScore === undefined) {
    regressions.push({
      route,
      baseline: baseScore,
      cutover: null,
      delta: null,
      reason: "missing in cutover run",
    });
    continue;
  }
  baselineScores.push(baseScore);
  cutoverScores.push(cutScore);
  const delta = cutScore - baseScore;
  if (delta < -MAX_PER_ROUTE_REGRESS) {
    regressions.push({ route, baseline: baseScore, cutover: cutScore, delta });
  }
}

const baselineMean = mean(baselineScores);
const cutoverMean = mean(cutoverScores);
const meanRegress = cutoverMean < baselineMean;

if (regressions.length === 0 && !meanRegress) {
  console.log(
    `Lighthouse baseline OK — ${baselineScores.length} routes; mean baseline=${baselineMean.toFixed(1)} cutover=${cutoverMean.toFixed(1)}`,
  );
  process.exit(0);
}

console.error(`Lighthouse baseline FAILED.`);
if (meanRegress) {
  console.error(
    `  mean regression: baseline=${baselineMean.toFixed(1)} cutover=${cutoverMean.toFixed(1)} delta=${(cutoverMean - baselineMean).toFixed(1)}`,
  );
}
for (const r of regressions) {
  if (r.cutover === null) {
    console.error(`  ${r.route} :: ${r.reason} (baseline=${r.baseline})`);
  } else {
    console.error(
      `  ${r.route} :: regress ${r.delta.toFixed(1)} (baseline=${r.baseline} cutover=${r.cutover})`,
    );
  }
}
process.exit(1);

function indexByRoute(report) {
  const out = {};
  const rows = Array.isArray(report) ? report : (report.routes ?? report.results ?? []);
  for (const row of rows) {
    const route = row.route ?? row.url ?? row.path;
    const score =
      row.mobile?.performance ?? row.performance ?? row.scores?.mobile ?? row.score;
    if (typeof route === "string" && typeof score === "number") {
      out[route] = score;
    }
  }
  return out;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
