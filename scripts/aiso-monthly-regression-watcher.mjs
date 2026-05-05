#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET_URL = process.env.AISO_WATCH_URL || "https://trendingrepo.com";
const API_BASE = (process.env.AISO_API_BASE_URL || "https://aiso.tools").replace(/\/+$/, "");
const SUBMIT_PATH = process.env.AISO_SCAN_SUBMIT_PATH || "/api/scan";
const STATUS_PATH_TEMPLATE = process.env.AISO_SCAN_STATUS_PATH_TEMPLATE || "/api/scan/{scanId}";
const MODE = process.env.AISO_SCAN_MODE || "homepage";
const REGRESSION_THRESHOLD = Number(process.env.AISO_REGRESSION_THRESHOLD || 5);
const POLL_MS = Number(process.env.AISO_SCAN_POLL_MS || 2_000);
const TIMEOUT_MS = Number(process.env.AISO_SCAN_TIMEOUT_MS || 120_000);
const PARENT_ISSUE_ID = process.env.AISO_PARENT_ISSUE_ID || "AGN-798";
// AGN-1606: write to docs/archive/forensic/<YYYY-MM-DD>/ — top-level docs/forensic/ is archived.
function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function forensicDir(date = new Date()) {
  return resolve(process.cwd(), "docs", "archive", "forensic", dayBucket(date));
}
function forensicDirRel(date = new Date()) {
  return `docs/archive/forensic/${dayBucket(date)}`;
}

function toIsoStamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll("-", "");
}

function joinUrl(base, path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function statusPath(scanId) {
  const encoded = encodeURIComponent(scanId);
  const path = STATUS_PATH_TEMPLATE.includes("{scanId}")
    ? STATUS_PATH_TEMPLATE.replace(/\{scanId\}/g, encoded)
    : `${STATUS_PATH_TEMPLATE.replace(/\/+$/, "")}/${encoded}`;
  return path.startsWith("/") ? path : `/${path}`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function findPreviousMonthScan(scan) {
  const recent = Array.isArray(scan?.history?.recent) ? scan.history.recent : [];
  const current = new Date(scan?.completedAt || scan?.startedAt || Date.now());
  const currentMonth = current.getUTCMonth();
  const currentYear = current.getUTCFullYear();
  let best = null;
  for (const item of recent) {
    const completedAt = item?.completed_at;
    if (!completedAt || item?.status !== "completed") continue;
    if (item?.id === scan?.scanId) continue;
    const when = new Date(completedAt);
    if (Number.isNaN(when.valueOf())) continue;
    if (when.getUTCFullYear() === currentYear && when.getUTCMonth() === currentMonth) continue;
    if (!best || when > new Date(best.completed_at)) best = item;
  }
  return best;
}

function byKey(dimensions) {
  const map = new Map();
  for (const d of Array.isArray(dimensions) ? dimensions : []) {
    if (!d || typeof d.key !== "string") continue;
    if (!Number.isFinite(Number(d.score))) continue;
    map.set(d.key, d);
  }
  return map;
}

function extractTopFix(dimension) {
  const issues = Array.isArray(dimension?.details?.issues) ? dimension.details.issues : [];
  if (issues.length > 0) return String(issues[0]);
  const missed = Array.isArray(dimension?.details?.missing) ? dimension.details.missing : [];
  if (missed.length > 0) return `Add missing: ${missed[0]}`;
  return "Review this dimension's audit details and implement the first highest-impact missing item.";
}

async function submitScan() {
  const submitUrl = joinUrl(API_BASE, SUBMIT_PATH);
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: TARGET_URL, mode: MODE }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || !body?.scanId) {
    const err = new Error(`submit failed status=${res.status}`);
    err.details = { status: res.status, body };
    throw err;
  }
  return { scanId: body.scanId, submitUrl, submitResponse: body };
}

async function pollScan(scanId) {
  const deadline = Date.now() + TIMEOUT_MS;
  const statusUrl = joinUrl(API_BASE, statusPath(scanId));
  let last = null;
  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, { method: "GET", headers: { Accept: "application/json" } });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    last = { status: res.status, body };
    if (!res.ok) {
      await sleep(POLL_MS);
      continue;
    }
    const status = String(body?.status || "").toLowerCase();
    if (status === "completed" || status === "scan_failed" || status === "failed") return body;
    await sleep(POLL_MS);
  }
  const err = new Error(`scan timed out after ${TIMEOUT_MS}ms`);
  err.details = { last };
  throw err;
}

async function fetchScan(scanId) {
  const url = joinUrl(API_BASE, statusPath(scanId));
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`fetch scan ${scanId} failed status=${res.status}`);
    err.details = { status: res.status, body };
    throw err;
  }
  return body;
}

async function maybeCreateChildIssue(payload) {
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  if (!apiUrl || !apiKey) return { skipped: true, reason: "missing PAPERCLIP_API_URL/PAPERCLIP_API_KEY" };
  const target = `${apiUrl.replace(/\/+$/, "")}/api/issues`;
  const res = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) return { skipped: true, reason: `POST /api/issues failed status=${res.status}`, response: body };
  return { created: true, response: body };
}

