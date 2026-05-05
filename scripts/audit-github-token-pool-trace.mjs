#!/usr/bin/env node
// Audit evidence generator for AGN-194.
//
// Proves the runtime chain from GitHub token-pool callsites to admin
// visibility by scanning concrete files, then appending one immutable record
// to `.data/github-token-pool-trace.jsonl`.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const REQUIRED_PATTERNS = [
  {
    stage: "runtime-selection",
    file: "src/lib/github-fetch.ts",
    patterns: ["getGitHubTokenPool(", "pool.getNextToken(", "pool.recordRateLimit(", "pool.quarantine("],
  },
  {
    stage: "runtime-adapter-selection",
    file: "src/lib/pipeline/adapters/github-adapter.ts",
    patterns: ["getGitHubTokenPool(", "this.pool.getNextToken(", "this.pool.recordRateLimit(", "this.pool.quarantine("],
  },
  {
   stage: "redis-publish",
   file: "src/lib/github-token-pool.ts",
    patterns: ["poolRedisKeyFor(", "POOL_REDIS_KEY_PREFIX", "client.set(poolRedisKeyFor(tokenLabel), json"],
  },
  {
    stage: "admin-api-visibility",
    file: "src/app/api/admin/pool-state/route.ts",
    patterns: ["configuredGithubKeys()", "quarantineFromPublishedState(", "githubState("],
  },
  {
    stage: "admin-page-visibility",
    file: "src/app/admin/pool/page.tsx",
    patterns: ["getGitHubTokenPool(", "snapshot()", "quarantinedUntilMs"],
  },
  {
    stage: "admin-fleet-visibility",
    file: "src/app/admin/pool-aggregate/page.tsx",
    patterns: ["readAggregatePoolState(", "aggregate.perToken", "aggregate.quarantinedCount"],
  },
];

function lineOf(content, needle) {
  const idx = content.indexOf(needle);
  if (idx === -1) return null;
  return content.slice(0, idx).split("\n").length;
}

const stages = REQUIRED_PATTERNS.map((entry) => {
  const abs = resolve(ROOT, entry.file);
  const content = readFileSync(abs, "utf8");
  const hits = entry.patterns.map((needle) => ({
    needle,
    line: lineOf(content, needle),
  }));
  return {
    stage: entry.stage,
    file: entry.file,
    ok: hits.every((h) => h.line !== null),
    hits,
  };
});

const failed = stages.filter((s) => !s.ok);

const record = {
  ts: new Date().toISOString(),
  issue: "AGN-194",
  repo: "STARSCREENER",
  status: failed.length === 0 ? "ok" : "failed",
  stages,
};

const outDir = resolve(ROOT, ".data");
const outFile = resolve(outDir, "github-token-pool-trace.jsonl");
mkdirSync(outDir, { recursive: true });
appendFileSync(outFile, JSON.stringify(record) + "\n", "utf8");

console.log(`[trace] wrote append-only evidence: ${outFile}`);
console.log(`[trace] status=${record.status} stages=${stages.length} failed=${failed.length}`);
for (const stage of stages) {
  const mark = stage.ok ? "OK" : "FAIL";
  console.log(`[trace] ${mark} ${stage.stage} (${stage.file})`);
}

process.exit(failed.length === 0 ? 0 : 1);
