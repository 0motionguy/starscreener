#!/usr/bin/env node
// AGN-237 audit evidence:
// Assess GitHub token-pool quota visibility coverage for collector workflows/scripts
// and append one immutable record to `.data/github-collector-quota-visibility.jsonl`.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const WORKFLOWS = [
  ".github/workflows/scrape-trending.yml",
  ".github/workflows/collect-twitter.yml",
  ".github/workflows/refresh-star-activity.yml",
  ".github/workflows/enrich-repo-profiles.yml",
  ".github/workflows/scrape-producthunt.yml",
];

const SCRIPTS = [
  "scripts/scrape-trending.mjs",
  "scripts/collect-twitter-signals.ts",
  "scripts/append-star-activity.mjs",
  "scripts/fetch-repo-metadata.mjs",
  "scripts/enrich-repo-profiles.mjs",
  "scripts/scrape-producthunt.mjs",
  "scripts/_github-token-pool-mini.mjs",
];

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function hasAny(content, needles) {
  return needles.some((n) => content.includes(n));
}

function auditWorkflow(rel) {
  const content = read(rel);
  return {
    file: rel,
    hasGhTokenPoolEnv: hasAny(content, ["GH_TOKEN_POOL:", "GITHUB_TOKEN_POOL:"]),
    hasGithubTokenEnv: content.includes("GITHUB_TOKEN:"),
  };
}

function classifyScript(rel) {
  const content = read(rel);
  const hasRuntimePool = hasAny(content, ["getGitHubTokenPool(", "pool.recordRateLimit("]);
  const hasMiniPool = hasAny(content, ["loadGithubPool(", "pickToken(", "_github-token-pool-mini"]);
  const hasDirectGitHubAuth = hasAny(content, [
    "process.env.GITHUB_TOKEN",
    "Authorization: `Bearer ${token}`",
    "Authorization: `token ${token}`",
    'Authorization: "Bearer " + token',
    'Authorization: "token " + token',
  ]);
  const hasRateLimitHeaderVisibility = hasAny(content.toLowerCase(), [
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-ratelimit-limit",
  ]);
  return {
    file: rel,
    mode: hasRuntimePool ? "runtime-pool" : hasMiniPool ? "mini-pool" : hasDirectGitHubAuth ? "direct-token" : "unknown",
    hasRateLimitHeaderVisibility,
  };
}

const workflowAudit = WORKFLOWS.map(auditWorkflow);
const scriptAudit = SCRIPTS.map(classifyScript);

const gaps = [];
for (const wf of workflowAudit) {
  if (!wf.hasGhTokenPoolEnv && wf.hasGithubTokenEnv) {
    gaps.push({ type: "workflow-missing-pool-env", file: wf.file });
  }
}
for (const script of scriptAudit) {
  if ((script.mode === "mini-pool" || script.mode === "direct-token") && !script.hasRateLimitHeaderVisibility) {
    gaps.push({ type: "script-missing-rate-limit-visibility", file: script.file, mode: script.mode });
  }
}

const out = {
  ts: new Date().toISOString(),
  issue: "AGN-237",
  status: gaps.length === 0 ? "ok" : "gaps_found",
  workflowAudit,
  scriptAudit,
  gaps,
};

const outDir = resolve(ROOT, ".data");
const outFile = resolve(outDir, "github-collector-quota-visibility.jsonl");
mkdirSync(outDir, { recursive: true });
appendFileSync(outFile, JSON.stringify(out) + "\n", "utf8");

console.log(`[audit] wrote append-only evidence: ${outFile}`);
console.log(`[audit] status=${out.status} workflows=${workflowAudit.length} scripts=${scriptAudit.length} gaps=${gaps.length}`);
for (const gap of gaps) {
  console.log(`[audit] GAP ${gap.type} ${gap.file}`);
}

process.exit(0);
