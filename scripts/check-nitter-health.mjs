#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as Sentry from "@sentry/node";

const CONFIG_PATH = resolve(process.cwd(), "config", "nitter-instances.json");
const REQUEST_TIMEOUT_MS = 10_000;

function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV ?? "production",
    release: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    initialScope: {
      tags: {
        source: "nitter-health-check",
        runtime: "github-actions",
      },
    },
  });
  return true;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "trendingrepo-nitter-health/1.0 (+https://trendingrepo.com)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const sentryReady = initSentry();
  const raw = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const instances = Array.isArray(raw.instances) ? raw.instances : [];
  const checkedAt = new Date().toISOString();
  const results = [];

  for (const entry of instances) {
    const url = typeof entry.url === "string" ? entry.url.trim().replace(/\/+$/, "") : "";
    if (!url) continue;

    const probeUrl = `${url}/jack/rss`;
    let status = "dead";
    let reason = "unknown";

    try {
      const res = await fetchWithTimeout(probeUrl, REQUEST_TIMEOUT_MS);
      if (res.status === 200) {
        status = "healthy";
        reason = "ok";
      } else {
        reason = `http_${res.status}`;
      }
    } catch (error) {
      reason = error instanceof Error ? error.name || "network_error" : "network_error";
    }

    entry.url = url;
    entry.lastChecked = checkedAt;
    entry.status = status;
    results.push({ url, status, reason });
  }

  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const healthPercent =
    results.length > 0 ? Number(((healthyCount / results.length) * 100).toFixed(1)) : 0;

  await writeFile(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        checkedAt,
        total: results.length,
        healthy: healthyCount,
        dead: results.length - healthyCount,
        healthPercent,
        results,
      },
      null,
      2,
    ),
  );

  if (sentryReady) {
    Sentry.captureMessage(`nitter pool health ${healthPercent}%`, {
      level: healthPercent === 100 ? "info" : "warning",
      tags: {
        source: "nitter-health-check",
        alert: "twitter-nitter-health",
      },
      extra: {
        checkedAt,
        totalInstances: results.length,
        healthyCount,
        healthPercent,
      },
    });
    await Sentry.flush(2_000);
  }
}

main().catch(async (error) => {
  console.error(
    "[nitter-health-check] failed:",
    error instanceof Error ? error.message : String(error),
  );
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: "nitter-health-check", alert: "twitter-nitter-health" },
  });
  try {
    await Sentry.flush(2_000);
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
