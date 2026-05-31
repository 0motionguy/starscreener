#!/usr/bin/env node
// Post-deploy smoke for the Clerk satellite endpoint.
//
// History (2026-05-31): the modal failure on prod took 2h to diagnose
// because three independent things had to be right at once:
//   1. The satellite DNS (clerk.trendingrepo.com) must resolve + serve.
//   2. The Clerk instance config must list the prod origin in
//      `allowed_origins` (otherwise CORS preflight fails).
//   3. The `access-control-allow-origin` response header must echo the
//      requesting origin.
// All three failure modes are visible in <1s by hitting
// `/v1/environment` with the prod Origin header.
//
// Usage:
//   SATELLITE=https://clerk.trendingrepo.com ORIGIN=https://trendingrepo.com \
//     node scripts/smoke-clerk-satellite.mjs

const SATELLITE = process.env.SATELLITE || "https://clerk.trendingrepo.com";
const ORIGIN = process.env.ORIGIN || "https://trendingrepo.com";
const UA = process.env.SMOKE_USER_AGENT || "TrendingRepoPostDeploySmoke/1.0";

const url = `${SATELLITE}/v1/environment`;

let res;
try {
  res = await fetch(url, { headers: { Origin: ORIGIN, "User-Agent": UA } });
} catch (err) {
  console.error(`[smoke-clerk-satellite] FAIL — fetch error: ${err.message}`);
  console.error(`  url: ${url}`);
  process.exit(1);
}

const acao = res.headers.get("access-control-allow-origin");
const status = res.status;

if (status !== 200) {
  console.error(`[smoke-clerk-satellite] FAIL — expected 200, got ${status}`);
  console.error(`  url: ${url}`);
  console.error(`  acao: ${acao ?? "(missing)"}`);
  process.exit(1);
}

if (!acao || (acao !== ORIGIN && acao !== "*")) {
  console.error(`[smoke-clerk-satellite] FAIL — CORS misconfigured`);
  console.error(`  expected access-control-allow-origin: ${ORIGIN} (or *)`);
  console.error(`  got: ${acao ?? "(missing)"}`);
  console.error(``);
  console.error(`Fix: in Clerk Dashboard → Instance → "allowed_origins", add ${ORIGIN}.`);
  process.exit(1);
}

console.log(`[smoke-clerk-satellite] OK — ${url} returns ${status}, ACAO=${acao}`);
