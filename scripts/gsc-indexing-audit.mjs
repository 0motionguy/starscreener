#!/usr/bin/env node
// TrendingRepo — URL inspection audit across the answer-surface URLs.
//
// Hits the GSC URL Inspection API for every URL in the site's
// sitemap-pages.xml (plus optional sample URLs from sitemap-repos.xml) and
// buckets the results so we can track week-over-week indexing coverage of the
// GEO surfaces — the very metric that motivated this whole audit.
//
// Buckets:
//   indexed                — verdict=PASS, "Submitted and indexed"
//   crawled_not_indexed    — verdict=NEUTRAL, "Crawled - currently not indexed"
//   discovered_not_indexed — verdict=NEUTRAL, "Discovered - currently not indexed"
//   unknown_to_google      — verdict=NEUTRAL, "URL is unknown to Google"
//   excluded_by_noindex    — verdict=NEUTRAL, "Excluded by 'noindex' tag"
//   error_redirect         — anything else (404, redirect, server error)
//
// Rate-limited: URL Inspection has a ~600 calls/day quota per property and
// returns 429 under abuse. We sleep 200ms between calls to stay polite, run
// concurrency-1 by default, and accept --concurrency 3 for ad-hoc speedups.
//
// USAGE
//   node scripts/gsc-indexing-audit.mjs
//   node scripts/gsc-indexing-audit.mjs --include-repos 100  (sample 100 repos)
//   node scripts/gsc-indexing-audit.mjs --limit 50           (first 50 URLs)
//   node scripts/gsc-indexing-audit.mjs --concurrency 3

import fs from "node:fs/promises";
import path from "node:path";

import { urlInspect } from "./gsc-client.mjs";

const DEFAULT_SITE = "sc-domain:trendingrepo.com";
const DEFAULT_BASE_URL = "https://trendingrepo.com";
const OUT_DIR = "data/_geo";
const POLITE_DELAY_MS = 200;

