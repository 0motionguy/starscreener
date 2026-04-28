#!/usr/bin/env node
// Ingest GitHub repos cited in arXiv abstracts into the manual-repos JSONL.
//
// arXiv papers commonly terminate their abstract with a "Code is available
// at https://github.com/<owner>/<repo>" sentence. scrape-arxiv.mjs already
// preserves up to 2000 chars of each abstract; this script extracts those
// repo URLs and feeds them into the discovery pipeline by appending to
// .data/manual-repos.jsonl (the canonical runtime-mutable manual intake).
//
// Why this file and not data/recent-repos.json?
//   data/recent-repos.json is overwritten hourly by discover-recent-repos.mjs;
//   any rows we add there get clobbered. .data/manual-repos.jsonl is the
//   append-only intake that survives across cron runs and is loaded by
//   listManualRepoRowsSync() into the tracked-repo set used by every scraper.
//
// Idempotent: re-running collects the existing fullNames from the JSONL and
// only appends entries that aren't already present (case-insensitive match).

import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractGithubRepoFullNames } from "./_github-repo-links.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const RUNTIME_DATA_DIR = resolve(__dirname, "..", ".data");
const ARXIV_IN = resolve(DATA_DIR, "arxiv-trending.json");
const MANUAL_JSONL_OUT = resolve(RUNTIME_DATA_DIR, "manual-repos.jsonl");

function log(msg) {
  console.log(`[ingest-arxiv] ${msg}`);
}

async function readArxivPapers() {
  const raw = await readFile(ARXIV_IN, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.papers)) {
    throw new Error(
      `arxiv-trending.json missing .papers array (got ${typeof parsed?.papers})`,
    );
  }
  return parsed.papers;
}

// Build a fullName -> [arxivId, ...] map by extracting github.com/<owner>/<repo>
// from each paper's abstract. Pass `null` as the tracked-set so we accept any
// well-formed repo URL (this script's job is to discover NEW repos).
function collectCitedRepos(papers) {
  const byFullName = new Map();
  for (const paper of papers) {
    const abstract = typeof paper?.abstract === "string" ? paper.abstract : "";
    if (!abstract) continue;
    const arxivId = typeof paper?.arxivId === "string" ? paper.arxivId : null;
    const hits = extractGithubRepoFullNames(abstract, null);
    for (const fullName of hits) {
      const lower = fullName.toLowerCase();
      if (!byFullName.has(lower)) byFullName.set(lower, new Set());
      if (arxivId) byFullName.get(lower).add(arxivId);
    }
  }
  return byFullName;
}

// Load existing fullNames from .data/manual-repos.jsonl. Missing file is
// fine — first run.
async function loadExistingFullNames() {
  let raw;
  try {
    raw = await readFile(MANUAL_JSONL_OUT, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return new Set();
    throw err;
  }
  const out = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      const fullName = row?.fullName ?? row?.full_name ?? row?.repo_name;
      if (typeof fullName === "string" && fullName.includes("/")) {
        out.add(fullName.toLowerCase());
      }
    } catch {
      // Skip corrupt lines — the upsert path in src/lib/manual-repos.ts will
      // rewrite the file the next time an operator submission lands.
    }
  }
  return out;
}

async function main() {
  const papers = await readArxivPapers();
  const cited = collectCitedRepos(papers);
  const existing = await loadExistingFullNames();

  const totalCited = cited.size;
  let alreadyTracked = 0;
  const newRows = [];
  const addedAt = new Date().toISOString();

  for (const [lower, arxivIds] of cited) {
    if (existing.has(lower)) {
      alreadyTracked += 1;
      continue;
    }
    const [owner, name] = lower.split("/", 2);
    if (!owner || !name) continue;
    newRows.push({
      fullName: lower,
      owner,
      name,
      intakeSource: "arxiv_discovery",
      addedAt,
      sourceArxivIds: Array.from(arxivIds).sort(),
    });
  }

  if (newRows.length > 0) {
    await mkdir(RUNTIME_DATA_DIR, { recursive: true });
    const payload = newRows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await appendFile(MANUAL_JSONL_OUT, payload, "utf8");
  }

  log(
    `${newRows.length} new repos added (${totalCited} total cited, ${alreadyTracked} already tracked)`,
  );
}

main().catch((err) => {
  console.error(`[ingest-arxiv] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
