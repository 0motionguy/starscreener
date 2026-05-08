#!/usr/bin/env node
// Single-route probe — measures TTFB, transfer size, and cache headers.
//
// Usage:
//   node scripts/probe-route.mjs --base=https://trendingrepo.com --route=/signals \
//     [--user-agent="..."] [--out=path/to/probe.json] [--timeout-ms=30000]
//
// Output: one JSON object describing the probe. If --out is given the same
// JSON is written to that file. The script exits 0 even on non-2xx — assertions
// live in perf-routes.mjs / cron-warmup summarize. The probe is informational.

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
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
const base = args.base ?? process.env.PROBE_BASE ?? "http://localhost:3023";
const route = args.route;
const userAgent = args["user-agent"] ?? "TrendingRepo-Probe/1.0";
const outPath = args.out;
const timeoutMs = Number.parseInt(args["timeout-ms"] ?? "30000", 10);

if (!route) {
  console.error("error: --route is required");
  process.exit(2);
}

const url = `${base.replace(/\/$/, "")}${route.startsWith("/") ? route : "/" + route}`;

async function probe() {
  const parsedUrl = new URL(url);
  const start = performance.now();
  const result = await new Promise((resolveProbe) => {
    let status = 0;
    let statusText = "";
    let ttfbMs = null;
    let totalMs = null;
    let transferBytes = 0;
    let headers = {};
    let settled = false;

    function done(errorMessage = null) {
      if (settled) return;
      settled = true;
      totalMs = totalMs ?? Math.round(performance.now() - start);
      resolveProbe({
        route,
        url,
        runAt: new Date().toISOString(),
        status,
        statusText,
        ttfbMs,
        totalMs,
        transferBytes,
        transferKb: transferBytes
          ? Math.round((transferBytes / 1024) * 10) / 10
          : 0,
        cacheControl: headers["cache-control"] ?? null,
        vercelCache: headers["x-vercel-cache"] ?? null,
        vercelId: headers["x-vercel-id"] ?? null,
        age: headers.age ?? null,
        contentEncoding: headers["content-encoding"] ?? null,
        contentType: headers["content-type"] ?? null,
        serverTiming: headers["server-timing"] ?? null,
        location: headers.location ?? null,
        error: errorMessage,
      });
    }

    const transport = parsedUrl.protocol === "https:" ? https : http;
    const req = transport.request(parsedUrl, {
      method: "GET",
      headers: { "user-agent": userAgent, "accept-encoding": "gzip, br" },
      timeout: timeoutMs,
    }, (res) => {
      ttfbMs = Math.round(performance.now() - start);
      status = res.statusCode ?? 0;
      statusText = res.statusMessage ?? "";
      headers = Object.fromEntries(
        Object.entries(res.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : String(value ?? ""),
        ]),
      );
      res.on("data", (chunk) => {
        transferBytes += chunk.length;
      });
      res.on("end", () => {
        totalMs = Math.round(performance.now() - start);
        done();
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      done(err instanceof Error ? err.message : String(err));
    });
    req.end();
  });

  // One-line stdout summary for log scrapers
  const cacheLabel = result.vercelCache ?? "—";
  const ccLabel = result.cacheControl ? result.cacheControl.split(",")[0] : "—";
  const ttfbMs = result.ttfbMs;
  const errorMessage = result.error;
  console.log(
    `${result.status} ${ttfbMs ?? "—"}ms ${result.transferKb}kb ` +
      `cc=${ccLabel} vc=${cacheLabel} ${route}` +
      (errorMessage ? ` err=${errorMessage}` : ""),
  );

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  }

  return result;
}

probe().catch((err) => {
  console.error("probe-route fatal:", err);
  process.exit(1);
});
