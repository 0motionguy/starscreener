#!/usr/bin/env node
// scripts/check-openapi-coverage.mjs
//
// Diffs docs/_generated/openapi-derived.yaml against docs/openapi.yaml and
// reports drift. We do NOT shell out to a YAML parser (no new deps) — we just
// extract the path keys with a regex. The derived file is well-formed by
// construction; the hand-curated spec uses two-space indent with paths under
// `paths:` at four-space indent (verified by inspection of the current file).
//
// Exit code:
//   0 — derived ⊆ committed AND committed ⊆ derived (no drift)
//   1 — drift detected (routes in code missing from spec, or vice versa)
//   2 — could not read either file
//
// Internal-only paths intentionally excluded from the spec are listed in
// EXCLUDE_PREFIXES so they don't surface as drift. The current openapi.yaml
// header explicitly excludes /api/internal/** and /api/stream — match that.

import { readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const COMMITTED = join(ROOT, "docs", "openapi.yaml");
const DERIVED = join(ROOT, "docs", "_generated", "openapi-derived.yaml");

// Paths the hand-curated spec deliberately does not document. Keep this in
// sync with the SCOPE block at the top of docs/openapi.yaml.
const EXCLUDE_PREFIXES = [
  "/api/internal/",
  "/api/stream",
  "/api/_internal/",
  "/api/mcp/",
  "/api/oembed",
  "/api/openapi.json",
];

function readFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`[check-openapi] read failed: ${path}: ${err && err.message}\n`);
    return null;
  }
}

// Pull every line that looks like a path key under `paths:`. We accept either
//   "  /api/foo:" (committed file uses 2-space indent under `paths:`)
//   "  /api/foo:" (derived file uses 2-space indent too)
// The leading whitespace is significant (paths must be top-level under `paths:`),
// but both files use the same depth so a single regex covers both.
function extractPaths(yamlText) {
  const out = new Set();
  const lines = yamlText.split(/\r?\n/);
  let inPaths = false;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      // Leaving the paths block when we hit another top-level key.
      if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*$/.test(line)) {
        inPaths = false;
        continue;
      }
      // Match either "  /api/...:" (plain scalar) or "  \"/api/...\":"
      // (quoted scalar — emitted by derive-openapi when the path contains
      // `{}` chars that need YAML quoting). Exactly 2 leading spaces.
      const plain = /^\s{2}(\/[^\s:"]+)\s*:\s*$/.exec(line);
      const quoted = /^\s{2}"(\/[^"]+)"\s*:\s*$/.exec(line);
      const match = plain || quoted;
      if (match) out.add(match[1]);
    }
  }
  return out;
}

function isExcluded(path) {
  return EXCLUDE_PREFIXES.some((p) => path.startsWith(p));
}

function diff(setA, setB) {
  const out = [];
  for (const x of setA) if (!setB.has(x)) out.push(x);
  out.sort();
  return out;
}

function main() {
  if (!existsSync(DERIVED)) {
    process.stderr.write(
      `[check-openapi] derived file missing: ${relative(ROOT, DERIVED).split(sep).join("/")}\n` +
        `  run: node scripts/derive-openapi.mjs\n`,
    );
    process.exit(2);
  }

  const committedText = readFile(COMMITTED);
  const derivedText = readFile(DERIVED);
  if (committedText === null || derivedText === null) process.exit(2);

  const committed = extractPaths(committedText);
  const derived = extractPaths(derivedText);

  // Routes the hand-curated spec ignores by design — drop them before diffing.
  const derivedFiltered = new Set();
  const excluded = [];
  for (const p of derived) {
    if (isExcluded(p)) excluded.push(p);
    else derivedFiltered.add(p);
  }

  const inCodeMissingFromSpec = diff(derivedFiltered, committed);
  const inSpecMissingFromCode = diff(committed, derived);

  const totalCode = derived.size;
  const totalSpec = committed.size;
  const driftCount = inCodeMissingFromSpec.length + inSpecMissingFromCode.length;

  process.stdout.write(
    `[check-openapi] code=${totalCode} spec=${totalSpec} excluded=${excluded.length} drift=${driftCount}\n`,
  );

  if (inCodeMissingFromSpec.length > 0) {
    process.stdout.write(
      `\n[check-openapi] routes in code but missing from docs/openapi.yaml (${inCodeMissingFromSpec.length}):\n`,
    );
    for (const p of inCodeMissingFromSpec) process.stdout.write(`  + ${p}\n`);
  }

  if (inSpecMissingFromCode.length > 0) {
    process.stdout.write(
      `\n[check-openapi] routes in spec but missing from src/app/api (${inSpecMissingFromCode.length}):\n`,
    );
    for (const p of inSpecMissingFromCode) process.stdout.write(`  - ${p}\n`);
  }

  if (driftCount === 0) {
    process.stdout.write("[check-openapi] OK — no drift\n");
    process.exit(0);
  }
  process.exit(1);
}

main();
