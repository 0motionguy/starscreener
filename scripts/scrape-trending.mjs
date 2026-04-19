#!/usr/bin/env node
// Fetch OSS Insight trending repos for a cartesian of periods × languages
// and persist to data/trending.json. No auth; OSS Insight allows 600 req/hr
// per IP. We throttle 1.5s between calls (10 req/min) to stay polite.
//
// Exits 1 on the first failure so the GitHub Actions run fails visibly —
// silent drift of a stale JSON is the exact failure mode this replaces.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PERIODS = ["past_24_hours", "past_week", "past_month"];
const LANGUAGES = ["All", "Python", "TypeScript", "Rust", "Go"];
const PAUSE_MS = 1500;
const BASE = "https://api.ossinsight.io/v1/trends/repos/";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "data", "trending.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBucket(period, language) {
  const url = `${BASE}?period=${encodeURIComponent(period)}&language=${encodeURIComponent(language)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`${period}/${language}: HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const rows = body?.data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${period}/${language}: malformed response (no data.rows array)`);
  }
  return rows;
}

async function main() {
  const buckets = {};
  let totalRows = 0;
  for (const period of PERIODS) {
    buckets[period] = {};
    for (const language of LANGUAGES) {
      const rows = await fetchBucket(period, language);
      buckets[period][language] = rows;
      totalRows += rows.length;
      console.log(`ok  ${period} / ${language} — ${rows.length} rows`);
      await sleep(PAUSE_MS);
    }
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    buckets,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT} (${totalRows} rows across ${PERIODS.length * LANGUAGES.length} buckets)`);
}

main().catch((err) => {
  console.error("scrape-trending failed:", err.message ?? err);
  process.exit(1);
});
