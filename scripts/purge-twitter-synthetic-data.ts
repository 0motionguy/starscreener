#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, ".data");

const FILES = [
  "twitter-repo-signals.jsonl",
  "twitter-scans.jsonl",
  "twitter-ingestion-audit.jsonl",
] as const;

interface CliOptions {
  runIds: string[];
}

interface PurgeableRecord {
  scanId?: string;
  latestScanId?: string;
  ingestionId?: string;
  agent?: {
    name?: string;
    runId?: string;
  };
  agentName?: string;
  agentRunId?: string;
  posts?: Array<{
    postId?: string;
    authorHandle?: string;
    postUrl?: string;
  }>;
  topPosts?: Array<{
    postId?: string;
    authorHandle?: string;
    postUrl?: string;
  }>;
}

function parseJsonl(raw: string): PurgeableRecord[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PurgeableRecord);
}

function stringifyJsonl(rows: PurgeableRecord[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

function isSyntheticAuthor(handle: string | undefined): boolean {
  if (!handle) return false;
  return /^trdev\d+_\d+$/i.test(handle) || /^dev[A-Z]$/i.test(handle) || handle === "example";
}

function isSyntheticPostId(postId: string | undefined): boolean {
  if (!postId) return false;
  return /^(bulk|bulk2|smoke|manual-smoke|local-smoke)-/i.test(postId);
}

function isSyntheticRecord(row: PurgeableRecord): boolean {
  const scanId = row.scanId ?? row.latestScanId ?? "";
  const runId = row.agent?.runId ?? row.agentRunId ?? "";
  const agentName = row.agent?.name ?? row.agentName ?? "";
  const posts = row.posts ?? row.topPosts ?? [];

  if (/(^|-)bulk-smoke/i.test(scanId) || /(^|-)local-smoke/i.test(scanId) || /(^|-)smoke/i.test(scanId)) {
    return true;
  }
  if (/bulk-smoke|local-smoke|manual-smoke|smoke-run/i.test(runId)) {
    return true;
  }
  if (/openclaw-twitter-scan-agent/i.test(agentName) && /smoke|bulk/i.test(`${runId} ${scanId}`)) {
    return true;
  }
  return posts.some((post) => isSyntheticAuthor(post.authorHandle) || isSyntheticPostId(post.postId));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { runIds: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run-id") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("missing value for --run-id");
      }
      options.runIds.push(value.trim());
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run purge:twitter:synthetic -- [--run-id RUN_ID]

Without --run-id, removes known smoke/bulk synthetic Twitter records.
With --run-id, also removes records whose scanId or agent runId contains RUN_ID.`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function matchesRunId(row: PurgeableRecord, runIds: string[]): boolean {
  if (runIds.length === 0) return false;
  const values = [
    row.scanId,
    row.latestScanId,
    row.agent?.runId,
    row.agentRunId,
  ].filter((value): value is string => Boolean(value));

  return runIds.some((runId) => values.some((value) => value.includes(runId)));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const backupDir = resolve(
    DATA_DIR,
    `backup-twitter-synthetic-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(backupDir, { recursive: true });

  for (const file of FILES) {
    const path = resolve(DATA_DIR, file);
    const backupPath = resolve(backupDir, file);
    let raw = "";
    try {
      raw = await readFile(path, "utf8");
    } catch {
      console.log(`[twitter-purge] ${file}: missing`);
      continue;
    }

    await copyFile(path, backupPath);
    const rows = parseJsonl(raw);
    const kept = rows.filter((row) => !isSyntheticRecord(row) && !matchesRunId(row, options.runIds));
    await writeFile(path, stringifyJsonl(kept), "utf8");
    console.log(
      `[twitter-purge] ${file}: kept=${kept.length} purged=${rows.length - kept.length} backup=${backupPath}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
