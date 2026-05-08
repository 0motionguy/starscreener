#!/usr/bin/env node
// perf-routes — probe every route in perf/routes.json against budgets.
//
// Usage:
//   node scripts/perf-routes.mjs [--prod | --base-url=<url>]
//                                [--routes=<path>]
//                                [--only=/foo,/bar]
//                                [--json] [--out=<path>]
//                                [--no-second-hit]
//
// Defaults:
//   base url: http://localhost:3023
//   routes config: perf/routes.json
//
// Exit codes:
//   0  all routes within budget
//   1  one or more routes failed an assertion
//   2  configuration / runtime error

import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import https from "node:https";

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[3] === undefined ? true : m[3];
  }
  return out;
}

const args = parseArgs(process.argv);
const baseUrl = args.prod
  ? "https://trendingrepo.com"
  : (args["base-url"] ?? process.env.PERF_BASE_URL ?? "http://localhost:3023");
const routesPath = resolve(args.routes ?? "perf/routes.json");
const onlyFilter = args.only ? new Set(String(args.only).split(",").map((s) => s.trim())) : null;
const skipSecondHit = Boolean(args["no-second-hit"]);
const wantJson = Boolean(args.json);
const outPath = args.out;

let config;
try {
  const raw = readFileSync(routesPath, "utf8");
  config = JSON.parse(raw);
} catch (err) {
  console.error(`error: cannot read ${routesPath}: ${err.message}`);
  process.exit(2);
}

const defaults = config.globalDefaults ?? {};
const allRoutes = (config.routes ?? []).filter(
  (r) => !onlyFilter || onlyFilter.has(r.route),
);

if (allRoutes.length === 0) {
  console.error("error: no routes selected");
  process.exit(2);
}