function parseArgs(argv) {
  const out = {
    site: DEFAULT_SITE,
    baseUrl: DEFAULT_BASE_URL,
    includeRepos: 0,
    limit: 0,
    concurrency: 1,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--site") out.site = argv[i + 1];
    else if (a === "--base-url") out.baseUrl = argv[i + 1];
    else if (a === "--include-repos") out.includeRepos = Number(argv[i + 1] || 0);
    else if (a === "--limit") out.limit = Number(argv[i + 1] || 0);
    else if (a === "--concurrency") out.concurrency = Math.max(1, Number(argv[i + 1] || 1));
  }
  return out;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

const COVERAGE_BUCKETS = [
  { key: "indexed", match: /submitted and indexed|indexed, not submitted/i },
  { key: "crawled_not_indexed", match: /crawled.*not indexed/i },
  { key: "discovered_not_indexed", match: /discovered.*not indexed/i },
  { key: "unknown_to_google", match: /unknown to google/i },
  { key: "excluded_by_noindex", match: /noindex/i },
  { key: "duplicate", match: /duplicate/i },
];

function bucketFor(coverageState) {
  if (!coverageState) return "other";
  for (const b of COVERAGE_BUCKETS) {
    if (b.match.test(coverageState)) return b.key;
  }
  return "other";
}

async function fetchSitemapUrls(sitemapUrl) {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sitemapUrl}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function inspectOne(site, url) {
  try {
    const r = await urlInspect(site, url);
    const idx = r.inspectionResult?.indexStatusResult ?? {};
    return {
      url,
      verdict: idx.verdict || null,
      coverageState: idx.coverageState || null,
      lastCrawlTime: idx.lastCrawlTime || null,
      robotsTxtState: idx.robotsTxtState || null,
      indexingState: idx.indexingState || null,
      googleCanonical: idx.googleCanonical || null,
      userCanonical: idx.userCanonical || null,
      pageFetchState: idx.pageFetchState || null,
      sitemap: (idx.sitemap || []).slice(0, 3),
      bucket: bucketFor(idx.coverageState),
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      bucket: "error_api",
    };
  }
}

async function inspectAll(site, urls, concurrency) {
  const results = [];
  let inFlight = 0;
  let cursor = 0;
  let completed = 0;

  return new Promise((resolve, reject) => {
    function pump() {
      while (inFlight < concurrency && cursor < urls.length) {
        const url = urls[cursor];
        cursor += 1;
        inFlight += 1;
        inspectOne(site, url)
          .then((r) => {
            results.push(r);
            completed += 1;
            if (completed % 10 === 0 || completed === urls.length) {
              process.stdout.write(
                `\r  ${completed}/${urls.length} inspected (${r.bucket})    `,
              );
            }
            inFlight -= 1;
            // Polite pacing per worker.
            setTimeout(() => {
              if (results.length === urls.length) {
                process.stdout.write("\n");
                resolve(results);
              } else {
                pump();
              }
            }, POLITE_DELAY_MS);
          })
          .catch(reject);
      }
    }
    pump();
  });
}

function summarise(results) {
  const counts = {};
  for (const r of results) {
    counts[r.bucket] = (counts[r.bucket] || 0) + 1;
  }
  const total = results.length;
  const indexedRate = total > 0 ? (counts.indexed || 0) / total : 0;
  return { total, counts, indexedRate };
}

function groupByPathPrefix(results) {
  const groups = {};
  for (const r of results) {
    const path = r.url.replace(/^https?:\/\/[^/]+/, "");
    const prefix = (() => {
      if (path === "/") return "/(home)";
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 0) return "/(home)";
      if (["categories", "best", "glossary", "collections", "blog", "alternatives", "compare", "repo"].includes(parts[0])) {
        return `/${parts[0]}/*`;
      }
      return `/${parts[0]}`;
    })();
    if (!groups[prefix]) groups[prefix] = { total: 0, indexed: 0, perBucket: {} };
    groups[prefix].total += 1;
    if (r.bucket === "indexed") groups[prefix].indexed += 1;
    groups[prefix].perBucket[r.bucket] = (groups[prefix].perBucket[r.bucket] || 0) + 1;
  }
  return groups;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date().toISOString();

  console.log(`════════ GSC indexing audit ${args.site} ════════`);

  // Pull pages sitemap (the GEO answer-surfaces — the highest-priority set).
  let urls = [];
  try {
    urls = await fetchSitemapUrls(`${args.baseUrl}/sitemap-pages.xml`);
    console.log(`  /sitemap-pages.xml: ${urls.length} URLs`);
  } catch (err) {
    console.error(`Failed to fetch sitemap-pages.xml: ${err.message}`);
    process.exit(1);
  }

  if (args.includeRepos > 0) {
    try {
      const repoUrls = await fetchSitemapUrls(`${args.baseUrl}/sitemap-repos.xml`);
      // Sample evenly across the list so we cover both head and long-tail.
      const stride = Math.max(1, Math.floor(repoUrls.length / args.includeRepos));
      const sampled = repoUrls.filter((_, i) => i % stride === 0).slice(0, args.includeRepos);
      urls.push(...sampled);
      console.log(`  /sitemap-repos.xml: sampled ${sampled.length} (of ${repoUrls.length}) at stride ${stride}`);
    } catch (err) {
      console.warn(`  sample repos skipped: ${err.message}`);
    }
  }

  if (args.limit > 0) urls = urls.slice(0, args.limit);

  console.log(`  total URLs to inspect: ${urls.length}`);
  console.log(`  concurrency: ${args.concurrency}, polite delay: ${POLITE_DELAY_MS}ms`);
  console.log("");

  const results = await inspectAll(args.site, urls, args.concurrency);
  const summary = summarise(results);
  const groups = groupByPathPrefix(results);

  console.log("\n── BUCKET COUNTS ──");
  for (const [bucket, count] of Object.entries(summary.counts).sort((a, b) => b[1] - a[1])) {
    const share = ((count / summary.total) * 100).toFixed(1);
    console.log(`  ${bucket.padEnd(26)} ${String(count).padStart(4)}  (${share}%)`);
  }
  console.log(`  ${"INDEXED RATE".padEnd(26)} ${(summary.indexedRate * 100).toFixed(1)}%`);

  console.log("\n── BY PATH PREFIX ──");
  for (const [prefix, g] of Object.entries(groups).sort((a, b) => b[1].total - a[1].total)) {
    const rate = ((g.indexed / g.total) * 100).toFixed(0);
    console.log(`  ${prefix.padEnd(20)} ${g.indexed}/${g.total} indexed (${rate}%)`);
  }

  // List unindexed URLs explicitly so the operator can paste them into the
  // GSC "Request Indexing" button.
  const unindexed = results
    .filter((r) => r.bucket !== "indexed" && r.bucket !== "error_api")
    .slice(0, 30);
  if (unindexed.length > 0) {
    console.log("\n── TOP 30 UNINDEXED URLs (paste into GSC URL Inspection → Request Indexing) ──");
    for (const r of unindexed) {
      console.log(`  [${r.bucket.padEnd(24)}]  ${r.url}`);
    }
  }

  const payload = {
    generatedAt: now,
    site: args.site,
    totalInspected: summary.total,
    indexedRate: summary.indexedRate,
    bucketCounts: summary.counts,
    byPrefix: groups,
    results,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const datedPath = path.join(OUT_DIR, `gsc-indexing-${ymd(new Date())}.json`);
  const latestPath = path.join(OUT_DIR, "gsc-indexing-latest.json");
  await fs.writeFile(datedPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(latestPath, JSON.stringify(payload, null, 2));
  console.log(`\n→ wrote ${datedPath}`);
  console.log(`→ wrote ${latestPath}`);
}

main().catch((err) => {
  console.error(`gsc-indexing-audit failed: ${err.message}`);
  process.exit(1);
});
