#!/usr/bin/env node
// Derive engine inventory from source-of-truth files.
// Pure Node 22 ESM, no external deps. Outputs docs/_generated/engine.{json,md}.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const OUT_DIR = join(ROOT, "docs", "_generated");

const parseFailures = [];

function walk(dir, predicate, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (entry.isFile() && predicate(full)) acc.push(full);
  }
  return acc;
}

function readSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    parseFailures.push({ file: path, reason: String(err && err.message ? err.message : err) });
    return "";
  }
}

// ── Workflows ────────────────────────────────────────────────────────────────
function parseWorkflow(path) {
  const text = readSafe(path);
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const filename = path.split(sep).pop();
  let name = "";
  const crons = [];
  const triggers = new Set();
  let inOn = false;
  let onIndent = -1;
  let inSchedule = false;
  let scheduleIndent = -1;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const nameMatch = /^name\s*:\s*(.*?)\s*$/.exec(line);
    if (nameMatch && !name && !line.startsWith(" ")) {
      name = nameMatch[1].replace(/^["']|["']$/g, "");
      continue;
    }

    const indent = line.match(/^ */)[0].length;

    if (/^on\s*:/.test(line)) {
      inOn = true;
      onIndent = indent;
      // inline form: `on: push` or `on: [push, pull_request]`
      const inline = line.replace(/^on\s*:\s*/, "").trim();
      if (inline && inline !== "") {
        const arr = inline.match(/\[(.*?)\]/);
        if (arr) {
          arr[1].split(",").forEach((t) => {
            const v = t.trim().replace(/['"]/g, "");
            if (v) triggers.add(v);
          });
          inOn = false;
        } else if (!inline.startsWith("|") && !inline.startsWith(">")) {
          triggers.add(inline.replace(/['"]/g, ""));
          inOn = false;
        }
      }
      continue;
    }

    if (inOn) {
      if (indent <= onIndent && trimmed && !trimmed.startsWith("-")) {
        // dropped out of `on:` block
        if (!/^(on|jobs|name|permissions|concurrency|env|defaults)\s*:/.test(line)) {
          inOn = false;
        } else {
          inOn = false;
        }
      } else {
        const triggerMatch = /^\s+([a-z_]+)\s*:/.exec(line);
        if (triggerMatch && indent === onIndent + 2) {
          triggers.add(triggerMatch[1]);
          inSchedule = triggerMatch[1] === "schedule";
          scheduleIndent = indent;
          continue;
        }
        if (inSchedule) {
          const cronMatch = /^\s*-\s*cron\s*:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
          if (cronMatch) crons.push(cronMatch[1].trim());
          if (indent <= scheduleIndent && !/^\s*-/.test(line) && trimmed) {
            inSchedule = false;
          }
        }
      }
    }
  }

  if (!name) name = filename.replace(/\.ya?ml$/, "");
  return { file: filename, name, crons, triggers: [...triggers].sort() };
}

const workflowsDir = join(ROOT, ".github", "workflows");
const workflowFiles = walk(workflowsDir, (p) => /\.ya?ml$/i.test(p));
const workflows = workflowFiles.map(parseWorkflow).filter(Boolean).sort((a, b) => a.file.localeCompare(b.file));

// ── Cron routes ──────────────────────────────────────────────────────────────
const cronRoutesDir = join(ROOT, "src", "app", "api", "cron");
const cronRouteFiles = walk(cronRoutesDir, (p) => p.endsWith(`${sep}route.ts`));
const cronRoutes = cronRouteFiles
  .map((full) => {
    const text = readSafe(full);
    const rel = relative(ROOT, full).split(sep).join("/");
    const auth = /\bverifyCronAuth\b/.test(text) ? "verifyCronAuth" : "none";
    return { path: rel, auth };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

// ── Worker fetchers ──────────────────────────────────────────────────────────
const fetchersDir = join(ROOT, "apps", "trendingrepo-worker", "src", "fetchers");
let workerFetchers = [];
try {
  workerFetchers = readdirSync(fetchersDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((n) => {
      try {
        statSync(join(fetchersDir, n, "index.ts"));
        return true;
      } catch {
        return false;
      }
    })
    .sort();
} catch {
  workerFetchers = [];
}

// ── Env vars ─────────────────────────────────────────────────────────────────
const envSet = new Set();
const envExample = readSafe(join(ROOT, ".env.example"));
for (const line of envExample.split(/\r?\n/)) {
  const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
  if (m) envSet.add(m[1]);
}
const envTs = readSafe(join(ROOT, "src", "lib", "env.ts"));
const schemaMatch = /z\.object\(\{([\s\S]*?)\n\}\)/.exec(envTs);
if (schemaMatch) {
  for (const m of schemaMatch[1].matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:/gm)) envSet.add(m[1]);
}
const envVars = [...envSet].sort();

// ── Emit ─────────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const generated_at = new Date().toISOString();
const json = { generated_at, workflows, cron_routes: cronRoutes, worker_fetchers: workerFetchers, env_vars: envVars };
writeFileSync(join(OUT_DIR, "engine.json"), JSON.stringify(json, null, 2) + "\n", "utf8");

const lines = [];
const auditDate = generated_at.slice(0, 10);
lines.push("---");
lines.push("status: snapshot");
lines.push(`audit-date: ${auditDate}`);
lines.push("verified-by: scripts/derive-engine-inventory.mjs");
lines.push("reason: auto-generated engine inventory; tracked per ADR 0005");
lines.push("---");
lines.push("");
lines.push(`# Engine inventory - auto-generated ${generated_at}`);
lines.push("");
lines.push(`## Workflows (${workflows.length})`);
lines.push("");
lines.push("| file | name | cron | triggers |");
lines.push("| --- | --- | --- | --- |");
for (const w of workflows) {
  const cron = w.crons.length ? w.crons.map((c) => `\`${c}\``).join("<br>") : "-";
  const trig = w.triggers.length ? w.triggers.join(", ") : "-";
  lines.push(`| ${w.file} | ${w.name} | ${cron} | ${trig} |`);
}
lines.push("");
lines.push(`## Cron routes (${cronRoutes.length})`);
lines.push("");
lines.push("| path | auth |");
lines.push("| --- | --- |");
for (const r of cronRoutes) lines.push(`| ${r.path} | ${r.auth} |`);
lines.push("");
lines.push(`## Worker fetchers (${workerFetchers.length})`);
lines.push("");
for (const f of workerFetchers) lines.push(`- ${f}`);
lines.push("");
lines.push(`## Env vars (${envVars.length})`);
lines.push("");
for (const e of envVars) lines.push(`- \`${e}\``);
lines.push("");
if (parseFailures.length) {
  lines.push(`## Parse failures (${parseFailures.length})`);
  lines.push("");
  for (const f of parseFailures) lines.push(`- ${f.file}: ${f.reason}`);
  lines.push("");
}
writeFileSync(join(OUT_DIR, "engine.md"), lines.join("\n"), "utf8");

console.log(
  `engine inventory: workflows=${workflows.length} cron_routes=${cronRoutes.length} worker_fetchers=${workerFetchers.length} env_vars=${envVars.length} parse_failures=${parseFailures.length}`,
);
console.log(`wrote ${join(OUT_DIR, "engine.json")}`);
console.log(`wrote ${join(OUT_DIR, "engine.md")}`);
