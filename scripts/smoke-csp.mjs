#!/usr/bin/env node
// Post-deploy smoke for Content-Security-Policy completeness.
//
// History (2026-05-31): a hand-edited CSP string in next.config.ts
// shipped without `https://static.cloudflareinsights.com` in
// `script-src`, breaking Web Analytics on prod silently. Browser
// console warnings are not in any monitoring loop; users notice when
// the dashboard goes blank.
//
// This check fetches `/` and asserts every host in the manifest below
// appears in the response CSP header. Add new hosts to REQUIRED_HOSTS
// when new third-party scripts get wired in (or move to the
// CSP-manifest pattern in D.6).

const BASE_URL = process.env.BASE_URL || "https://trendingrepo.com";
const UA = process.env.SMOKE_USER_AGENT || "TrendingRepoPostDeploySmoke/1.0";

// Hosts that MUST appear somewhere in the CSP. Update when a new
// third-party script gets added to the app.
const REQUIRED_HOSTS = [
  "https://*.clerk.dev",
  "https://*.clerk.com",
  "https://*.clerk.accounts.dev",
  "https://clerk.trendingrepo.com",
  "https://challenges.cloudflare.com",
  "https://static.cloudflareinsights.com",
];

let res;
try {
  res = await fetch(BASE_URL, { headers: { "User-Agent": UA } });
} catch (err) {
  console.error(`[smoke-csp] FAIL — fetch error: ${err.message}`);
  process.exit(1);
}

const csp =
  res.headers.get("content-security-policy") ||
  res.headers.get("Content-Security-Policy") ||
  "";

if (!csp) {
  console.error(`[smoke-csp] FAIL — no Content-Security-Policy header on ${BASE_URL}`);
  process.exit(1);
}

const missing = REQUIRED_HOSTS.filter((host) => !csp.includes(host));
if (missing.length) {
  console.error(`[smoke-csp] FAIL — CSP missing ${missing.length} required host(s):`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error(``);
  console.error(`Update next.config.ts (or src/lib/csp/manifest.ts after D.6).`);
  process.exit(1);
}

console.log(`[smoke-csp] OK — ${BASE_URL} CSP contains all ${REQUIRED_HOSTS.length} required hosts.`);
