#!/usr/bin/env node
// Append/update a curated funding-alias entry in data/funding-aliases.json.
//
// Usage:
//   node scripts/add-funding-alias.mjs owner/repo "Alias 1" [domain.com] \
//     [--alias "Other Alias"] [--domain "other.com"]
//
// Example:
//   node scripts/add-funding-alias.mjs huggingface/transformers \
//     "Hugging Face" huggingface.co --alias "HF" --alias "HuggingFace"
//
// Behavior:
//   - Refuses to add an entry whose repoFullName is NOT in .data/repos.jsonl.
//   - Positional args after `owner/repo`: tokens containing a dot are treated
//     as domains, everything else as aliases. Use the explicit --alias /
//     --domain flags when a brand name happens to contain a dot (e.g.
//     "Next.js") or you want to force the classification.
//   - Idempotent: same invocation twice produces the same file (sorted
//     entries, deduped aliases + domains, 2-space indent, trailing newline).
//   - Prints a one-line summary: "added N aliases, M domains to owner/repo".

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

const ALIAS_PATH = resolve(cwd(), "data", "funding-aliases.json");
const REPOS_PATH = resolve(cwd(), ".data", "repos.jsonl");

function die(msg) {
  console.error(`[add-funding-alias] ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) {
    die(
      'usage: add-funding-alias.mjs owner/repo "Alias 1" [domain.com] [--alias "..."] [--domain "..."]',
    );
  }
  const [repoFullName, ...rest] = args;
  if (!repoFullName.includes("/")) {
    die(`invalid repoFullName (expected owner/name): ${repoFullName}`);
  }

  const aliases = [];
  const domains = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--alias") {
      const next = rest[++i];
      if (!next) die(`--alias requires a value`);
      aliases.push(next);
      continue;
    }
    if (token === "--domain") {
      const next = rest[++i];
      if (!next) die(`--domain requires a value`);
      domains.push(next);
      continue;
    }
    // Heuristic: dots + no spaces → domain, else alias.
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(token)) {
      domains.push(token);
    } else {
      aliases.push(token);
    }
  }

  return { repoFullName, aliases, domains };
}

function loadTrackedRepos() {
  if (!existsSync(REPOS_PATH)) {
    die(`tracked-repos file not found: ${REPOS_PATH}`);
  }
  const lower = new Set();
  const raw = readFileSync(REPOS_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (rec && typeof rec.fullName === "string") {
        lower.add(rec.fullName.toLowerCase());
      }
    } catch {
      // skip malformed line
    }
  }
  return lower;
}

function loadExistingFile() {
  if (!existsSync(ALIAS_PATH)) {
    return { generatedAt: new Date().toISOString(), entries: [] };
  }
  const raw = readFileSync(ALIAS_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { generatedAt: new Date().toISOString(), entries: [] };
    }
    return parsed;
  } catch (err) {
    die(`failed to parse existing ${ALIAS_PATH}: ${err.message}`);
  }
}

function mergeEntry(existing, { repoFullName, aliases, domains }) {
  const existingAliases = Array.isArray(existing?.aliases)
    ? existing.aliases
    : [];
  const existingDomains = Array.isArray(existing?.domains)
    ? existing.domains
    : [];

  const aliasSet = new Map();
  for (const a of existingAliases) {
    if (typeof a === "string" && a.trim()) aliasSet.set(a.toLowerCase(), a);
  }
  let addedAliases = 0;
  for (const a of aliases) {
    const key = a.toLowerCase();
    if (!aliasSet.has(key)) {
      aliasSet.set(key, a);
      addedAliases++;
    }
  }

  const domainSet = new Map();
  for (const d of existingDomains) {
    if (typeof d === "string" && d.trim()) domainSet.set(d.toLowerCase(), d.toLowerCase());
  }
  let addedDomains = 0;
  for (const d of domains) {
    const key = d.toLowerCase();
    if (!domainSet.has(key)) {
      domainSet.set(key, key);
      addedDomains++;
    }
  }

  return {
    entry: {
      repoFullName,
      aliases: [...aliasSet.values()].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
      domains: [...domainSet.values()].sort(),
    },
    addedAliases,
    addedDomains,
  };
}

function main() {
  const parsed = parseArgs(process.argv);
  const { repoFullName, aliases, domains } = parsed;

  if (aliases.length === 0 && domains.length === 0) {
    die(`must provide at least one alias or domain`);
  }

  const tracked = loadTrackedRepos();
  if (!tracked.has(repoFullName.toLowerCase())) {
    die(
      `refusing to add alias — ${repoFullName} is NOT in .data/repos.jsonl. ` +
        `Track the repo first.`,
    );
  }

  const file = loadExistingFile();
  const entries = Array.isArray(file.entries) ? file.entries.slice() : [];
  const idx = entries.findIndex(
    (e) =>
      typeof e?.repoFullName === "string" &&
      e.repoFullName.toLowerCase() === repoFullName.toLowerCase(),
  );

  const existing = idx >= 0 ? entries[idx] : null;
  const { entry, addedAliases, addedDomains } = mergeEntry(existing, {
    repoFullName,
    aliases,
    domains,
  });

  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  entries.sort((a, b) =>
    a.repoFullName.toLowerCase().localeCompare(b.repoFullName.toLowerCase()),
  );

  const output = {
    generatedAt: file.generatedAt ?? new Date().toISOString(),
    entries,
  };

  writeFileSync(ALIAS_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(
    `added ${addedAliases} aliases, ${addedDomains} domains to ${repoFullName}`,
  );
}

main();
