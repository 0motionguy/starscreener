// Source-platform shim — Move 1, Phase 4.
//
// Wraps a standalone collector script (scripts/scrape-*.mjs etc.) in a
// thin "registered source" envelope so the script:
//   1. is verified against apps/trendingrepo-worker/src/platform/sources.json
//      at startup (typo-proofs sourceId; surfaces drift between code + audit),
//   2. emits a structured `[run-summary] source=<id> status=... duration_ms=...`
//      stdout line that the GHA workflow + log shippers can parse identically
//      to the worker's run summaries,
//   3. re-throws on error so the workflow run is marked failed.
//
// Behaviour of the wrapped run() is unchanged. This file is a pure
// instrumentation wrap; the script's own try/catch + meta-sidecar /
// data-store writes still run. If the script doesn't already do its own
// stderr error logging, the shim still re-throws so the GHA step shows red.
//
// USAGE
//   import { runAsRegisteredSource } from "./_source-script-runner.mjs";
//
//   await runAsRegisteredSource({
//     sourceId: "bluesky",
//     run: async () => {
//       // …existing collection logic, untouched…
//     },
//   });
//
// JSON IS READ DIRECTLY from apps/trendingrepo-worker/src/platform/sources.json
// — we deliberately do NOT import worker .ts code from a .mjs script, since
// the scripts run as plain `node` (no tsx). If the registry file is missing
// (fresh checkout, foreign worktree) the shim logs a single warning and runs
// the script anyway: the registry is a control-plane artefact, not a hard
// dependency of collection.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(
  __dirname,
  "..",
  "apps",
  "trendingrepo-worker",
  "src",
  "platform",
  "sources.json",
);

let cachedRegistry = null;

async function loadRegistry() {
  if (cachedRegistry !== null) return cachedRegistry;
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cachedRegistry = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    process.stderr.write(
      `[source-script-runner] warn: could not read registry at ${REGISTRY_PATH} (${err.message ?? err}) — running without contract verification\n`,
    );
    cachedRegistry = [];
  }
  return cachedRegistry;
}

function findContract(registry, sourceId) {
  return registry.find((row) => row && row.id === sourceId) ?? null;
}

function emitRunSummary({ sourceId, status, durationMs, error }) {
  const errSuffix = error
    ? ` error="${String(error.message ?? error).replace(/"/g, '\\"').slice(0, 200)}"`
    : "";
  process.stdout.write(
    `[run-summary] source=${sourceId} status=${status} duration_ms=${durationMs}${errSuffix}\n`,
  );
}

/**
 * Wrap a standalone collector run() in the source-platform envelope.
 *
 * @param {{ sourceId: string; run: () => Promise<unknown> }} opts
 * @returns {Promise<unknown>} the wrapped run()'s resolved value
 * @throws  re-throws whatever run() threw, after emitting the failure summary
 */
export async function runAsRegisteredSource({ sourceId, run }) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new Error(
      "[source-script-runner] sourceId is required and must be a non-empty string",
    );
  }
  if (typeof run !== "function") {
    throw new Error("[source-script-runner] run must be an async function");
  }

  const registry = await loadRegistry();
  const contract = findContract(registry, sourceId);
  if (registry.length > 0 && !contract) {
    process.stderr.write(
      `[source-script-runner] warn: sourceId "${sourceId}" not found in sources.json — register it before this script ships to prod\n`,
    );
  }

  const startedAt = Date.now();
  try {
    const result = await run();
    emitRunSummary({
      sourceId,
      status: "ok",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    emitRunSummary({
      sourceId,
      status: "error",
      durationMs: Date.now() - startedAt,
      error: err,
    });
    throw err;
  }
}

/** Test-only — drop the cached registry so tests can re-stub the file. */
export function _resetForTests() {
  cachedRegistry = null;
}
