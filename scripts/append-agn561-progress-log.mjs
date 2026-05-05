#!/usr/bin/env node
/**
 * Append one progress-log line to AGN-561 issue description.
 *
 * Usage:
 *   node scripts/append-agn561-progress-log.mjs --done 412 --total 600 --delta 8
 *   node scripts/append-agn561-progress-log.mjs --done 412 --total 600 --delta 8 --dry-run
 *   node scripts/append-agn561-progress-log.mjs --from-checklist --delta 8
 *
 * Env:
 *   PAPERCLIP_API_URL
 *   PAPERCLIP_API_KEY
 *   PAPERCLIP_COMPANY_ID
 * Optional:
 *   AGN_561_ISSUE_ID
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CHECKLIST_FILE = resolve(
  process.cwd(),
  "data",
  "repo-autocompletion-checklist.json",
);

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (k === "--from-checklist") {
      args.fromChecklist = true;
      continue;
    }
    const v = argv[i + 1];
    if (k === "--done") args.done = Number(v);
    if (k === "--total") args.total = Number(v);
    if (k === "--delta") args.delta = Number(v);
    if (k === "--done" || k === "--total" || k === "--delta") i += 1;
  }
  return args;
}

function assertNumber(n, name) {
  if (!Number.isFinite(n)) throw new Error(`missing/invalid --${name}`);
}

function minuteIsoZ(date = new Date()) {
  return date.toISOString().slice(0, 16) + "Z";
}

function buildLogLine(done, total, delta, iso) {
  return `- ${iso} - ${done}/${total} ticked off (+${delta} this cycle)`;
}

async function readChecklistCounters() {
  const parsed = JSON.parse(await readFile(CHECKLIST_FILE, "utf8"));
  const done = Number(parsed?.summary?.tickedOff);
  const total = Number(parsed?.summary?.totalRepos);
  if (!Number.isFinite(done) || !Number.isFinite(total)) {
    throw new Error(
      "repo-autocompletion-checklist summary.tickedOff/summary.totalRepos missing",
    );
  }
  return { done, total };
}

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function upsertProgressLog(description, line) {
  const body = description ?? "";
  const header = "## Progress Log";
  if (!body.includes(header)) {
    const trimmed = body.trimEnd();
    return `${trimmed}\n\n${header}\n${line}\n`;
  }

  const lines = body.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() === header);
  if (headerIdx < 0) return `${body}\n${line}\n`;

  // Insert immediately after existing bullet block under Progress Log.
  let insertIdx = headerIdx + 1;
  while (insertIdx < lines.length) {
    const current = lines[insertIdx];
    if (current.trim() === "" || current.trimStart().startsWith("- ")) {
      insertIdx += 1;
      continue;
    }
    if (current.trimStart().startsWith("## ")) break;
    insertIdx += 1;
  }
  lines.splice(insertIdx, 0, line);
  return lines.join("\n");
}

async function resolveAgn561IssueId(apiUrl, headers, companyId) {
  if (process.env.AGN_561_ISSUE_ID) return process.env.AGN_561_ISSUE_ID;
  const url = `${apiUrl}/api/companies/${companyId}/issues?identifier=AGN-561`;
  const json = await requestJson(url, { headers });
  const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
  const match = items.find((it) => it?.identifier === "AGN-561");
  if (!match?.id) throw new Error("AGN-561 issue id not found");
  return match.id;
}

async function main() {
  const { done, total, delta, dryRun, fromChecklist } = parseArgs(process.argv);
  let resolvedDone = done;
  let resolvedTotal = total;
  if (fromChecklist) {
    const counters = await readChecklistCounters();
    resolvedDone = counters.done;
    resolvedTotal = counters.total;
  }
  assertNumber(resolvedDone, "done");
  assertNumber(resolvedTotal, "total");
  assertNumber(delta, "delta");

  const iso = minuteIsoZ();
  const line = buildLogLine(resolvedDone, resolvedTotal, delta, iso);
  console.log(line);
  if (dryRun) return;

  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  if (!apiUrl || !apiKey || !companyId) {
    throw new Error("missing PAPERCLIP_API_URL/PAPERCLIP_API_KEY/PAPERCLIP_COMPANY_ID");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const issueId = await resolveAgn561IssueId(apiUrl, headers, companyId);
  const issue = await requestJson(`${apiUrl}/api/issues/${issueId}`, { headers });
  const description = issue?.description ?? "";
  const updated = upsertProgressLog(description, line);
  await requestJson(`${apiUrl}/api/issues/${issueId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ description: updated }),
  });
}

main().catch((err) => {
  console.error(`[agn561-progress] ${err?.message || String(err)}`);
  process.exit(1);
});
