#!/usr/bin/env node
// CI guard for the keep-last-50 cache rule (docs/INGESTION.md
// § "RULE: Keep-last-50 cache (2026-05-08)").
//
// Catches collectors that write data files without going through the
// canonical merge primitive in scripts/_cache-merge.mjs. The rule says:
// every collector must read existing → union with new → dedupe → keep
// top 50 — never empty the cache. Without this guard, a regression
// (e.g. Reddit "0 0" outage) silently zeros the user-facing cache.
//
// COVERED FILES
//   scripts/scrape-*.mjs
//   scripts/collect-twitter-signals.ts (Apify wrapper)
//
// COMPLIANCE
//   A file passes if it imports `_cache-merge.mjs` (the helper) OR if
//   it implements an in-script merge function whose name starts with
//   `merge` AND has an explicit `// keep-last-50` comment annotation
//   nearby — used by Reddit which has its own per-sub merge that
//   pre-dates the unified helper.
//
// ALLOW-LIST
//   Each entry below is a script that legitimately opts out (no on-disk
//   cache, write-once snapshot, etc.). Each must carry a reason.
//
// Run via `npm run lint:keep-last-50` (wired into `npm run lint:guards`).
// Exits 1 on any violation.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCRIPTS_DIR = resolve(ROOT, "scripts");

const ALLOW = new Map([
  [
    "scripts/scrape-claude-rss.mjs",
    "RSS-only feed; writes append-only event log, no cache to keep-50.",
  ],
  [
    "scripts/scrape-openai-rss.mjs",
    "RSS-only feed; writes append-only event log, no cache to keep-50.",
  ],
  [
    "scripts/scrape-arxiv.mjs",
    "Daily snapshot of fixed-set arXiv papers; full reset is the design (file overwrite is the contract).",
  ],
  [
    "scripts/scrape-awesome-skills.mjs",
    "Pulls full awesome-list snapshot from a single GitHub README; no merge primitive needed.",
  ],
  [
    "scripts/scrape-npm.mjs",
    "Telemetry sweep of fixed package set; full reset by design.",
  ],
  [
    "scripts/scrape-sec-form-d.mjs",
    "SEC EDGAR full-period sweep; resets each run by design.",
  ],
  [
    "scripts/scrape-npm-daily.mjs",
    "JSONL append-only with (package,date) dedup; never truncates so satisfies the rule's spirit naturally.",
  ],
  [
    "scripts/collect-twitter-signals.ts",
    "JSONL-backbone (.data/twitter-*.jsonl is append-only via flushTwitterPersist); Redis is a read-only mirror. The 'only 16 fresh' user-facing outage is freshness, tracked separately in RESCUE-2026-05-08-HANDOVER outstanding #2 (Apify run history) — not a cache-emptying class of bug.",
  ],
]);

const COLLECTOR_GLOBS = [
  /^scrape-.+\.mjs$/,
  /^collect-twitter-signals\.ts$/,
];

const HELPER_IMPORT_RE =
  /from\s+["']\.\/_cache-merge(\.mjs)?["']|from\s+["']\.\.?\/.*_cache-merge(\.mjs)?["']/;

const MERGE_FN_RE = /\b(?:export\s+)?(?:async\s+)?function\s+merge[A-Z]\w*\s*\(/;

// Comment annotation that opts a file in via its own merge function. Reddit
// (and any future collector with a richer per-bucket merge) uses this.
const ANNOTATION_RE = /\/\/\s*keep-last-50\s*:/i;

async function listCollectors() {
  const all = await readdir(SCRIPTS_DIR);
  const out = [];
  for (const name of all) {
    if (COLLECTOR_GLOBS.some((rx) => rx.test(name))) {
      out.push(join(SCRIPTS_DIR, name));
    }
  }
  return out.sort();
}

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

const violations = [];
const passes = [];

for (const file of await listCollectors()) {
  const r = rel(file);
  if (ALLOW.has(r)) {
    passes.push({ file: r, why: `allow-list: ${ALLOW.get(r)}` });
    continue;
  }
  const content = await readFile(file, "utf8");

  const importsHelper = HELPER_IMPORT_RE.test(content);
  const hasMergeFn = MERGE_FN_RE.test(content);
  const hasAnnotation = ANNOTATION_RE.test(content);

  if (importsHelper) {
    passes.push({ file: r, why: "imports _cache-merge.mjs" });
    continue;
  }
  if (hasMergeFn && hasAnnotation) {
    passes.push({ file: r, why: "in-script merge fn + // keep-last-50 annotation" });
    continue;
  }

  violations.push({ file: r, importsHelper, hasMergeFn, hasAnnotation });
}

if (violations.length === 0) {
  console.log(
    `[check-collector-keep-last-50] OK — ${passes.length} collector(s) compliant ` +
      `(${ALLOW.size} allow-listed, ${
        passes.length - ALLOW.size
      } via helper or annotation).`,
  );
  process.exit(0);
}

console.error(
  `[check-collector-keep-last-50] FAIL — ${violations.length} collector(s) ` +
    `do not follow the keep-last-50 cache rule.`,
);
console.error("");
console.error(
  "Each collector must either (a) import scripts/_cache-merge.mjs and use",
);
console.error(
  "  mergeAndKeepLastN(...) before writing, OR (b) have its own merge function",
);
console.error(
  "  with `// keep-last-50: <reason>` annotation, OR (c) be allow-listed in",
);
console.error("  scripts/check-collector-keep-last-50.mjs with a reason.");
console.error("");
console.error("See docs/INGESTION.md § \"RULE: Keep-last-50 cache (2026-05-08)\".");
console.error("");
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(
    `    importsHelper=${v.importsHelper} hasMergeFn=${v.hasMergeFn} hasAnnotation=${v.hasAnnotation}`,
  );
}
process.exit(1);
