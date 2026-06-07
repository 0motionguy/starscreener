#!/usr/bin/env node
// TrendingRepo — sitemap registration audit.
//
// Lists every sitemap currently registered under sc-domain:trendingrepo.com,
// surfaces errors + warnings + per-type counts, and flags stale (>30d
// undownloaded) submissions. Output mirrors the GSC Sitemaps panel so an
// operator can confirm the panel matches without leaving the terminal.
//
// USAGE
//   node scripts/gsc-sitemap-status.mjs
//   node scripts/gsc-sitemap-status.mjs --site sc-domain:aiso.tools

import fs from "node:fs/promises";
import path from "node:path";

import { sitemapsList } from "./gsc-client.mjs";

const DEFAULT_SITE = "sc-domain:trendingrepo.com";
const OUT_DIR = "data/_geo";
const STALE_DAYS = 30;

function parseArgs(argv) {
  const out = { site: DEFAULT_SITE };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--site") out.site = argv[i + 1];
  }
  return out;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function staleness(lastDownloaded) {
  if (!lastDownloaded) return Infinity;
  const ageMs = Date.now() - new Date(lastDownloaded).getTime();
  return ageMs / 86400_000;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date().toISOString();
  console.log(`════════ GSC sitemap status ${args.site} ════════`);

  const list = await sitemapsList(args.site);
  const sitemaps = list.sitemap || [];

  const summary = {
    total: sitemaps.length,
    withErrors: 0,
    withWarnings: 0,
    stale: 0,
    pendingFirstDownload: 0,
    totalSubmittedUrls: 0,
  };

  const enriched = sitemaps.map((sm) => {
    const errors = Number(sm.errors || 0);
    const warnings = Number(sm.warnings || 0);
    const submittedWeb = Number(
      (sm.contents || []).find((c) => c.type === "web")?.submitted || 0,
    );
    const indexedWeb = Number(
      (sm.contents || []).find((c) => c.type === "web")?.indexed || 0,
    );
    const ageDays = staleness(sm.lastDownloaded);
    if (errors > 0) summary.withErrors += 1;
    if (warnings > 0) summary.withWarnings += 1;
    if (!sm.lastDownloaded) summary.pendingFirstDownload += 1;
    else if (ageDays > STALE_DAYS) summary.stale += 1;
    summary.totalSubmittedUrls += submittedWeb;
    return {
      path: sm.path,
      submitted: sm.lastSubmitted || null,
      downloaded: sm.lastDownloaded || null,
      ageDays: Number.isFinite(ageDays) ? Math.round(ageDays * 10) / 10 : null,
      pending: !!sm.isPending,
      sitemapsIndex: !!sm.isSitemapsIndex,
      type: sm.type || null,
      errors,
      warnings,
      contents: sm.contents || [],
      submittedWeb,
      indexedWeb,
    };
  });

  console.log(`\n  total registered: ${summary.total}`);
  console.log(`  with errors     : ${summary.withErrors}`);
  console.log(`  with warnings   : ${summary.withWarnings}`);
  console.log(`  stale (>${STALE_DAYS}d)    : ${summary.stale}`);
  console.log(`  pending first DL: ${summary.pendingFirstDownload}`);
  console.log(`  total submitted : ${summary.totalSubmittedUrls} URLs`);

  console.log("\n── PER-SITEMAP ──");
  for (const sm of enriched) {
    const marker =
      sm.errors > 0 ? "✗" : sm.warnings > 0 ? "!" : sm.ageDays && sm.ageDays > STALE_DAYS ? "·" : "✓";
    const age = sm.ageDays == null ? "never" : `${sm.ageDays}d`;
    console.log(`  ${marker} ${sm.path}`);
    console.log(
      `      type=${sm.type || "?"} submitted=${sm.submittedWeb} indexed=${sm.indexedWeb} errors=${sm.errors} warnings=${sm.warnings} downloaded=${age}`,
    );
    if (sm.errors > 0 || sm.warnings > 0) {
      console.log(`      ⚠ Open GSC → Sitemaps → ${sm.path} for the error/warning list`);
    }
  }

  const payload = {
    generatedAt: now,
    site: args.site,
    summary,
    sitemaps: enriched,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const datedPath = path.join(OUT_DIR, `gsc-sitemap-${ymd(new Date())}.json`);
  const latestPath = path.join(OUT_DIR, "gsc-sitemap-latest.json");
  await fs.writeFile(datedPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(latestPath, JSON.stringify(payload, null, 2));
  console.log(`\n→ wrote ${datedPath}`);
  console.log(`→ wrote ${latestPath}`);
}

main().catch((err) => {
  console.error(`gsc-sitemap-status failed: ${err.message}`);
  process.exit(1);
});
