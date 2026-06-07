#!/usr/bin/env node
// TrendingRepo — GSC baseline audit.
//
// Pulls the headline Search Analytics slices for sc-domain:trendingrepo.com
// over a configurable window (default 28 days) and writes the result to
// data/_geo/gsc-baseline-<YYYY-MM-DD>.json. Also dumps a one-screen console
// summary so a fresh operator can grok the state without opening the JSON.
//
// Pulled slices:
//   - headline totals (no dimensions)
//   - top 50 queries
//   - top 50 pages
//   - top 25 countries
//   - device split (desktop/mobile/tablet)
//   - search type split (web/image/news/video/discover)
//   - date-by-date trend
//   - search appearance breakdown (rich result types)
//   - almost-ranking queries (pos 5-15, impressions >=50, CTR <2%)
//   - zero-click queries (pos<=20, impressions >=20, clicks=0)
//
// Defaults to a 4-day end-date offset because GSC backfills the last 2-3 days
// asynchronously and partial-day rows make trend reads noisy.
//
// USAGE
//   node scripts/gsc-baseline.mjs
//   node scripts/gsc-baseline.mjs --days 90
//   node scripts/gsc-baseline.mjs --site sc-domain:aiso.tools
//   node scripts/gsc-baseline.mjs --skip-write    (print to stdout only)

import fs from "node:fs/promises";
import path from "node:path";

import { searchAnalyticsQuery } from "./gsc-client.mjs";

const DEFAULT_SITE = "sc-domain:trendingrepo.com";
const DEFAULT_WINDOW_DAYS = 28;
const END_DATE_LAG_DAYS = 3; // GSC trails reality ~2-3 days; pad 1 for safety
const OUT_DIR = "data/_geo";

