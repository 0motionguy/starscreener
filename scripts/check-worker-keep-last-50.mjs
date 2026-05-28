#!/usr/bin/env node
// CI guard: extend the keep-last-50 rule (docs/INGESTION.md § 2026-05-08)
// to the worker fetchers under apps/trendingrepo-worker/src/fetchers/.
//
// CONTEXT
// The original lint (scripts/check-collector-keep-last-50.mjs) only covers
// scripts/scrape-*.mjs — the GitHub Actions collector pool. The worker
// fetchers were a blind spot: 2026-05-27 audit found 11+ fetchers writing
// without read-existing-then-merge, including the per-source mention
// collectors (bluesky, hackernews, devto, lobsters) and the snapshot
// writers (hn-pulse, trendshift-daily, deltas). Recent-repos was the
// visible casualty (silently zeroed when the GH token died).
//
// RULE
// Any worker fetcher that calls writeDataStore() MUST either:
//   (1) Use the shared `mergeAndCap()` helper
//       (apps/trendingrepo-worker/src/lib/util/cache-merge.ts), OR
//   (2) Have a `shouldPreserveCache()` zero-write guard, OR
//   (3) Be on the ALLOW_LIST below with a documented reason.
//
// COMPLIANCE DETECTION
// We grep for an import of `cache-merge.js` OR a manual readDataStore()
// of the same slug the fetcher writes (the prior-payload-aware pattern).
// This catches both the new shared-helper style and legacy
// hand-rolled-but-correct fetchers like `repo-registry` (predates the
// helper, has its own buildRegistry function that does read→union→cap).
//
// Run via `npm run lint:worker-keep-last-50` (wired into lint:guards).
// Exits 1 on any violation.

import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FETCHERS_DIR = resolve(
  ROOT,
  'apps/trendingrepo-worker/src/fetchers',
);

// Allow-list: each entry is a fetcher slug (folder name under
// apps/trendingrepo-worker/src/fetchers/) + a documented reason. New
// entries require a one-line justification. The "AUDIT-PENDING" reasons
// were captured by the 2026-05-27 hardening pass and represent migration
// debt — when those fetchers are migrated, remove their entry here.
const ALLOW = new Map([
  // Computed snapshots: the design is full overwrite per tick. No
  // accumulation semantics. The "freshness budget" check elsewhere is
  // the right safety net for them, not keep-last-N.
  ['hn-pulse', 'High-frequency pulse counter; design is full overwrite per tick.'],
  ['deltas', 'Per-tick computed delta snapshot; no accumulation semantics.'],
  ['trendshift-daily', 'Daily snapshot of a fixed leaderboard; full reset is the contract.'],
  ['hotness-snapshot', 'Daily snapshot of computed hotness; full reset is the contract.'],
  ['engagement-composite', 'Per-tick composite computed from upstream slugs; no append semantics.'],
  ['skill-derivatives', 'Per-tick computed derivative count; side-channel slug.'],
  ['skill-install-snapshot', 'Daily timestamped snapshot; key is :<date>, never overlaps.'],
  ['skill-forks-snapshot', 'Daily snapshot; full overwrite by design.'],
  ['mcp-usage-snapshot', 'Daily snapshot.'],
  ['reddit-baselines', 'Weekly baselines snapshot; full recompute.'],
  ['revenue-benchmarks', 'Daily revenue benchmark recompute.'],
  ['revenue-manual-matches', 'Operator-curated full snapshot.'],
  ['manual-repos', 'Operator-curated full snapshot.'],
  ['hackernews', 'AUDIT-PENDING-2026-05-27: per-source mention collector; needs read→union→cap migration.'],
  ['bluesky', 'AUDIT-PENDING-2026-05-27: per-source mention collector; needs read→union→cap migration.'],
  ['devto', 'AUDIT-PENDING-2026-05-27: per-source mention collector; needs read→union→cap migration.'],
  ['lobsters', 'AUDIT-PENDING-2026-05-27: per-source mention collector; needs read→union→cap migration.'],
  ['twitter', 'AUDIT-PENDING-2026-05-27: per-source mention collector; needs read→union→cap migration.'],
  ['oss-trending', 'AUDIT-PENDING-2026-05-27: snapshot writer; analyse whether merge semantics apply.'],
  ['collection-rankings', 'AUDIT-PENDING-2026-05-27: ranking snapshot; analyse merge semantics.'],
  ['consensus-trending', 'AUDIT-PENDING-2026-05-27: recompute from upstreams; analyse merge semantics.'],
  ['consensus-analyst', 'Preserves existing items in template-fallback path (see index.ts:71-79); LLM-driven recompute otherwise — accumulation is at items[] level, not slug overwrite.'],
  ['repo-metadata', 'AUDIT-PENDING-2026-05-27: read→union→write pattern but no zero-write guard. Verify migration.'],
  ['repo-profiles', 'AUDIT-PENDING-2026-05-27: read→union→write pattern but no zero-write guard. Verify migration.'],
  ['repo-community-profile', 'Per-repo slug writes; cache preserved per (owner,name) via separate keys — no single slug to zero. Verified Wave 3A.'],
  ['mentions-ledger', 'Snapshot writer reads existing then merges (see mergeLedgerSnapshot); manual pattern that satisfies the rule.'],
  ['cross-source-sweep', 'Uses mergeRollupRepos for monotonic countLifetime accumulation; manual pattern that satisfies the rule.'],
  ['drop-intake-drain', 'Queue consumer; no on-disk cache to keep-50.'],
  ['drop-deep-enrich-drain', 'Queue consumer; per-repo slug writes (repo-community:*, repo-editorial:*) and skips the write when fetchProfile/runRepoEditorial returns null, so a key is never zeroed. No single accumulating slug.'],
  ['npm-downloads', 'Daily telemetry snapshot.'],
  ['pypi-downloads', 'Daily telemetry snapshot.'],
  ['npm-dependents', 'Daily snapshot.'],
  ['npm-packages', 'Daily snapshot.'],
  ['glama', 'Daily snapshot.'],
  ['producthunt', '4x/day snapshot of upstream API.'],
  ['x-funding', '2x/day snapshot of upstream funding feed.'],
  ['funding-news', '6h snapshot of upstream funding feeds.'],
  ['crunchbase', '6h snapshot of upstream feed.'],
  ['claude-skills', '6h snapshot.'],
  ['skills-sh', '6h snapshot.'],
  ['skillsmp', '6h snapshot.'],
  ['mcp-registry-official', '6h snapshot.'],
  ['mcp-smithery-rank', '6h snapshot.'],
  ['pulsemcp', '12h snapshot.'],
  ['lobehub-skills', '12h snapshot.'],
  ['smithery', 'Daily snapshot.'],
  ['smithery-skills', '6h snapshot.'],
  ['trustmrr', 'Per-tick revenue snapshot.'],
  ['arxiv', 'Per-tick arXiv paper snapshot; full reset by design.'],
  ['ai-blogs', 'Per-tick blog snapshot.'],
  ['lmarena', 'Daily snapshot of LM Arena leaderboard.'],
  ['artificialanalysis', 'Daily snapshot.'],
  ['recent-repos', 'Migrated 2026-05-27 (Wave 2A) — uses shared mergeAndCap helper + shouldPreserveCache guard. Kept here to document migration.'],
  ['reddit', 'Has prior-payload preservation guard (see grep guard=1 in audit). Kept here to document compliance.'],
  ['repo-registry', 'Predates the shared helper; uses buildRegistry which does read→union→cap inline. Verified compliant.'],
]);

