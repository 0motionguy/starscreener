#!/usr/bin/env node
// StarScreener — operator-runnable Lighthouse mobile harness.
//
// One-shot harness that walks a small route list against a deployed
// Vercel preview (or production) and reports per-route mobile perf.
//
// WHEN TO RUN
//   • Post-deploy smoke check on a Vercel preview before merging.
//   • Before tagging a release to confirm prod has no regressed pages.
//   • Ad-hoc when investigating a perf complaint on a specific surface.
//
// HOW TO RUN
//   Lighthouse is intentionally NOT a project dependency — it's huge and
//   only operators run this. Two supported invocations:
//
//   1) Zero-install (recommended for one-offs):
//        npx -y -p lighthouse@latest -p chrome-launcher \
//          node scripts/lighthouse-mobile.mjs https://<preview>.vercel.app
//
//   2) Local install (no-save, faster on repeat runs):
//        npm install --no-save lighthouse chrome-launcher
//        npm run lighthouse:mobile -- https://<preview>.vercel.app
//
// CLI
//   node scripts/lighthouse-mobile.mjs [baseUrl]
//   • baseUrl defaults to https://trendingrepo.com
//   • LH_BUDGET env var (0..1) sets the fail threshold; default 0.80
//
// OUTPUT
//   • Markdown table on stdout (one row per route)
//   • Full JSON per route saved to .tmp-lighthouse-<slug>-<ts>.json
//   • Exit 1 if ANY route's perf score < LH_BUDGET, else exit 0
//
// SCOPE: forward-only operator tool. No prod code paths touch this.

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

const ROUTES = [
  "/",
  "/signals",
  "/githubrepo",
  "/trends",
  "/skills",
  "/mcp",
  "/top10",
  "/categories",
];

const DEFAULT_BASE = "https://trendingrepo.com";
const BUDGET = (() => {
  const raw = Number(process.env.LH_BUDGET);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return 0.8;
})();

function parseBaseUrl() {
  const arg = process.argv[2]?.trim();
  const fromEnv = process.env.LH_BASE_URL?.trim();
  const raw = arg || fromEnv || DEFAULT_BASE;
  try {
    const u = new URL(raw);
    // Strip trailing slash so concat with route is clean.
    return u.origin;
  } catch {
    console.error(`✗ Invalid base URL: ${raw}`);
    process.exit(2);
  }
}

function ensureDeps() {
  try {
    require.resolve("lighthouse");
    require.resolve("chrome-launcher");
  } catch {
    console.error(
      "✗ Missing peer deps `lighthouse` and/or `chrome-launcher`.\n" +
        "  Run one of:\n" +
        "    npx -y -p lighthouse@latest -p chrome-launcher \\\n" +
        "      node scripts/lighthouse-mobile.mjs " +
        (process.argv[2] || "<baseUrl>") +
        "\n" +
        "    npm install --no-save lighthouse chrome-launcher && \\\n" +
        "      npm run lighthouse:mobile",
    );
    process.exit(2);
  }
}

function slugFor(route) {
  if (route === "/") return "root";
  return route.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "-");
}

function fmtScore(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (n * 100).toFixed(0);
}

function fmtMetric(audit) {
  if (!audit || audit.numericValue == null) return "—";
  // Lighthouse returns ms for FCP/LCP/TBT/SI and unitless for CLS.
  if (audit.id === "cumulative-layout-shift") {
    return audit.numericValue.toFixed(3);
  }
  return `${Math.round(audit.numericValue)}ms`;
}

async function runOne(lighthouse, launcher, baseUrl, route, ts) {
  const target = baseUrl + route;
  const chrome = await launcher.launch({
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const result = await lighthouse(
      target,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
      },
      {
        extends: "lighthouse:default",
        settings: {
          formFactor: "mobile",
          throttlingMethod: "simulate",
          screenEmulation: {
            mobile: true,
            width: 412,
            height: 823,
            deviceScaleFactor: 1.75,
            disabled: false,
          },
        },
      },
    );

    const lhr = result?.lhr;
    if (!lhr) {
      throw new Error("Lighthouse returned no lhr payload");
    }
    const slug = slugFor(route);
    const outFile = path.resolve(
      process.cwd(),
      `.tmp-lighthouse-${slug}-${ts}.json`,
    );
    await writeFile(outFile, JSON.stringify(lhr, null, 2), "utf8");

    const perf = lhr.categories?.performance?.score ?? null;
    return {
      route,
      target,
      perf,
      fcp: lhr.audits?.["first-contentful-paint"],
      lcp: lhr.audits?.["largest-contentful-paint"],
      tbt: lhr.audits?.["total-blocking-time"],
      cls: lhr.audits?.["cumulative-layout-shift"],
      si: lhr.audits?.["speed-index"],
      outFile,
    };
  } finally {
    await chrome.kill().catch(() => {});
  }
}

async function main() {
  ensureDeps();
  const baseUrl = parseBaseUrl();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  // Dynamic import AFTER ensureDeps so the error path stays clean.
  const [{ default: lighthouse }, launcher] = await Promise.all([
    import("lighthouse"),
    import("chrome-launcher"),
  ]);

  console.log(`# Lighthouse mobile — ${baseUrl}`);
  console.log(`Budget: perf ≥ ${BUDGET.toFixed(2)} (LH_BUDGET to override)`);
  console.log("");

  const rows = [];
  let failed = false;

  for (const route of ROUTES) {
    process.stderr.write(`→ ${route} ... `);
    try {
      const r = await runOne(lighthouse, launcher, baseUrl, route, ts);
      rows.push(r);
      const ok = r.perf != null && r.perf >= BUDGET;
      if (!ok) failed = true;
      process.stderr.write(`${fmtScore(r.perf)} ${ok ? "OK" : "FAIL"}\n`);
    } catch (err) {
      failed = true;
      rows.push({ route, target: baseUrl + route, error: String(err?.message || err) });
      process.stderr.write(`ERROR: ${err?.message || err}\n`);
    }
  }

  console.log("| Route | Perf | FCP | LCP | TBT | CLS | SI | Report |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const r of rows) {
    if (r.error) {
      console.log(
        `| \`${r.route}\` | — | — | — | — | — | — | error: ${r.error} |`,
      );
      continue;
    }
    console.log(
      `| \`${r.route}\` | ${fmtScore(r.perf)} | ${fmtMetric(r.fcp)} | ${fmtMetric(
        r.lcp,
      )} | ${fmtMetric(r.tbt)} | ${fmtMetric(r.cls)} | ${fmtMetric(r.si)} | \`${path.basename(
        r.outFile,
      )}\` |`,
    );
  }

  if (failed) {
    console.error(
      `\n✗ One or more routes failed perf budget (${BUDGET.toFixed(2)}) or errored.`,
    );
    process.exit(1);
  }
  console.log(`\n✓ All ${ROUTES.length} routes passed perf budget ${BUDGET.toFixed(2)}.`);
}

main().catch((err) => {
  console.error(`\n✗ Lighthouse harness crashed: ${err?.stack || err}`);
  process.exit(1);
});
