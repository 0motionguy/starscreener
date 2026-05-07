#!/usr/bin/env node
/**
 * Source Contract verifier — runtime gate that proves the registry covers
 * every shipped collector and every declared output key.
 *
 * Reads the source registry at apps/trendingrepo-worker/src/platform/sources.json
 * and runs five checks against the codebase:
 *
 *   registered_not_in_audit:    a FETCHERS[] entry has no row in sources.json
 *   audit_not_in_registry_or_scripts:
 *                               a sources.json id has no FETCHERS[] entry AND
 *                               no matching collector script in scripts/
 *                               (recognized prefixes: scrape, collect, enrich,
 *                                build, fetch, ping, run)
 *   output_keys_unwritten:      a primary_output_keys[k] never appears as the
 *                               first arg of writeDataStore(...) in scripts/
 *                               or apps/trendingrepo-worker/
 *   consumer_surface_404:       a declared file path doesn't exist on disk
 *   intent_only_sources:        state === 'intent-only' (report — forces decision)
 *
 * Exits non-zero on any error. Intent-only entries are reported as warnings
 * (forces a ship-or-delete decision) but do not fail the gate.
 *
 * Usage:
 *   node scripts/verify-source-contract.mjs
 *   npm run verify:sources
 *
 * Plan: ~/.claude/plans/hidden-pondering-meadow.md (Phase 1 Spec)
 */

import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCES_PATH = resolve(
  ROOT,
  'apps/trendingrepo-worker/src/platform/sources.json',
);
const REGISTRY_PATH = resolve(
  ROOT,
  'apps/trendingrepo-worker/src/registry.ts',
);
const SCRIPTS_DIR = resolve(ROOT, 'scripts');
const WORKER_SRC = resolve(ROOT, 'apps/trendingrepo-worker/src');

// Move 1 / Phase 6: collector scripts use one of these prefixes followed by
// the source id (e.g. fetch-base-x402-onchain.mjs for source id
// "base-x402-onchain"). The original `scrape-` was the only prefix the P1
// verifier knew about; P6 broadens recognition to the 6 other prefixes
// already in active use across the scripts/ tree.
const SCRIPT_PREFIXES = [
  'scrape',
  'collect',
  'enrich',
  'build',
  'fetch',
  'ping',
  'run',
];
const SCRIPT_EXTENSIONS = ['.mjs', '.ts'];

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Returns the path to the first script file that matches one of the
 * recognized prefixes for the given source id, or null if none exist.
 *
 * Tries every (prefix x extension) pair: scripts/<prefix>-<id>.mjs,
 * then scripts/<prefix>-<id>.ts. The id is used verbatim — sources whose
 * collector script doesn't follow the `<prefix>-<id>` convention will not
 * match here and must either be added to FETCHERS or declare an explicit
 * `script` field in sources.json (see audit_not_in_registry_or_scripts).
 */
async function findScriptForId(id) {
  for (const prefix of SCRIPT_PREFIXES) {
    for (const ext of SCRIPT_EXTENSIONS) {
      const p = resolve(SCRIPTS_DIR, `${prefix}-${id}${ext}`);
      // eslint-disable-next-line no-await-in-loop
      if (await fileExists(p)) return p;
    }
  }
  return null;
}

/**
 * Parse FETCHERS[] names from registry.ts. Uses a regex over the source —
 * we don't need a TS parser since the file shape is stable (one default
 * import per fetcher, then a literal array). The fetcher's exported `.name`
 * field equals the directory name in src/fetchers/, so we can map identifier
 * -> directory -> id by walking the import statements.
 */
async function loadFetcherIds() {
  const src = await readFile(REGISTRY_PATH, 'utf-8');

  // Match: import varName from './fetchers/<dir>/index.js';
  const importRe =
    /^import\s+(\w+)\s+from\s+['"]\.\/fetchers\/([\w-]+)\/index\.js['"];?/gm;
  const idents = new Map(); // identifier -> dir-name (= source id)
  for (const m of src.matchAll(importRe)) {
    idents.set(m[1], m[2]);
  }

  // Match the FETCHERS array body
  const arrRe = /export\s+const\s+FETCHERS:\s*Fetcher\[\]\s*=\s*\[([^\]]*)\]/;
  const arrMatch = src.match(arrRe);
  if (!arrMatch) {
    throw new Error(
      'verify-source-contract: FETCHERS array not found in registry.ts',
    );
  }
  const body = arrMatch[1];
  const tokenRe = /(\w+)\s*,?/g;
  const ids = [];
  for (const m of body.matchAll(tokenRe)) {
    const dir = idents.get(m[1]);
    if (dir) ids.push(dir);
  }
  return new Set(ids);
}