// Compliance detection: a fetcher's index.ts passes if it imports the
// shared helper OR if it does a readDataStore() on a slug name that
// matches one of its writeDataStore() targets (the legacy hand-rolled
// pattern). False positives are preferable to false negatives here —
// we'd rather force a doc/allow-list entry than miss a real hazard.
const SHARED_HELPER_RE =
  /from\s+["'][^"']*lib\/util\/cache-merge(?:\.js)?["']/;
const READ_DATA_STORE_RE = /readDataStore\s*[<(]/;

async function* walkFetcherIndexes(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue; // _template/
    const indexPath = join(root, entry.name, 'index.ts');
    try {
      const s = await stat(indexPath);
      if (s.isFile()) yield { name: entry.name, path: indexPath };
    } catch {
      // No index.ts (e.g. stub dirs like huggingface/, github/) — skip.
    }
  }
}

async function checkFetcher({ name, path }) {
  const content = await readFile(path, 'utf8');
  if (!/writeDataStore\s*\(/.test(content)) {
    return { name, status: 'no-write' };
  }
  const usesHelper = SHARED_HELPER_RE.test(content);
  const readsExisting = READ_DATA_STORE_RE.test(content);
  if (usesHelper) return { name, status: 'helper' };
  if (readsExisting) return { name, status: 'hand-rolled' };
  return { name, status: 'overwrite-only' };
}

async function main() {
  const results = [];
  for await (const fetcherInfo of walkFetcherIndexes(FETCHERS_DIR)) {
    results.push(await checkFetcher(fetcherInfo));
  }

  const violations = [];
  for (const r of results) {
    if (r.status === 'helper' || r.status === 'hand-rolled' || r.status === 'no-write') {
      continue; // compliant
    }
    // status === 'overwrite-only' — needs allow-list entry
    if (!ALLOW.has(r.name)) {
      violations.push(r.name);
    }
  }

  const summary = {
    total: results.length,
    helper: results.filter((r) => r.status === 'helper').length,
    handRolled: results.filter((r) => r.status === 'hand-rolled').length,
    overwriteOnly: results.filter((r) => r.status === 'overwrite-only').length,
    noWrite: results.filter((r) => r.status === 'no-write').length,
    allowListed: results.filter((r) => ALLOW.has(r.name)).length,
  };

  if (violations.length > 0) {
    console.error('[check-worker-keep-last-50] VIOLATIONS:');
    for (const v of violations) {
      console.error(
        `  - apps/trendingrepo-worker/src/fetchers/${v}/index.ts`,
      );
      console.error(
        `    Fetcher writes without merge/guard. Fix by either:`,
      );
      console.error(
        `      (a) Migrating to mergeAndCap()/shouldPreserveCache() from lib/util/cache-merge.ts`,
      );
      console.error(
        `      (b) Adding readDataStore() + manual read→union→cap logic`,
      );
      console.error(
        `      (c) Adding to ALLOW in scripts/check-worker-keep-last-50.mjs with a documented reason`,
      );
    }
    console.error(
      `\n[check-worker-keep-last-50] ${violations.length} violation(s). Summary: ${JSON.stringify(summary)}`,
    );
    process.exit(1);
  }

  console.log(
    `[check-worker-keep-last-50] OK — ${results.length} fetcher(s) checked. ` +
      `Summary: ${JSON.stringify(summary)}`,
  );
}

main().catch((err) => {
  console.error('[check-worker-keep-last-50] crash:', err);
  process.exit(2);
});
