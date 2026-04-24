#!/usr/bin/env node
// Seed public repos for AI-unicorn brands into `.data/repos.jsonl`.
//
// Context
// -------
// The funding-news batch is dominated by closed-source AI unicorns
// (Cursor, Groq, Anduril, Mistral, Together AI, ElevenLabs, Perplexity,
// Cohere, Replicate, xAI, Runway, Stability AI, Scale AI, DeepSeek,
// Anthropic, OpenAI, ...) whose public GitHub orgs are not yet in
// `.data/repos.jsonl`. With no candidate row for them, the funding matcher
// cannot recall any of those events even with aliases in place, because the
// alias registry only fires on repos that already exist in the candidate
// set built by `scripts/reconcile-repo-stores.mjs`.
//
// This script adds one anchor public repo per unicorn brand so
// downstream reconciliation + alias expansion unblocks recall. For each
// owner/repo, we fetch `https://api.github.com/repos/owner/repo` and build
// a Repo record matching the shape on disk (see src/lib/types.ts + the
// first line of `.data/repos.jsonl`).
//
// Behavior
// --------
//   - Idempotent: repos whose `id` (slug-of-fullName) already appears in
//     `.data/repos.jsonl` are skipped.
//   - Failure-tolerant: a 404/403 or bad JSON from GitHub is logged and
//     skipped — other entries still ingest.
//   - Rate-limit safe: sleeps 600ms between calls; hard-cap 40 entries per
//     run. Uses GITHUB_TOKEN when available to raise the unauth ceiling
//     (60/hr → 5000/hr).
//   - Append-only: writes to `.data/repos.jsonl` via `appendFileSync` with
//     a single-writer sequential loop (the script is one-shot).
//
// Run:
//   node scripts/seed-ai-unicorn-repos.mjs           # uses hardcoded list
//   node scripts/seed-ai-unicorn-repos.mjs a/b c/d   # or CLI-provided pairs
//
// Env:
//   GITHUB_TOKEN — bumps rate limit, included from .env.local via @next/env
//   if available; otherwise read from process.env directly.

import {
  appendFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSONL_FILE = resolve(ROOT, ".data", "repos.jsonl");

// Hardcoded target list — one anchor repo per unicorn brand that appears in
// the current funding-news batch (or is likely to imminently). Trimmed to
// fit under the 60/hr unauth budget + the 40-entry hard cap.
const DEFAULT_TARGETS = [
  // Closed-source but ships public SDKs / reference repos:
  "anthropics/anthropic-sdk-python",
  "anthropics/claude-code",
  "openai/openai-python",
  "openai/openai-cookbook",
  "mistralai/mistral-inference",
  "mistralai/client-python",
  "groq/groq-python",
  "groq/groq-typescript",
  "togethercomputer/together-python",
  "togethercomputer/OpenChatKit",
  "elevenlabs/elevenlabs-python",
  "ppl-ai/api-cookbook",
  "cohere-ai/cohere-python",
  "replicate/replicate-python",
  "getcursor/cursor",
  "xai-org/grok-1",
  "runwayml/guided-inpainting",
  "Stability-AI/stablediffusion",
  "Stability-AI/StableCascade",
  "deepseek-ai/DeepSeek-R1",
  "NVIDIA/NeMo",
  "google-deepmind/gemma",
];

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const pairs = argv.filter((t) => typeof t === "string" && t.includes("/"));
  return pairs.length > 0 ? pairs : DEFAULT_TARGETS;
}

async function loadEnvOpportunistically() {
  if (process.env.GITHUB_TOKEN) return; // already set
  try {
    const mod = await import("@next/env");
    const loader = mod?.default?.loadEnvConfig ?? mod?.loadEnvConfig;
    if (typeof loader === "function") loader(ROOT);
  } catch {
    // @next/env missing — fine, operator sets GITHUB_TOKEN manually if needed.
  }
}

// ---------------------------------------------------------------------------
// Existing repos (for idempotence)
// ---------------------------------------------------------------------------

function slugToId(fullName) {
  // Mirrors the id format used across the pipeline: "owner--name".
  // Existing example: "ollama/ollama" → "ollama--ollama".
  return fullName.replace("/", "--");
}

function loadExistingIds() {
  const out = new Set();
  if (!existsSync(JSONL_FILE)) return out;
  const raw = readFileSync(JSONL_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (rec && typeof rec.id === "string") out.add(rec.id.toLowerCase());
      if (rec && typeof rec.fullName === "string") {
        out.add(slugToId(rec.fullName).toLowerCase());
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// GitHub fetch + record shaping
// ---------------------------------------------------------------------------

async function fetchRepoMeta(fullName) {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return { ok: false, status: 0, reason: "malformed" };

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "starscreener-seed-ai-unicorn",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers,
    });
  } catch (err) {
    return { ok: false, status: 0, reason: `network: ${err?.message ?? err}` };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: response.statusText };
  }
  let raw;
  try {
    raw = await response.json();
  } catch (err) {
    return { ok: false, status: response.status, reason: `json: ${err?.message ?? err}` };
  }
  if (!raw || typeof raw !== "object" || typeof raw.full_name !== "string") {
    return { ok: false, status: response.status, reason: "shape" };
  }
  return { ok: true, data: raw };
}

/**
 * Build a Repo record matching the shape of `.data/repos.jsonl` rows.
 * Fields we can't derive from the single repos REST call (deltas, sparkline,
 * momentum, rank, …) default to zero / "stable" so they don't fake signal.
 * The reconciler + enrich passes + derived-repos assembly will top these up
 * over subsequent pipeline runs.
 */
