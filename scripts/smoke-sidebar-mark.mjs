#!/usr/bin/env node
// Post-deploy smoke for the brand mark in the rendered HTML.
//
// History (2026-05-31): the v7 orange notched mark + 2-tone wordmark
// landed on cleanup/2026-05-30-hygiene but only the OLD chart-pulse
// mark was on prod for ~24h because the cherry-picks hadn't been
// shipped. There was no automated detection — a user had to notice.
//
// This check fetches `/` and asserts the expected mark URL appears
// in the HTML. Bump EXPECTED_MARK when the brand rotates.

const BASE_URL = process.env.BASE_URL || "https://trendingrepo.com";
const UA = process.env.SMOKE_USER_AGENT || "TrendingRepoPostDeploySmoke/1.0";
const EXPECTED_MARK = process.env.EXPECTED_MARK || "trendingrepo-mark-v7";

let res;
try {
  res = await fetch(BASE_URL, { headers: { "User-Agent": UA } });
} catch (err) {
  console.error(`[smoke-sidebar-mark] FAIL — fetch error: ${err.message}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`[smoke-sidebar-mark] FAIL — ${BASE_URL} returned ${res.status}`);
  process.exit(1);
}

const html = await res.text();

if (!html.includes(EXPECTED_MARK)) {
  console.error(`[smoke-sidebar-mark] FAIL — '${EXPECTED_MARK}' not found in rendered HTML.`);
  console.error(`  This usually means the deploy is on an older commit OR the brand`);
  console.error(`  rotated without updating EXPECTED_MARK in this script.`);
  console.error(``);
  // Tease which mark IS present, to help diagnose
  const found = html.match(/trendingrepo-mark-v\d+/g);
  if (found && found.length) {
    console.error(`  Found instead: ${[...new Set(found)].join(", ")}`);
  } else {
    console.error(`  No trendingrepo-mark-v* string found at all — sidebar may be broken.`);
  }
  process.exit(1);
}

console.log(`[smoke-sidebar-mark] OK — ${BASE_URL} HTML contains ${EXPECTED_MARK}.`);