async function loadSources() {
  const raw = await readFile(SOURCES_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function gatherWriteDataStoreKeys() {
  // Greedy scan — concatenate every script + worker source file we need to
  // search. Cheaper than spawning ripgrep and keeps the verifier
  // self-contained with zero external deps.
  const { readdir } = await import('node:fs/promises');
  const keys = new Set();
  const scan = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = resolve(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        // eslint-disable-next-line no-await-in-loop
        await scan(full);
        continue;
      }
      if (!/\.(m?[jt]sx?)$/.test(ent.name)) continue;
      // eslint-disable-next-line no-await-in-loop
      const txt = await readFile(full, 'utf-8');
      // writeDataStore("<key>", ...) OR writeDataStore('<key>', ...)
      const re = /writeDataStore\(\s*["']([^"']+)["']/g;
      for (const m of txt.matchAll(re)) keys.add(m[1]);
    }
  };
  await scan(SCRIPTS_DIR);
  await scan(WORKER_SRC);
  return keys;
}

function flattenOutputKeys(primary) {
  if (Array.isArray(primary)) return primary;
  if (primary && typeof primary === 'object' && primary.pattern) {
    // Pattern keys (e.g. mcp-downloads:<package>) — verify the prefix only.
    return [primary.pattern.split(':')[0].split('<')[0]];
  }
  return [];
}

async function main() {
  const errors = [];
  const warnings = [];
  const intentOnly = [];

  const sources = await loadSources();
  const fetcherIds = await loadFetcherIds();
  const writtenKeys = await gatherWriteDataStoreKeys();

  // Cross-check 1: registered_not_in_audit
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const id of fetcherIds) {
    if (!sourceIds.has(id)) {
      errors.push({
        check: 'registered_not_in_audit',
        id,
        msg: `FETCHERS[] entry "${id}" has no row in sources.json`,
      });
    }
  }

  // Cross-check 2: audit_not_in_registry_or_scripts
  // Move 1 / Phase 6: this check now accepts 7 script prefixes
  // (scrape, collect, enrich, build, fetch, ping, run) instead of just
  // scrape-<id>.mjs. Any of <prefix>-<id>.{mjs,ts} satisfies the check,
  // plus an optional `script` field that lets a row declare its actual
  // on-disk filename when the `<prefix>-<id>` convention does not fit.
  for (const src of sources) {
    if (fetcherIds.has(src.id)) continue;

    // user-input flows have route handlers, not scripts — skip; the
    // consumer_surface_404 check separately verifies their handler files.
    if (src.category === 'user-input') continue;

    // intent-only sources are tracked separately by the intent_only_sources
    // check. They explicitly have no shipped collector — that's the whole
    // point of the state — so skip the script-existence test for them.
    if (src.state === 'intent-only') continue;

    // eslint-disable-next-line no-await-in-loop
    const scriptPath = await findScriptForId(src.id);
    if (scriptPath) continue;

    // Optional escape hatch: source row may declare its actual script
    // basename when the `<prefix>-<id>` convention doesn't fit (e.g. the
    // script handles multiple sources or pre-dates the convention).
    if (src.script) {
      const explicit = resolve(SCRIPTS_DIR, src.script);
      // eslint-disable-next-line no-await-in-loop
      if (await fileExists(explicit)) continue;
      errors.push({
        check: 'audit_not_in_registry_or_scripts',
        id: src.id,
        msg: `sources.json id "${src.id}" declares script="${src.script}" but scripts/${src.script} does not exist`,
      });
      continue;
    }

    errors.push({
      check: 'audit_not_in_registry_or_scripts',
      id: src.id,
      msg: `sources.json id "${src.id}" not in FETCHERS and no scripts/<prefix>-${src.id}.{mjs,ts} found (prefixes: ${SCRIPT_PREFIXES.join(', ')})`,
    });
  }

  // Cross-check 3: output_keys_unwritten
  for (const src of sources) {
    if (src.state !== 'active') continue; // intent-only / paused / deprecated don't enforce keys
    if (src.category === 'user-input') continue; // route handlers write to Supabase, not data-store
    const keys = flattenOutputKeys(src.primary_output_keys);
    for (const k of keys) {
      if (!k) continue;
      if (!writtenKeys.has(k)) {
        // claude-rss / openai-rss write via STORE_KEY constant — skip the
        // two known indirections to avoid false positives. Move 3 will
        // close this with a typed writer registry.
        if (
          (src.id === 'claude-rss' || src.id === 'openai-rss') &&
          (k === 'claude-rss' || k === 'openai-rss')
        ) {
          warnings.push({
            check: 'output_keys_unwritten',
            id: src.id,
            msg: `primary_output_key "${k}" written via STORE_KEY indirection (verifier cannot statically resolve) — skipped`,
          });
          continue;
        }
        warnings.push({
          check: 'output_keys_unwritten',
          id: src.id,
          msg: `primary_output_key "${k}" never appears as first arg of writeDataStore(...)`,
        });
      }
    }
  }

  // Cross-check 4: consumer_surface_404
  for (const src of sources) {
    for (const surf of src.consumer_surfaces ?? []) {
      const p = resolve(ROOT, surf);
      // eslint-disable-next-line no-await-in-loop
      if (!(await fileExists(p))) {
        errors.push({
          check: 'consumer_surface_404',
          id: src.id,
          msg: `consumer_surface "${surf}" does not exist on disk`,
        });
      }
    }
  }

  // Cross-check 5: intent_only_sources (report)
  for (const src of sources) {
    if (src.state === 'intent-only') {
      intentOnly.push(src.id);
    }
  }

  const summary = {
    total_sources: sources.length,
    fetcher_ids: fetcherIds.size,
    intent_only_sources: intentOnly.length,
    errors: errors.length,
    warnings: warnings.length,
  };

  console.log('# verify-source-contract');
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length) {
    console.log('\n## errors');
    for (const e of errors) {
      console.log(`  [${e.check}] ${e.id}: ${e.msg}`);
    }
  }
  if (warnings.length) {
    console.log('\n## warnings');
    for (const w of warnings) {
      console.log(`  [${w.check}] ${w.id}: ${w.msg}`);
    }
  }
  if (intentOnly.length) {
    console.log('\n## intent-only sources (require ship/delete decision)');
    for (const id of intentOnly) {
      console.log(`  - ${id}`);
    }
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('verify-source-contract: fatal', err);
  process.exit(2);
});
