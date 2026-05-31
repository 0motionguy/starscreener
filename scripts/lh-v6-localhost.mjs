#!/usr/bin/env node
/**
 * Lighthouse mobile audit for the v6 rebuild on localhost:3023.
 * Requires the production server running (`npm start`).
 *
 * Writes per-route JSON to `.perf/lh-v6-<slug>.json` and a summary
 * table to `.perf/lh-v6-summary.json` + stdout.
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3023";

const ROUTES = [
  { path: "/", slug: "home" },
  { path: "/breakout", slug: "breakout" },
  { path: "/market-signals", slug: "market-signals" },
  { path: "/funding", slug: "funding" },
  { path: "/agent-commerce", slug: "agent-commerce" },
  { path: "/ideas", slug: "ideas" },
  { path: "/repo/vercel/next.js", slug: "repo-detail" },
  { path: "/preview", slug: "preview" },
];

mkdirSync(".perf", { recursive: true });

function runLighthouse(url, outPath) {
  return new Promise((resolve) => {
    const args = [
      "lighthouse",
      url,
      `--chrome-path=${CHROME_PATH}`,
      "--output=json",
      `--output-path=${outPath}`,
      "--form-factor=mobile",
      "--throttling-method=simulate",
      "--only-categories=performance,accessibility,best-practices,seo",
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--quiet",
      "--no-enable-error-reporting",
      "--max-wait-for-load=30000",
    ];

    const child = spawn("npx", args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`  ✗ exit ${code}: ${stderr.split("\n").slice(-3).join(" | ")}`);
      }
      resolve(code);
    });
  });
}

function parseReport(outPath) {
  try {
    const raw = JSON.parse(readFileSync(outPath, "utf8"));
    const cat = raw.categories || {};
    const audits = raw.audits || {};
    return {
      perf: cat.performance?.score ?? null,
      a11y: cat.accessibility?.score ?? null,
      bp: cat["best-practices"]?.score ?? null,
      seo: cat.seo?.score ?? null,
      fcp_ms: audits["first-contentful-paint"]?.numericValue ?? null,
      lcp_ms: audits["largest-contentful-paint"]?.numericValue ?? null,
      tbt_ms: audits["total-blocking-time"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      tti_ms: audits["interactive"]?.numericValue ?? null,
      speed_index_ms: audits["speed-index"]?.numericValue ?? null,
      transfer_kb: audits["total-byte-weight"]?.numericValue
        ? Math.round(audits["total-byte-weight"].numericValue / 1024)
        : null,
    };
  } catch (e) {
    return { error: String(e).slice(0, 100) };
  }
}

const results = [];

for (const r of ROUTES) {
  const url = `${BASE_URL}${r.path}`;
  const outPath = path.join(".perf", `lh-v6-${r.slug}.json`);
  console.log(`\n→ ${r.path}`);
  const code = await runLighthouse(url, outPath);
  if (code !== 0) {
    results.push({ route: r.path, error: `lighthouse exit ${code}` });
    continue;
  }
  const m = parseReport(outPath);
  results.push({ route: r.path, ...m });
  const fmt = (v, unit = "") =>
    v === null || v === undefined ? "—" : typeof v === "number" ? Math.round(v) + unit : v;
  const fmtScore = (s) => (s === null ? "—" : Math.round(s * 100));
  console.log(
    `  perf=${fmtScore(m.perf)} a11y=${fmtScore(m.a11y)} bp=${fmtScore(m.bp)} seo=${fmtScore(m.seo)} | LCP=${fmt(m.lcp_ms, "ms")} TBT=${fmt(m.tbt_ms, "ms")} CLS=${m.cls?.toFixed?.(3) ?? "—"} | bytes=${fmt(m.transfer_kb, "KB")}`,
  );
}

const summary = {
  ts: new Date().toISOString(),
  base_url: BASE_URL,
  form_factor: "mobile",
  routes: results,
};

writeFileSync(".perf/lh-v6-summary.json", JSON.stringify(summary, null, 2));

console.log("\n=== summary table ===");
console.log(
  "route".padEnd(28) +
    "perf".padStart(6) +
    "a11y".padStart(6) +
    "bp".padStart(6) +
    "seo".padStart(6) +
    "LCP".padStart(8) +
    "TBT".padStart(7) +
    "CLS".padStart(7) +
    "bytes".padStart(8),
);
for (const r of results) {
  if (r.error) {
    console.log(r.route.padEnd(28) + " ✗ " + r.error);
    continue;
  }
  const s = (x) => (x === null ? "—" : Math.round(x * 100).toString());
  const ms = (x) => (x === null || x === undefined ? "—" : Math.round(x) + "ms");
  const cls = (x) => (x === null || x === undefined ? "—" : x.toFixed(3));
  console.log(
    r.route.padEnd(28) +
      s(r.perf).padStart(6) +
      s(r.a11y).padStart(6) +
      s(r.bp).padStart(6) +
      s(r.seo).padStart(6) +
      ms(r.lcp_ms).padStart(8) +
      ms(r.tbt_ms).padStart(7) +
      cls(r.cls).padStart(7) +
      (r.transfer_kb ? `${r.transfer_kb}KB` : "—").padStart(8),
  );
}

console.log("\n.perf/lh-v6-summary.json + per-route JSON files written.");
