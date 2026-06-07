#!/usr/bin/env node
// TrendingRepo — pretty-print the latest GSC baseline JSON.
//
// Reads data/_geo/gsc-baseline-latest.json (and optionally gsc-indexing-latest
// + gsc-sitemap-latest) and emits the same one-screen summary that
// gsc-baseline.mjs prints on a fresh run, plus a delta against the previous
// week's snapshot if one is available. No GSC API calls — runs entirely
// against committed JSON, so it works offline and without ADC/SA setup.
//
// USAGE
//   node scripts/gsc-report.mjs
//   node scripts/gsc-report.mjs --json    (raw dump)
//   node scripts/gsc-report.mjs --indexing  (also print indexing report)

import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "data/_geo";

function parseArgs(argv) {
  const out = { json: false, includeIndexing: false, includeSitemap: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--indexing") out.includeIndexing = true;
    else if (a === "--sitemap") out.includeSitemap = true;
  }
  return out;
}

async function readJsonSafe(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}
function pct(n) {
  return `${(n * 100).toFixed(2)}%`;
}
function pad(s, n, right = false) {
  const str = String(s);
  if (str.length >= n) return str;
  return right ? str + " ".repeat(n - str.length) : " ".repeat(n - str.length) + str;
}

async function findPrevious(latestPath) {
  // Find the most recent dated file OTHER than latest. Used for w/w delta.
  try {
    const files = await fs.readdir(OUT_DIR);
    const dated = files
      .filter((f) => f.startsWith("gsc-baseline-") && f.endsWith(".json") && f !== "gsc-baseline-latest.json")
      .sort();
    if (dated.length === 0) return null;
    // Read the latest's generatedAt so we don't pick "today" as previous
    const latest = await readJsonSafe(latestPath);
    if (!latest) return null;
    const latestDay = (latest.generatedAt || "").slice(0, 10);
    const prev = dated
      .filter((f) => !f.includes(latestDay))
      .pop();
    if (!prev) return null;
    return readJsonSafe(path.join(OUT_DIR, prev));
  } catch {
    return null;
  }
}

function delta(curr, prev) {
  if (curr == null || prev == null) return "—";
  const d = curr - prev;
  if (d === 0) return "·";
  return d > 0 ? `+${fmt(d)}` : `${fmt(d)}`;
}

async function printBaseline(args) {
  const latest = await readJsonSafe(path.join(OUT_DIR, "gsc-baseline-latest.json"));
  if (!latest) {
    console.log("No data/_geo/gsc-baseline-latest.json — run `npm run gsc:baseline` first.");
    return;
  }
  if (args.json) {
    console.log(JSON.stringify(latest, null, 2));
    return;
  }

  const previous = await findPrevious(path.join(OUT_DIR, "gsc-baseline-latest.json"));

  console.log(`════════ GSC baseline — ${latest.site} ════════`);
  console.log(`  generated : ${latest.generatedAt}`);
  console.log(`  window    : ${latest.range.startDate} → ${latest.range.endDate} (${latest.windowDays}d)`);
  if (previous) {
    console.log(`  previous  : ${previous.generatedAt} (${previous.range.startDate} → ${previous.range.endDate})`);
  }

  const h = latest.headline;
  console.log("\n── HEADLINE ──");
  if (previous) {
    const p = previous.headline;
    console.log(`  clicks      : ${fmt(h.clicks)}      (Δ ${delta(h.clicks, p.clicks)})`);
    console.log(`  impressions : ${fmt(h.impressions)}    (Δ ${delta(h.impressions, p.impressions)})`);
    console.log(`  CTR         : ${pct(h.ctr)}         (Δ ${((h.ctr - p.ctr) * 100).toFixed(2)}pp)`);
    console.log(`  avg pos     : ${h.position.toFixed(1)}        (Δ ${(h.position - p.position).toFixed(1)})`);
  } else {
    console.log(`  clicks      : ${fmt(h.clicks)}`);
    console.log(`  impressions : ${fmt(h.impressions)}`);
    console.log(`  CTR         : ${pct(h.ctr)}`);
    console.log(`  avg pos     : ${h.position.toFixed(1)}`);
  }

  console.log("\n── TOP 15 QUERIES ──");
  for (const r of (latest.queries || []).slice(0, 15)) {
    console.log(
      `  ${pad(fmt(r.clicks), 4)} ${pad(fmt(r.impressions), 6)} ${pad(pct(r.ctr), 6)} ${pad(r.position.toFixed(1), 5)}  ${r.keys[0].slice(0, 60)}`,
    );
  }

  console.log("\n── TOP 15 PAGES ──");
  for (const r of (latest.pages || []).slice(0, 15)) {
    const url = r.keys[0].replace(/^https?:\/\/[^/]+/, "") || "/";
    console.log(
      `  ${pad(fmt(r.clicks), 4)} ${pad(fmt(r.impressions), 6)} ${pad(pct(r.ctr), 6)} ${pad(r.position.toFixed(1), 5)}  ${url.slice(0, 70)}`,
    );
  }

  console.log(`\n── ALMOST-RANKING (top 10) ──`);
  for (const r of (latest.almostRanking || []).slice(0, 10)) {
    console.log(
      `  impr=${pad(fmt(r.impressions), 5)} pos=${pad(r.position.toFixed(1), 5)} ctr=${pad(pct(r.ctr), 6)}  ${r.keys[0].slice(0, 60)}`,
    );
  }
}

async function printIndexing() {
  const latest = await readJsonSafe(path.join(OUT_DIR, "gsc-indexing-latest.json"));
  if (!latest) {
    console.log("\n(no data/_geo/gsc-indexing-latest.json — run `npm run gsc:indexing-audit` to populate)");
    return;
  }
  console.log("\n════════ INDEXING AUDIT ════════");
  console.log(`  generated : ${latest.generatedAt}`);
  console.log(`  inspected : ${latest.totalInspected}`);
  console.log(`  indexed rate: ${(latest.indexedRate * 100).toFixed(1)}%`);
  console.log("\n  buckets:");
  for (const [b, c] of Object.entries(latest.bucketCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${b.padEnd(28)} ${String(c).padStart(4)}`);
  }
  console.log("\n  by prefix:");
  for (const [prefix, g] of Object.entries(latest.byPrefix).sort((a, b) => b[1].total - a[1].total)) {
    const rate = ((g.indexed / g.total) * 100).toFixed(0);
    console.log(`    ${prefix.padEnd(20)} ${g.indexed}/${g.total} (${rate}%)`);
  }
}

async function printSitemap() {
  const latest = await readJsonSafe(path.join(OUT_DIR, "gsc-sitemap-latest.json"));
  if (!latest) {
    console.log("\n(no data/_geo/gsc-sitemap-latest.json — run `npm run gsc:sitemap` to populate)");
    return;
  }
  console.log("\n════════ SITEMAP STATUS ════════");
  console.log(`  generated : ${latest.generatedAt}`);
  const s = latest.summary;
  console.log(`  total=${s.total} errors=${s.withErrors} warnings=${s.withWarnings} stale=${s.stale} submitted=${s.totalSubmittedUrls}`);
  for (const sm of latest.sitemaps) {
    const marker = sm.errors > 0 ? "✗" : sm.warnings > 0 ? "!" : "✓";
    console.log(`  ${marker} ${sm.path} (errors=${sm.errors} warnings=${sm.warnings} submitted=${sm.submittedWeb})`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await printBaseline(args);
  if (args.includeIndexing) await printIndexing();
  if (args.includeSitemap) await printSitemap();
}

main().catch((err) => {
  console.error(`gsc-report failed: ${err.message}`);
  process.exit(1);
});