function buildRepoRecord(data) {
  const fullName = typeof data.full_name === "string" ? data.full_name : "";
  const owner = typeof data.owner?.login === "string" ? data.owner.login : fullName.split("/")[0] ?? "";
  const name = typeof data.name === "string" ? data.name : fullName.split("/")[1] ?? "";
  const description = typeof data.description === "string" ? data.description : "";
  const topics = Array.isArray(data.topics)
    ? data.topics.filter((t) => typeof t === "string")
    : [];
  const language = typeof data.language === "string" ? data.language : null;
  const stars = Number.isFinite(data.stargazers_count) ? data.stargazers_count : 0;
  const forks = Number.isFinite(data.forks_count) ? data.forks_count : 0;
  const openIssues = Number.isFinite(data.open_issues_count) ? data.open_issues_count : 0;
  const createdAt = typeof data.created_at === "string" ? data.created_at : "";
  const pushedAt = typeof data.pushed_at === "string" ? data.pushed_at : createdAt;
  const url = typeof data.html_url === "string" ? data.html_url : `https://github.com/${fullName}`;
  const ownerAvatarUrl =
    typeof data.owner?.avatar_url === "string" ? data.owner.avatar_url : "";
  const archived = Boolean(data.archived);

  // Categorization: the existing pipeline tags AI/LLM-ish repos into a small
  // set of categoryIds. For this seed pass we use a generic "ai-tooling"
  // bucket so the reconciler + classification pass can refine later.
  const categoryId = "ai-tooling";

  return {
    id: slugToId(fullName),
    fullName,
    name,
    owner,
    ownerAvatarUrl,
    description,
    url,
    language,
    topics,
    categoryId,
    stars,
    forks,
    contributors: 0,
    openIssues,
    lastCommitAt: pushedAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: ["ai-unicorn-seed"],
    hasMovementData: false,
    archived,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildRepoRecordFromFixture(data) {
  // Exposed for tests — proxies the internal buildRepoRecord so fixtures can
  // exercise shape validation without hitting the network.
  return buildRepoRecord(data);
}

async function main() {
  await loadEnvOpportunistically();

  const targets = parseArgs(process.argv.slice(2));
  const capped = targets.slice(0, 40);
  const existingIds = loadExistingIds();

  let seeded = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  const failures = [];
  const seededList = [];

  // Pre-filter dedupes so idempotent reruns don't hit the network.
  const toProcess = capped.filter((fullName) => {
    const id = slugToId(fullName).toLowerCase();
    if (existingIds.has(id) || existingIds.has(fullName.toLowerCase())) {
      skippedDuplicate++;
      return false;
    }
    return true;
  });

  for (let i = 0; i < toProcess.length; i++) {
    const fullName = toProcess[i];
    // Respect GitHub's unauthenticated rate limit. 600ms between calls
    // keeps us at ~100 calls / min, safely under the 5000/hr authed cap.
    if (i > 0) await sleep(600);

    const res = await fetchRepoMeta(fullName);
    if (!res.ok) {
      failed++;
      failures.push({ fullName, status: res.status, reason: res.reason });
      continue;
    }
    const record = buildRepoRecord(res.data);
    if (!record.fullName) {
      failed++;
      failures.push({ fullName, status: res.status, reason: "empty fullName" });
      continue;
    }
    // Double-check against the exact fullName returned by GitHub (renames).
    const actualId = slugToId(record.fullName).toLowerCase();
    if (existingIds.has(actualId)) {
      skippedDuplicate++;
      continue;
    }
    try {
      appendFileSync(JSONL_FILE, `${JSON.stringify(record)}\n`, "utf8");
    } catch (err) {
      failed++;
      failures.push({ fullName, status: 0, reason: `write: ${err?.message ?? err}` });
      continue;
    }
    existingIds.add(actualId);
    seededList.push({ fullName: record.fullName, stars: record.stars });
    seeded++;
  }

  console.log(
    `[seed-ai-unicorn-repos] seeded: ${seeded}, skipped-duplicate: ${skippedDuplicate}, failed: ${failed}`,
  );
  if (seededList.length > 0) {
    console.log(`[seed-ai-unicorn-repos] added:`);
    for (const s of seededList.sort((a, b) => b.stars - a.stars)) {
      console.log(`  ${s.fullName.padEnd(40)} ${String(s.stars).padStart(7)} stars`);
    }
  }
  if (failures.length > 0) {
    console.log(`[seed-ai-unicorn-repos] failures:`);
    for (const f of failures) {
      console.log(`  ${f.fullName.padEnd(40)} status=${f.status} reason=${f.reason}`);
    }
  }
}

// Allow the module to be imported from tests without running main().
// Windows + Unix: compare the basename of process.argv[1] against this file.
function shouldRunMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  // Direct module URL check (Unix).
  try {
    const entryUrl = new URL(`file://${entry.replace(/\\/g, "/")}`).href;
    if (import.meta.url === entryUrl) return true;
  } catch {
    // fall through
  }
  // Windows path tolerance — just check basename.
  const base = entry.split(/[\\/]/).pop() ?? "";
  return base === "seed-ai-unicorn-repos.mjs";
}

if (shouldRunMain()) {
  main().catch((err) => {
    console.error("[seed-ai-unicorn-repos] failed:", err);
    process.exit(1);
  });
}
