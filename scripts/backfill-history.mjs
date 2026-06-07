#!/usr/bin/env node

import "./_load-env.mjs";

import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:3023";
const PROD_BASE_URL = "https://trendingrepo.com";
const FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function usage() {
  return [
    "usage: npm run backfill:history -- <owner/repo> [--max-pages <n>] [--prod] [--base-url <url>] [--dry-run]",
    "",
    "Calls POST /api/pipeline/backfill-history with CRON_SECRET auth.",
    "Default target is http://localhost:3023. --prod targets https://trendingrepo.com.",
  ].join("\n");
}

function failUsage(message) {
  console.error(`backfill-history: ${message}`);
  console.error(usage());
  process.exit(64);
}

function parsePositiveInt(raw, flag) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    failUsage(`${flag} must be a positive number`);
  }
  return Math.floor(n);
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

export function parseArgs(argv) {
  let prod = false;
  let baseUrl = null;
  let fullName = null;
  let maxPages;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--prod") {
      prod = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
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
    } else if (arg === "--max-pages") {
      const next = argv[i + 1];
      if (!next) failUsage("--max-pages requires a value");
      maxPages = parsePositiveInt(next, "--max-pages");
      i += 1;
    } else if (arg.startsWith("--max-pages=")) {
      maxPages = parsePositiveInt(arg.slice("--max-pages=".length), "--max-pages");
    } else if (arg.startsWith("-")) {
      failUsage(`unknown argument: ${arg}`);
    } else if (!fullName) {
      fullName = arg;
    } else {
      failUsage(`unexpected argument: ${arg}`);
    }
  }

  if (prod && baseUrl) failUsage("use either --prod or --base-url, not both");
  if (!fullName || !FULL_NAME_PATTERN.test(fullName)) {
    failUsage("fullName must be in the form owner/repo");
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl ?? (prod ? PROD_BASE_URL : DEFAULT_BASE_URL)),
    fullName,
    maxPages,
    dryRun,
  };
}

function endpoint(baseUrl) {
  return `${baseUrl}/api/pipeline/backfill-history`;
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
  const url = endpoint(opts.baseUrl);
  assertSafeAuthDestination(url);
  const body = {
    fullName: opts.fullName,
    ...(opts.maxPages === undefined ? {} : { maxPages: opts.maxPages }),
  };
  return {
    url,
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    body,
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
    console.log(JSON.stringify({ url: request.url, body: request.body }, null, 2));
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
    console.error(`backfill-history: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
