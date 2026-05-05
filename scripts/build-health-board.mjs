#!/usr/bin/env node
// scripts/build-health-board.mjs
//
// Aggregates outputs from every guard script into a single grep-able status
// page at docs/_generated/health-board.md. Re-run with `npm run health:board`.
// Pure Node 22 ESM, no deps.
//
// Determinism: only the YYYY-MM-DD date is stamped (no timestamp), so
// re-running on the same day with the same source state produces identical
// output. CI gates can therefore enforce "regen if any source file changed"
// without spurious diffs.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(process.cwd());
const OUT_DIR = join(REPO_ROOT, "docs", "_generated");
const OUT_FILE = join(OUT_DIR, "health-board.md");
const ENGINE_JSON = join(OUT_DIR, "engine.json");

const GUARDS = [
  { name: "check-docs-freshness", script: "scripts/check-docs-freshness.mjs" },
  { name: "check-living-docs-have-frontmatter", script: "scripts/check-living-docs-have-frontmatter.mjs" },
  { name: "check-redis-keys", script: "scripts/check-redis-keys.mjs" },
  { name: "check-internal-doc-links", script: "scripts/check-internal-doc-links.mjs" },
  { name: "check-workflow-engine-coverage", script: "scripts/check-workflow-engine-coverage.mjs" },
  { name: "check-cron-overlap", script: "scripts/check-cron-overlap.mjs", optional: true },
];

function lastNonEmptyLine(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  return lines[lines.length - 1];
}

function runGuard(guard) {
  const abs = join(REPO_ROOT, guard.script);
  if (!existsSync(abs)) {
    if (guard.optional) {
      return { name: guard.name, status: "SKIP", summary: "script not present", exitCode: null };
    }
    return { name: guard.name, status: "FAIL", summary: `missing: ${guard.script}`, exitCode: null };
  }
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execSync(`node ${guard.script}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    exitCode = typeof err.status === "number" ? err.status : 1;
    stdout = err.stdout ? String(err.stdout) : "";
    stderr = err.stderr ? String(err.stderr) : "";
  }
  const combined = (stdout + "\n" + stderr).trim();
  const summary = lastNonEmptyLine(combined) || "(no output)";
  return {
    name: guard.name,
    status: exitCode === 0 ? "PASS" : "FAIL",
    summary,
    output: combined,
    exitCode,
  };
}

function readEngineCounts() {
  if (!existsSync(ENGINE_JSON)) {
    return { workflows: "?", crons: "?", fetchers: "?", envs: "?" };
  }
  try {
    const j = JSON.parse(readFileSync(ENGINE_JSON, "utf8"));
    return {
      workflows: Array.isArray(j.workflows) ? j.workflows.length : "?",
      crons: Array.isArray(j.cron_routes) ? j.cron_routes.length : "?",
      fetchers: Array.isArray(j.worker_fetchers) ? j.worker_fetchers.length : "?",
      envs: Array.isArray(j.env_vars) ? j.env_vars.length : "?",
    };
  } catch {
    return { workflows: "?", crons: "?", fetchers: "?", envs: "?" };
  }
}

function parseDocCounts(results) {
  // Pull from the frontmatter-guard summary line:
  //   FRONTMATTER: scanned=N living=N snapshot=N pointer=N violations=N
  // and the freshness-guard INFO line:
  //   INFO snapshot=N needs-verification=N archive=N unlabeled=N
  const counts = {
    living: "?",
    snapshot: "?",
    pointer: "?",
    archive: "?",
    unlabeled: "?",
  };
  const frontmatter = results.find((r) => r.name === "check-living-docs-have-frontmatter");
  if (frontmatter && frontmatter.output) {
    const m = frontmatter.output.match(/living=(\d+).*?snapshot=(\d+).*?pointer=(\d+)/);
    if (m) {
      counts.living = m[1];
      counts.snapshot = m[2];
      counts.pointer = m[3];
    }
  }
  const freshness = results.find((r) => r.name === "check-docs-freshness");
  if (freshness && freshness.output) {
    const m = freshness.output.match(/archive=(\d+).*?unlabeled=(\d+)/);
    if (m) {
      counts.archive = m[1];
      counts.unlabeled = m[2];
    }
  }
  return counts;
}

function escapePipe(s) {
  return String(s).replace(/\|/g, "\\|");
}

function toAscii(s) {
  // Strip non-ASCII so the generated doc stays grep-clean and diff-stable.
  return String(s)
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n\t]/g, "");
}

function buildMarkdown({ today, results, engine, docCounts }) {
  const rows = results
    .map((r) => `| ${escapePipe(toAscii(r.name))} | ${r.status} | ${escapePipe(toAscii(r.summary))} |`)
    .join("\n");

  // Frontmatter MUST satisfy scripts/check-docs-freshness.mjs +
  // scripts/check-living-docs-have-frontmatter.mjs:
  //   status: living -> last-verified: YYYY-MM-DD, verified-by: <who>
  // We re-purpose last-verified as the "last-generated" stamp -- the doc IS
  // verified each time it regenerates, since regen re-runs every guard.
  return `---
status: living
last-verified: ${today}
verified-by: scripts/build-health-board.mjs
---

# STARSCREENER repo health board

Auto-generated by \`scripts/build-health-board.mjs\`. Re-run with
\`npm run health:board\`. Do not hand-edit.

Date stamp uses \`YYYY-MM-DD\` only (no timestamp) so same-day re-runs are
deterministic; CI can gate on "regen if source files changed" without spurious
diffs.

## Guard scripts

| Script | Status | Summary |
|---|---|---|
${rows}

## Engine inventory (from docs/_generated/engine.json)

- ${engine.workflows} workflows
- ${engine.crons} cron API routes
- ${engine.fetchers} worker fetchers
- ${engine.envs} env vars

## Doc counts (from frontmatter audit)

- ${docCounts.living} living
- ${docCounts.snapshot} snapshot
- ${docCounts.pointer} pointer
- ${docCounts.archive} archive (in scope)
- ${docCounts.unlabeled} unlabeled
`;
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const results = GUARDS.map(runGuard);
  const engine = readEngineCounts();
  const docCounts = parseDocCounts(results);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const md = buildMarkdown({ today, results, engine, docCounts });
  writeFileSync(OUT_FILE, md, "utf8");

  // Console rollup so CI/operator runs see the snapshot.
  for (const r of results) {
    process.stdout.write(`${r.status.padEnd(4)} ${r.name}: ${r.summary}\n`);
  }
  process.stdout.write(`WROTE ${OUT_FILE}\n`);
}

main();
