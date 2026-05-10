#!/usr/bin/env node
// Fail closed on API routes that are known to be private, user-specific, cron,
// webhook, or mutating control-plane surfaces but advertise static/public
// caching. Public read APIs are intentionally outside this guard.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "src/app/api");

const SENSITIVE_ROUTE_PREFIXES = [
  "src/app/api/_internal/",
  "src/app/api/%5Finternal/",
  "src/app/api/admin/",
  "src/app/api/auth/",
  "src/app/api/checkout/",
  "src/app/api/cron/",
  "src/app/api/export/",
  "src/app/api/me/",
  "src/app/api/webhooks/",
  "src/app/api/watchlist/private/",
  "src/app/api/referrals/me/",
  "src/app/api/mcp/usage/",
  "src/app/api/mcp/record-call/",
  "src/app/api/pipeline/alerts/",
  "src/app/api/pipeline/backfill-history/",
  "src/app/api/pipeline/cleanup/",
  "src/app/api/pipeline/deltas/",
  "src/app/api/pipeline/freshness/",
  "src/app/api/pipeline/ingest/",
  "src/app/api/pipeline/persist/",
  "src/app/api/pipeline/profiles/enrich/",
  "src/app/api/pipeline/rebuild/",
  "src/app/api/pipeline/recompute/",
  "src/app/api/pipeline/refresh/",
  "src/app/api/pipeline/sidebar-overlay/",
];

async function* walkRoutes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRoutes(full);
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full;
    }
  }
}

function isSensitiveRoute(rel) {
  return SENSITIVE_ROUTE_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function hasPublicCache(content) {
  return /Cache-Control["']?\s*:\s*["'][^"']*\bpublic\b/i.test(content);
}

const violations = [];

for await (const file of walkRoutes(API_DIR)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const content = await readFile(file, "utf8");
  const sensitive = isSensitiveRoute(rel);
  const usesAdminAuth = /\bverifyAdminAuth\b|\badminAuthFailureResponse\b/.test(
    content,
  );

  if (sensitive && /export\s+const\s+revalidate\s*=/.test(content)) {
    violations.push([rel, "sensitive API route exports revalidate"]);
  }
  if (
    sensitive &&
    /export\s+const\s+dynamic\s*=\s*["']force-static["']/.test(content)
  ) {
    violations.push([rel, "sensitive API route is force-static"]);
  }
  if (sensitive && hasPublicCache(content)) {
    violations.push([rel, "sensitive API route sets public Cache-Control"]);
  }
  if (
    usesAdminAuth &&
    hasPublicCache(content) &&
    !/private,\s*no-store/i.test(content)
  ) {
    violations.push([
      rel,
      "admin-aware route has public cache without an internal no-store variant",
    ]);
  }
}

if (violations.length === 0) {
  console.log("[check-api-cache-contracts] OK");
  process.exit(0);
}

console.error(
  `[check-api-cache-contracts] FAIL - ${violations.length} violation(s)`,
);
for (const [file, reason] of violations) {
  console.error(`  ${file}: ${reason}`);
}
process.exit(1);