function parseArgs(argv) {
  const out = { site: DEFAULT_SITE, days: DEFAULT_WINDOW_DAYS, skipWrite: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--site") out.site = argv[i + 1];
    else if (a === "--days") out.days = Number(argv[i + 1]);
    else if (a === "--skip-write") out.skipWrite = true;
  }
  return out;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function windowDates(days) {
  const end = new Date(Date.now() - END_DATE_LAG_DAYS * 86400_000);
  const start = new Date(end.getTime() - (days - 1) * 86400_000);
  return { startDate: ymd(start), endDate: ymd(end) };
}

async function querySafe(site, body, label) {
  try {
    const r = await searchAnalyticsQuery(site, body);
    return r.rows || [];
  } catch (err) {
    console.warn(`[${label}] query failed: ${err.message}`);
    return [];
  }
}

function pct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function pad(s, n, right = false) {
  const str = String(s);
  if (str.length >= n) return str;
  const padding = " ".repeat(n - str.length);
  return right ? str + padding : padding + str;
}

async function main() {
  const args = parseArgs(process.argv);
  const { startDate, endDate } = windowDates(args.days);
  const now = new Date().toISOString();
  console.log(`════════ GSC baseline ${args.site} (${startDate} → ${endDate}) ════════`);

  // Parallelise all the slice fetches — they're independent.
  const dims = (arr) => ({ dimensions: arr });
  const range = { startDate, endDate };

  const [
    headlineRows,
    queryRows,
    pageRows,
    countryRows,
    deviceRows,
    dateRows,
    appearanceRows,
    almostRows,
  ] = await Promise.all([
    querySafe(args.site, { ...range, ...dims([]) }, "headline"),
    querySafe(args.site, { ...range, ...dims(["query"]), rowLimit: 50 }, "queries"),
    querySafe(args.site, { ...range, ...dims(["page"]), rowLimit: 50 }, "pages"),
    querySafe(args.site, { ...range, ...dims(["country"]), rowLimit: 25 }, "countries"),
    querySafe(args.site, { ...range, ...dims(["device"]) }, "devices"),
    querySafe(args.site, { ...range, ...dims(["date"]) }, "trend"),
    querySafe(args.site, { ...range, ...dims(["searchAppearance"]) }, "search-appearance"),
    querySafe(args.site, { ...range, ...dims(["query"]), rowLimit: 1000 }, "almost-ranking"),
  ]);

  // Search type split — separate calls, one per type.
  const searchTypes = ["web", "image", "news", "video", "discover"];
  const searchTypeRows = await Promise.all(
    searchTypes.map((type) =>
      querySafe(args.site, { ...range, ...dims([]), type }, `type:${type}`).then(
        (rows) => ({ type, row: rows[0] ?? null }),
      ),
    ),
  );

  const headline = headlineRows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  // Almost-ranking + zero-click subsets — same source data, different filters.
  const almostRanking = almostRows
    .filter((r) => r.impressions >= 50 && r.position >= 5 && r.position <= 15 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
  const zeroClick = almostRows
    .filter((r) => r.clicks === 0 && r.impressions >= 20 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  const payload = {
    generatedAt: now,
    site: args.site,
    windowDays: args.days,
    range: { startDate, endDate },
    headline,
    queries: queryRows,
    pages: pageRows,
    countries: countryRows,
    devices: deviceRows,
    trend: dateRows,
    searchAppearance: appearanceRows,
    searchTypeSplit: searchTypeRows,
    almostRanking,
    zeroClick,
  };

  // --- Console summary ---
  console.log("\n── HEADLINE ──");
  console.log(`  clicks      : ${fmt(headline.clicks)}`);
  console.log(`  impressions : ${fmt(headline.impressions)}`);
  console.log(`  CTR         : ${pct(headline.ctr)}`);
  console.log(`  avg pos     : ${(headline.position).toFixed(1)}`);

  console.log("\n── SEARCH TYPE SPLIT ──");
  for (const { type, row } of searchTypeRows) {
    const r = row ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    console.log(
      `  ${pad(type, 8, true)} clicks=${pad(fmt(r.clicks), 5)} impr=${pad(fmt(r.impressions), 7)} ctr=${pad(pct(r.ctr || 0), 7)} pos=${pad((r.position || 0).toFixed(1), 5)}`,
    );
  }

  console.log("\n── DEVICE SPLIT ──");
  for (const r of deviceRows) {
    console.log(
      `  ${pad(r.keys[0], 8, true)} clicks=${pad(fmt(r.clicks), 5)} impr=${pad(fmt(r.impressions), 7)} ctr=${pad(pct(r.ctr), 7)} pos=${pad(r.position.toFixed(1), 5)}`,
    );
  }

  console.log("\n── TOP 15 QUERIES ──");
  for (const r of queryRows.slice(0, 15)) {
    console.log(
      `  ${pad(fmt(r.clicks), 4)} ${pad(fmt(r.impressions), 6)} ${pad(pct(r.ctr), 6)} ${pad(r.position.toFixed(1), 5)}  ${r.keys[0].slice(0, 60)}`,
    );
  }

  console.log("\n── TOP 15 PAGES ──");
  for (const r of pageRows.slice(0, 15)) {
    const url = r.keys[0].replace(/^https?:\/\/[^/]+/, "") || "/";
    console.log(
      `  ${pad(fmt(r.clicks), 4)} ${pad(fmt(r.impressions), 6)} ${pad(pct(r.ctr), 6)} ${pad(r.position.toFixed(1), 5)}  ${url.slice(0, 70)}`,
    );
  }

  console.log("\n── TOP 10 COUNTRIES ──");
  for (const r of countryRows.slice(0, 10)) {
    console.log(
      `  ${pad(r.keys[0], 4, true)} clicks=${pad(fmt(r.clicks), 5)} impr=${pad(fmt(r.impressions), 7)} ctr=${pad(pct(r.ctr), 7)}`,
    );
  }

  console.log(`\n── ALMOST-RANKING (pos 5-15, impr>=50, ctr<2%) — ${almostRanking.length} ──`);
  for (const r of almostRanking.slice(0, 15)) {
    console.log(
      `  impr=${pad(fmt(r.impressions), 5)} pos=${pad(r.position.toFixed(1), 5)} ctr=${pad(pct(r.ctr), 6)}  ${r.keys[0].slice(0, 60)}`,
    );
  }

  console.log(`\n── ZERO-CLICK (clicks=0, pos<=20, impr>=20) — ${zeroClick.length} ──`);
  for (const r of zeroClick.slice(0, 15)) {
    console.log(`  impr=${pad(fmt(r.impressions), 5)} pos=${pad(r.position.toFixed(1), 5)}  ${r.keys[0].slice(0, 65)}`);
  }

  if (args.skipWrite) {
    console.log("\n(--skip-write — not persisting)");
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const datedPath = path.join(OUT_DIR, `gsc-baseline-${ymd(new Date())}.json`);
  const latestPath = path.join(OUT_DIR, "gsc-baseline-latest.json");
  await fs.writeFile(datedPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(latestPath, JSON.stringify(payload, null, 2));
  console.log(`\n→ wrote ${datedPath}`);
  console.log(`→ wrote ${latestPath}`);
}

main().catch((err) => {
  console.error(`gsc-baseline failed: ${err.message}`);
  process.exit(1);
});