async function main() {
  const startedAt = new Date();
  const FORENSIC_DIR = forensicDir(startedAt);
  const FORENSIC_DIR_REL = forensicDirRel(startedAt);
  mkdirSync(FORENSIC_DIR, { recursive: true });
  const stamp = toIsoStamp(startedAt);

  const submit = await submitScan();
  const scan = await pollScan(submit.scanId);
  const previous = findPreviousMonthScan(scan);
  const previousScan = previous?.id ? await fetchScan(previous.id) : null;

  const currentByKey = byKey(scan?.dimensions);
  const previousByKey = byKey(previousScan?.dimensions || []);
  const regressions = [];
  for (const [key, currentDim] of currentByKey.entries()) {
    const prev = previousByKey.get(key);
    if (!prev) continue;
    const delta = Number(currentDim.score) - Number(prev.score);
    if (delta <= -REGRESSION_THRESHOLD) {
      regressions.push({
        key,
        label: currentDim.label || key,
        previousScore: Number(prev.score),
        currentScore: Number(currentDim.score),
        delta,
        weight: Number(currentDim.weight ?? prev.weight ?? 0),
        firstFix: extractTopFix(currentDim),
      });
    }
  }

  regressions.sort((a, b) => a.delta - b.delta || b.weight - a.weight);
  const artifact = {
    capturedAt: startedAt.toISOString(),
    targetUrl: TARGET_URL,
    threshold: REGRESSION_THRESHOLD,
    scanId: scan?.scanId || submit.scanId,
    status: scan?.status || "unknown",
    score: Number(scan?.score ?? NaN),
    previousMonthlyScan: previous
      ? {
          id: previous.id,
          completedAt: previous.completed_at,
          score: Number(previous.score ?? NaN),
          tier: previous.tier ?? null,
        }
      : null,
    regressions,
    submit,
  };

  const jsonFile = `AGN-1263-AISO-MONTHLY-REGRESSION-${stamp}.json`;
  writeFileSync(resolve(FORENSIC_DIR, jsonFile), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const mdLines = [
    "",
    `## AGN-1263 monthly watcher run — ${startedAt.toISOString()}`,
    "",
    `- Target: \`${TARGET_URL}\``,
    `- Scan ID: \`${artifact.scanId}\``,
    `- Score: \`${Number.isFinite(artifact.score) ? artifact.score : "n/a"}\``,
    `- Previous monthly scan: \`${previous?.id || "none found"}\``,
    `- Regression threshold: \`>${REGRESSION_THRESHOLD}\` points drop`,
    `- Regression count: \`${regressions.length}\``,
    `- Artifact: \`${FORENSIC_DIR_REL}/${jsonFile}\``,
  ];
  if (regressions.length > 0) {
    mdLines.push("");
    mdLines.push("### Regressed dimensions (>5 point drop)");
    for (const row of regressions) {
      mdLines.push(
        `- \`${row.key}\` (${row.label}): ${row.previousScore} -> ${row.currentScore} (${row.delta}), first fix: ${row.firstFix}`,
      );
    }
  }
  appendFileSync(resolve(FORENSIC_DIR, "13-AISO-SELF-SCAN.md"), `${mdLines.join("\n")}\n`, "utf8");

  const issuePayloads = regressions.map((row) => ({
    parentIssueId: PARENT_ISSUE_ID,
    title: `[SEO-007] AISO regression: ${row.label} (${row.previousScore} -> ${row.currentScore})`,
    description: [
      `Automated monthly AISO regression watcher flagged \`${row.key}\`.`,
      "",
      `- Target: ${TARGET_URL}`,
      `- Current scan: ${artifact.scanId}`,
      `- Previous monthly scan: ${previous?.id || "unknown"}`,
      `- Delta: ${row.delta} points (threshold: <= -${REGRESSION_THRESHOLD})`,
      `- Evidence: ${FORENSIC_DIR_REL}/${jsonFile}`,
      "",
      `Recommended first fix: ${row.firstFix}`,
    ].join("\n"),
    priority: "medium",
  }));

  const issuePayloadFile = `AGN-1263-CHILD-ISSUE-PAYLOADS-${stamp}.json`;
  writeFileSync(resolve(FORENSIC_DIR, issuePayloadFile), `${JSON.stringify(issuePayloads, null, 2)}\n`, "utf8");

  const created = [];
  for (const payload of issuePayloads) {
    // Best-effort creation; when API schema/env differs, we still leave durable payload evidence.
    // eslint-disable-next-line no-await-in-loop
    created.push(await maybeCreateChildIssue(payload));
  }

  const summary = {
    ok: true,
    scanId: artifact.scanId,
    score: artifact.score,
    previousMonthlyScanId: previous?.id || null,
    regressions: regressions.length,
    payloadFile: `${FORENSIC_DIR_REL}/${issuePayloadFile}`,
    issueCreateResults: created,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  const output = {
    ok: false,
    error: err?.message || String(err),
    details: err?.details || null,
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
