#!/usr/bin/env node
/**
 * Lighthouse-via-PSI audit runner.
 *
 * Usage:
 *   PAGESPEED_API_KEY=<key> npm run lighthouse:routes:prod
 *
 * Iterates the 29 canonical smoke routes, calls Google's PageSpeed Insights
 * REST API per route, and writes a summary JSON to .perf/lighthouse-prod.json.
 * Per-route metrics: performance, accessibility, best-practices, seo,
 * FCP, LCP, CLS, TBT, TTI.
 *
 * The PSI API rate-limits anonymous calls aggressively (~5/sec public bucket).
 * With a key this loosens to ~25k queries/day; we run 29 routes serially
 * with a 1.5s gap. Total wall time: ~50s + Lighthouse compute per page (~10s
 * each) ≈ 5 min.
 *
 * Output JSON:
 * {
 *   "ts": "ISO-8601",
 *   "key_present": true|false,
 *   "routes": [{ "route": "/", "perf": 0.92, "a11y": 0.95, "bp": 0.91, "seo": 0.97, "lcp_ms": 1240, ... }]
 * }
 */

const BASE_URL = process.env.LH_BASE_URL || "https://trendingrepo.com";
const API_KEY = process.env.PAGESPEED_API_KEY?.trim();
const STRATEGY = process.env.LH_STRATEGY || "mobile"; // "mobile" or "desktop"

const ROUTES = [
  "/", "/githubrepo", "/skills", "/mcp",
  "/reddit/trending", "/hackernews/trending", "/lobsters", "/devto", "/bluesky/trending",
  "/twitter", "/signals", "/top10", "/compare",
  "/funding", "/revenue",
  "/arxiv/trending", "/huggingface", "/npm",
  "/breakouts", "/categories", "/methodology", "/research",
  "/tools/revenue-estimate",
  "/repo/vercel/next.js",
  "/trends",
  "/agent-commerce", "/agent-commerce/facilitator",
  "/repo/anthropics/anthropic-cookbook",
  // GEO answer-surfaces (2026-05-28) — now LLM-prose-bearing, audit them too.
  "/best", "/best/ai-agents",
  "/categories/ai-agents",
  "/glossary", "/glossary/ai-agent",
  "/collections",
];

async function runOne(route) {
  const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", `${BASE_URL}${route}`);
  url.searchParams.set("strategy", STRATEGY);
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    url.searchParams.append("category", cat);
  }
  if (API_KEY) url.searchParams.set("key", API_KEY);

  // Per-route timeout so a slow/hung PSI Lighthouse run can't stall the whole
  // sweep (the API has no SLA on full-category runs — heavy pages can hang).
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  let res;
  try {
    res = await fetch(url.toString(), { signal: ac.signal });
  } catch (err) {
    return { route, error: err?.name === "AbortError" ? "timeout (120s)" : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    return { route, error: `HTTP ${res.status}` };
  }
  const data = await res.json();
  const cats = data?.lighthouseResult?.categories ?? {};
  const audits = data?.lighthouseResult?.audits ?? {};
  return {
    route,
    perf: cats.performance?.score ?? null,
    a11y: cats.accessibility?.score ?? null,
    bp: cats["best-practices"]?.score ?? null,
    seo: cats.seo?.score ?? null,
    lcp_ms: audits["largest-contentful-paint"]?.numericValue ?? null,
    fcp_ms: audits["first-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    tbt_ms: audits["total-blocking-time"]?.numericValue ?? null,
    tti_ms: audits["interactive"]?.numericValue ?? null,
  };
}

async function main() {
  const fs = await import("node:fs/promises");
  console.log(`[lighthouse] strategy=${STRATEGY} base=${BASE_URL} routes=${ROUTES.length} key=${API_KEY ? "set" : "missing"}`);
  if (!API_KEY) {
    console.warn("[lighthouse] PAGESPEED_API_KEY not set — using anonymous bucket (5 req/sec, 25k/day limits don't apply). May 429.");
  }
  const out = { ts: new Date().toISOString(), strategy: STRATEGY, key_present: Boolean(API_KEY), routes: [] };
  for (const route of ROUTES) {
    process.stdout.write(`  ${route} ... `);
    try {
      const r = await runOne(route);
      out.routes.push(r);
      console.log(r.error ? `error: ${r.error}` : `perf=${(r.perf ?? 0).toFixed(2)} a11y=${(r.a11y ?? 0).toFixed(2)} lcp=${Math.round(r.lcp_ms ?? 0)}ms`);
    } catch (err) {
      out.routes.push({ route, error: String(err) });
      console.log(`error: ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await fs.mkdir(".perf", { recursive: true });
  const filename = `.perf/lighthouse-${STRATEGY}-prod.json`;
  await fs.writeFile(filename, JSON.stringify(out, null, 2));
  console.log(`[lighthouse] wrote ${filename}`);
  // Surface a quick summary
  const valid = out.routes.filter((r) => r.perf != null);
  if (valid.length === 0) {
    console.log("[lighthouse] no valid results");
    process.exit(1);
  }
  const avg = (k) => valid.reduce((s, r) => s + (r[k] ?? 0), 0) / valid.length;
  console.log(`[lighthouse] avg perf=${avg("perf").toFixed(2)} a11y=${avg("a11y").toFixed(2)} bp=${avg("bp").toFixed(2)} seo=${avg("seo").toFixed(2)}`);
}

main().catch((err) => {
  console.error("[lighthouse] fatal", err);
  process.exit(1);
});
