#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOG_PATH = resolve(ROOT, ".data", "source-outage-backfill.jsonl");

const SOURCE_COMMANDS = {
  trending: ["node", "scripts/scrape-trending.mjs"],
  reddit: ["node", "scripts/scrape-reddit.mjs"],
  hackernews: ["node", "scripts/scrape-hackernews.mjs"],
  bluesky: ["node", "scripts/scrape-bluesky.mjs"],
  devto: ["node", "scripts/scrape-devto.mjs"],
  lobsters: ["node", "scripts/scrape-lobsters.mjs"],
  producthunt: ["node", "scripts/scrape-producthunt.mjs"],
  npm: ["node", "scripts/scrape-npm.mjs"],
  huggingface_models: ["node", "scripts/scrape-huggingface.mjs"],
  huggingface_datasets: ["node", "scripts/scrape-huggingface-datasets.mjs"],
  huggingface_spaces: ["node", "scripts/scrape-huggingface-spaces.mjs"],
  arxiv: ["node", "scripts/scrape-arxiv.mjs"],
  funding: ["node", "scripts/scrape-funding-news.mjs"],
  twitter: ["npm", "run", "collect:twitter"],
};

function parseArgs(argv) {
  const out = { source: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      out.source = String(argv[i + 1] ?? "").trim();
      i += 1;
    } else if (arg.startsWith("--source=")) {
      out.source = arg.slice("--source=".length).trim();
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!out.source) {
    throw new Error("--source is required");
  }
  if (!SOURCE_COMMANDS[out.source]) {
    throw new Error(
      `unsupported source "${out.source}" (allowed: ${Object.keys(SOURCE_COMMANDS).join(", ")})`,
    );
  }
  return out;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/source-outage-backfill.mjs --source <name> [--dry-run]",
      `Supported sources: ${Object.keys(SOURCE_COMMANDS).join(", ")}`,
    ].join("\n"),
  );
}

function redactSecrets(text) {
  let out = String(text ?? "");
  const candidates = [
    process.env.CRON_SECRET,
    process.env.REDIS_URL,
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
    process.env.APIFY_API_TOKEN,
    process.env.BLUESKY_APP_PASSWORD,
    process.env.TRUSTMRR_API_KEY,
    process.env.PRODUCTHUNT_TOKEN,
  ].filter(Boolean);
  for (const secret of candidates) out = out.split(secret).join("[REDACTED]");
  return out;
}

function classifyFailure(text) {
  const v = String(text ?? "").toLowerCase();
  if (v.includes("rate limit") || v.includes("429") || v.includes("secondary rate")) return "rate_limit";
  if (v.includes("401") || v.includes("403") || v.includes("forbidden") || v.includes("unauthorized")) return "auth";
  if (v.includes("econnrefused") || v.includes("etimedout") || v.includes("fetch failed") || v.includes("socket")) return "network";
  if (v.includes("5xx") || v.includes("503") || v.includes("502") || v.includes("upstream")) return "upstream";
  return "unknown";
}

async function appendEvidence(entry) {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

async function runCommand(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: ROOT, shell: false, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code, signal) => {
      resolveRun({ code: code ?? 1, signal: signal ?? null, stdout, stderr });
    });
    child.on("error", (err) => {
      stderr += `${err?.message ?? String(err)}\n`;
      resolveRun({ code: 1, signal: null, stdout, stderr });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : "local";
  const [command, ...cmdArgs] = SOURCE_COMMANDS[args.source];

  const baseEntry = {
    ts: startedAt,
    runId,
    source: args.source,
    command: [command, ...cmdArgs].join(" "),
    mode: args.dryRun ? "dry_run" : "execute",
    actor: process.env.GITHUB_ACTOR ?? "local",
  };

  if (args.dryRun) {
    await appendEvidence({ ...baseEntry, status: "skipped", category: "dry_run" });
    console.log(`[outage-backfill] dry-run source=${args.source} command="${baseEntry.command}"`);
    return;
  }

  const result = await runCommand(command, cmdArgs);
  const combined = `${result.stdout}\n${result.stderr}`;
  const cleaned = redactSecrets(combined).slice(-2000);
  const success = result.code === 0;
  const category = success ? "ok" : classifyFailure(combined);
  const finishedAt = new Date().toISOString();

  await appendEvidence({
    ...baseEntry,
    finishedAt,
    status: success ? "ok" : "failed",
    exitCode: result.code,
    signal: result.signal,
    category,
    tail: cleaned,
  });

  if (!success) {
    throw new Error(`[outage-backfill] source=${args.source} failed category=${category} exit=${result.code}`);
  }
  console.log(`[outage-backfill] source=${args.source} completed`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});

