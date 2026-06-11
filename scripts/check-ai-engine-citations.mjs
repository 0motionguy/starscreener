#!/usr/bin/env node
// TrendingRepo — AI engine citation probe.
//
// Aggregates `[ai-engine-hit]` log lines emitted by the Next.js middleware
// (src/middleware.ts → logAiEngineHitIfAny) from the production app
// container's docker logs. One line per request from an AI-engine crawler
// (GPT, Claude, Perplexity, Google AI Overview, Common Crawl, ByteDance,
// DeepSeek, Amazon, Apple-extended).
//
// Output groups by canonical UA label + lists the top-15 most-hit paths
// per UA. Use to answer:
//   - "Is trendingrepo actually being crawled by AI engines?"
//   - "Which surfaces are they pulling content from?"
//   - "Has GPTBot or Perplexity discovered the new /best/* surfaces?"
//
// USAGE
//   npm run citations             # default: last 24h
//   npm run citations -- --since=12h
//   npm run citations -- --since=7d --top=30
//
// IMPLEMENTATION
//   ssh toolbox 'docker logs --since <since> toolbox-trendingrepo-1 2>&1' |
//   filter to [ai-engine-hit] |
//   parse ua=, path=, ts= |
//   aggregate by ua → count + path histogram

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return def;
};

const SINCE = flag("since", "24h");
const TOP_PATHS = Number.parseInt(flag("top", "15"), 10);
const SSH_TARGET = flag("ssh", "toolbox");
const CONTAINER = flag("container", "toolbox-trendingrepo-1");

const LINE_RE = /\[ai-engine-hit\] ua=(?<ua>[^\s]+) path=(?<path>[^\s]+) ts=(?<ts>[^\s]+)/;

async function fetchDockerLogs() {
  return new Promise((resolve, reject) => {
    const cmd = "ssh";
    const cmdArgs = [
      SSH_TARGET,
      `docker logs --since ${SINCE} ${CONTAINER} 2>&1`,
    ];
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ssh exited ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function aggregate(rawLogs) {
  const byUa = new Map();
  const earliest = { ts: null };
  const latest = { ts: null };
  let total = 0;

  for (const line of rawLogs.split("\n")) {
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const { ua, path, ts } = match.groups;
    total += 1;
    if (!earliest.ts || ts < earliest.ts) earliest.ts = ts;
    if (!latest.ts || ts > latest.ts) latest.ts = ts;
    let bucket = byUa.get(ua);
    if (!bucket) {
      bucket = { count: 0, paths: new Map() };
      byUa.set(ua, bucket);
    }
    bucket.count += 1;
    bucket.paths.set(path, (bucket.paths.get(path) ?? 0) + 1);
  }

  return { total, byUa, earliest, latest };
}

function fmtPathHistogram(pathMap, topN) {
  return [...pathMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([p, n]) => `      ${String(n).padStart(5)} × ${p}`)
    .join("\n");
}

function render({ total, byUa, earliest, latest }) {
  const lines = [];
  lines.push(`# AI-engine citation probe — last ${SINCE}`);
  lines.push(`window=${earliest.ts ?? "(no hits)"} → ${latest.ts ?? "(no hits)"}`);
  lines.push(`total hits: ${total}`);
  lines.push(`distinct UAs: ${byUa.size}`);
  lines.push("");
  if (total === 0) {
    lines.push("(no AI-engine UA matched in the window)");
    lines.push("");
    lines.push("Possible reasons:");
    lines.push("  - The middleware hasn't been deployed yet — check git log for");
    lines.push("    `logAiEngineHitIfAny` and confirm app image > vps-20260611...");
    lines.push("  - AI engines aren't crawling within this window — try --since=7d");
    lines.push("  - All hits got hit by the cost-guard 429 path (counted separately)");
    return lines.join("\n");
  }
  const sorted = [...byUa.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [ua, bucket] of sorted) {
    const pct = ((bucket.count / total) * 100).toFixed(1);
    lines.push(`${ua}: ${bucket.count} hits (${pct}%)`);
    lines.push(`  top paths:`);
    lines.push(fmtPathHistogram(bucket.paths, TOP_PATHS));
    lines.push("");
  }
  return lines.join("\n");
}

(async () => {
  try {
    const logs = await fetchDockerLogs();
    const aggregated = aggregate(logs);
    console.log(render(aggregated));
    process.exit(0);
  } catch (err) {
    console.error("ai-engine citation probe failed:", err.message);
    process.exit(1);
  }
})();
