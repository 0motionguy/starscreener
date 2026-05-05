#!/usr/bin/env node

const BASE = process.env.CSP_VERIFY_BASE_URL || "https://trendingrepo.com";
const ROUTES = ["/", "/github/trending", "/reddit/trending", "/you", "/watchlist"];

async function checkRoute(route) {
  const url = new URL(route, BASE).toString();
  const res = await fetch(url, { redirect: "manual" });
  const csp = res.headers.get("content-security-policy");
  const cspReportOnly = res.headers.get("content-security-policy-report-only");

  return {
    route,
    url,
    status: res.status,
    hasCsp: Boolean(csp),
    hasReportOnly: Boolean(cspReportOnly),
    csp,
    cspReportOnly,
  };
}

async function main() {
  const out = [];
  let failed = false;

  for (const route of ROUTES) {
    const row = await checkRoute(route);
    out.push(row);
    if (!row.hasCsp) failed = true;
  }

  for (const row of out) {
    console.log(
      JSON.stringify(
        {
          route: row.route,
          status: row.status,
          hasCsp: row.hasCsp,
          hasReportOnly: row.hasReportOnly,
        },
        null,
        2,
      ),
    );
  }

  if (failed) {
    console.error("CSP verification failed: one or more routes missing Content-Security-Policy");
    process.exit(1);
  }

  console.log("CSP verification passed: Content-Security-Policy present on all target routes");
}

main().catch((error) => {
  console.error("verify-csp-headers failed:", error);
  process.exit(1);
});
