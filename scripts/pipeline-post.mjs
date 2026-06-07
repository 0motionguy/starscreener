#!/usr/bin/env node

import "./_load-env.mjs";

import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:3023";
const PROD_BASE_URL = "https://trendingrepo.com";

const SAMPLE_INGEST_BODY = {
  fullNames: ["vercel/next.js", "ollama/ollama", "anthropics/claude-code"],
};

const ROUTES = {
  recompute: {
    path: "/api/pipeline/recompute",
    defaultBody: {},
  },
  ingest: {
    path: "/api/pipeline/ingest",
    defaultBody: null,
  },
};

function usage() {
  return [
    "usage: node scripts/pipeline-post.mjs <recompute|ingest> [--sample|--body-json <json>] [--prod] [--base-url <url>] [--dry-run]",
    "",
    "Calls CRON_SECRET-protected pipeline POST routes.",
    "Default target is http://localhost:3023. --prod targets https://trendingrepo.com.",
  ].join("\n");
}

function failUsage(message) {
  console.error(`pipeline-post: ${message}`);
  console.error(usage());
  process.exit(64);
}

function normalizeBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    failUsage(`invalid base URL: ${raw}`);
  }
  if (url.username || url.password) {
    failUsage("base URL must not include credentials");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    failUsage("--body-json must be valid JSON");
  }
}

export function parseArgs(argv) {
  let routeName = null;
  let prod = false;
  let baseUrl = null;
  let body = undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--prod") {
      prod = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--sample") {
      body = SAMPLE_INGEST_BODY;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--base-url") {
      const next = argv[i + 1];
      if (!next) failUsage("--base-url requires a value");
      baseUrl = next;
      i += 1;
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--body-json") {
      const next = argv[i + 1];
      if (!next) failUsage("--body-json requires a value");
      body = parseJson(next);
      i += 1;
    } else if (arg.startsWith("--body-json=")) {
      body = parseJson(arg.slice("--body-json=".length));
    } else if (arg.startsWith("-")) {
      failUsage(`unknown argument: ${arg}`);
    } else if (!routeName) {
      routeName = arg;
    } else {
      failUsage(`unexpected argument: ${arg}`);
    }
  }

  if (!routeName || !Object.hasOwn(ROUTES, routeName)) {
    failUsage("route must be one of: recompute, ingest");
  }
  if (prod && baseUrl) failUsage("use either --prod or --base-url, not both");

  const route = ROUTES[routeName];
  const resolvedBody = body === undefined ? route.defaultBody : body;
  if (resolvedBody === null) {
    failUsage(`${routeName} requires --sample or --body-json`);
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl ?? (prod ? PROD_BASE_URL : DEFAULT_BASE_URL)),
    routeName,
    routePath: route.path,
    body: resolvedBody,
    dryRun,
  };
}

export function assertSafeAuthDestination(rawUrl) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const productionHosts = new Set(["trendingrepo.com", "www.trendingrepo.com"]);
  const local = localHosts.has(hostname);
  const production = url.protocol === "https:" && productionHosts.has(hostname);
  if (local || production) return;
  throw new Error(`refusing to send CRON_SECRET to non-allowlisted origin ${url.origin}`);
}

export function buildRequest(opts, cronSecret) {
  const url = `${opts.baseUrl}${opts.routePath}`;
  assertSafeAuthDestination(url);
  return {
    url,
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(opts.body),
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret && !opts.dryRun) {
    throw new Error("CRON_SECRET is required");
  }

  const request = buildRequest(opts, cronSecret || "dry-run");
  if (opts.dryRun) {
    console.log(JSON.stringify({ url: request.url, body: opts.body }, null, 2));
    return;
  }

  const response = await fetch(request.url, request.init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) {
    process.exitCode = response.status >= 500 ? 2 : 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`pipeline-post: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