async function probeOnce(route, attempt) {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}${route.startsWith("/") ? route : "/" + route}`,
  );
  return await new Promise((resolveProbe) => {
    const start = performance.now();
    let status = 0;
    let ttfbMs = null;
    let transferBytes = 0;
    let headers = {};
    let settled = false;

    function done(errorMessage = null) {
      if (settled) return;
      settled = true;
      resolveProbe({
        status,
        ttfbMs,
        transferKb: Math.round((transferBytes / 1024) * 10) / 10,
        cacheControl: headers["cache-control"] ?? null,
        vercelCache: headers["x-vercel-cache"] ?? null,
        age: headers.age ?? null,
        contentEncoding: headers["content-encoding"] ?? null,
        error: errorMessage,
      });
    }

    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(url, {
      method: "GET",
      headers: {
        "user-agent": `TrendingRepo-PerfRoutes/1.0 (attempt ${attempt})`,
        "accept-encoding": "gzip, br",
      },
      timeout: 30_000,
    }, (res) => {
      ttfbMs = Math.round(performance.now() - start);
      status = res.statusCode ?? 0;
      headers = Object.fromEntries(
        Object.entries(res.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : String(value ?? ""),
        ]),
      );
      res.on("data", (chunk) => {
        transferBytes += chunk.length;
      });
      res.on("end", () => done());
    });

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      done(err instanceof Error ? err.message : String(err));
    });
    req.end();
  });
}

function classifyCacheControl(cc) {
  if (!cc) return "missing";
  const s = cc.toLowerCase();
  if (s.includes("no-store")) return "no-store";
  if (s.includes("private")) return "private";
  if (s.includes("public")) return "public";
  return "other";
}

function evaluate(routeConfig, hits) {
  const last = hits[hits.length - 1];
  const ttfbBudget =
    routeConfig.ttfbBudgetMs?.cached ?? defaults.ttfbBudgetMs?.cached ?? 800;
  const ttfbBudgetUncached =
    routeConfig.ttfbBudgetMs?.uncached ?? defaults.ttfbBudgetMs?.uncached ?? 1500;
  const transferBudget =
    routeConfig.transferBudgetKb ?? defaults.transferBudgetKb ?? 90;

  const failures = [];
  const warnings = [];

  if (last.error) {
    failures.push(`network_error:${last.error}`);
  }
  if (last.status !== 200 && last.status !== 304) {
    failures.push(`http_status:${last.status}`);
  }

  const cacheKind = classifyCacheControl(last.cacheControl);
  switch (routeConfig.policy) {
    case "isr":
    case "static": {
      if (cacheKind === "no-store" || cacheKind === "private") {
        failures.push(`cache_control_violation:${cacheKind}`);
      } else if (cacheKind === "missing") {
        warnings.push("cache_control_missing");
      }
      break;
    }
    case "dynamic-public": {
      if (!routeConfig.expectsDynamic || !routeConfig.reason) {
        failures.push("dynamic_public_without_reason");
      }
      break;
    }
    case "private": {
      if (cacheKind !== "no-store" && cacheKind !== "private") {
        failures.push("private_route_publicly_cacheable");
      }
      break;
    }
    default: {
      failures.push(`unknown_policy:${routeConfig.policy}`);
    }
  }

  if (routeConfig.warmupOnDeploy) {
    const lastVc = (last.vercelCache ?? "").toUpperCase();
    if (lastVc && lastVc !== "HIT" && lastVc !== "STALE" && lastVc !== "PRERENDER" && lastVc !== "REVALIDATED") {
      // MISS once is tolerated on cold deploy; tracked as warning, not failure.
      // Two consecutive non-HIT becomes a failure.
      const allMisses = hits.every((h) => {
        const vc = (h.vercelCache ?? "").toUpperCase();
        return vc !== "HIT" && vc !== "STALE" && vc !== "PRERENDER" && vc !== "REVALIDATED";
      });
      if (allMisses && hits.length >= 2) {
        failures.push(`warmup_cache_miss:${lastVc || "—"}`);
      } else {
        warnings.push(`warmup_cache:${lastVc || "—"}`);
      }
    }
  }

  // TTFB: cached budget for HIT, uncached for MISS (or unknown).
  const lastVc = (last.vercelCache ?? "").toUpperCase();
  const isCachedHit = lastVc === "HIT" || lastVc === "STALE" || lastVc === "PRERENDER";
  const ttfbLimit = isCachedHit ? ttfbBudget : ttfbBudgetUncached;
  if (last.ttfbMs !== null && last.ttfbMs > ttfbLimit) {
    failures.push(`ttfb_budget:${last.ttfbMs}ms>${ttfbLimit}ms`);
  }

  if (last.transferKb > transferBudget) {
    failures.push(`transfer_budget:${last.transferKb}kb>${transferBudget}kb`);
  }

  return { failures, warnings };
}

function pad(s, n) {
  s = String(s ?? "");
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function color(label, code) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return label;
  return `\x1b[${code}m${label}\x1b[0m`;
}

async function main() {
  console.error(`perf-routes: probing ${allRoutes.length} route(s) against ${baseUrl}`);
  const results = [];
  for (const r of allRoutes) {
    const hits = [];
    const first = await probeOnce(r.route, 1);
    hits.push(first);
    if (r.warmupOnDeploy && !skipSecondHit) {
      // Sleep 5s then re-probe so caching can settle on cold deploy.
      await new Promise((res) => setTimeout(res, 5_000));
      const second = await probeOnce(r.route, 2);
      hits.push(second);
    }
    const verdict = evaluate(r, hits);
    const last = hits[hits.length - 1];
    const pass = verdict.failures.length === 0;
    results.push({
      route: r.route,
      policy: r.policy,
      hits,
      ...verdict,
      pass,
      lastTtfbMs: last.ttfbMs,
      lastTransferKb: last.transferKb,
      lastCacheControl: last.cacheControl,
      lastVercelCache: last.vercelCache,
    });
  }

  const summary = {
    base: baseUrl,
    runAt: new Date().toISOString(),
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    warn: results.reduce((acc, r) => acc + r.warnings.length, 0),
    results,
  };

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(summary, null, 2));
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    // Pretty table
    console.log(
      pad("ROUTE", 38),
      pad("POLICY", 16),
      pad("TTFB", 8),
      pad("SIZE", 8),
      pad("CACHE", 12),
      pad("VERCEL", 8),
      "STATUS",
    );
    for (const r of results) {
      const cacheKind = classifyCacheControl(r.lastCacheControl);
      const status = r.pass
        ? color("PASS", 32)
        : color(`FAIL ${r.failures.join(",")}`, 31);
      const warnSuffix = r.warnings.length
        ? " " + color(`(${r.warnings.join(",")})`, 33)
        : "";
      console.log(
        pad(r.route, 38),
        pad(r.policy, 16),
        pad(`${r.lastTtfbMs ?? "—"}ms`, 8),
        pad(`${r.lastTransferKb}kb`, 8),
        pad(cacheKind, 12),
        pad(r.lastVercelCache ?? "—", 8),
        status + warnSuffix,
      );
    }
    console.error(
      `\n${summary.pass} pass / ${summary.fail} fail / ${summary.warn} warn`,
    );
  }

  process.exit(summary.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("perf-routes fatal:", err);
  process.exit(2);
});
