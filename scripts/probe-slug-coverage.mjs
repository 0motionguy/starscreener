#!/usr/bin/env node
// probe-slug-coverage — snapshot the size of the durability-critical
// slugs on TOOLBOX redis so we can prove the 2026-05-27 hardening worked.
//
// USAGE
//   node scripts/probe-slug-coverage.mjs              # human-readable
//   node scripts/probe-slug-coverage.mjs --json       # JSONL line for logs
//   node scripts/probe-slug-coverage.mjs --append .data/slug-coverage.log
//
// The probe SSHes into TOOLBOX and asks the worker container to read the
// relevant slugs via the worker's own redis client (so gz1: payloads
// decode correctly). It does NOT require local redis access.
//
// SLUGS PROBED
//   trending                       — base trending feed (one snapshot)
//   recent-repos                   — newly-created GH repos (Wave 2A fix target)
//   repo-registry                  — accumulating registry (Wave 1-3 plan)
//   repo-metadata                  — per-repo metadata enrichment
//   repo-profiles                  — AISO website-scan queue
//   repo-mentions-detail-rollup    — cross-source mention rollup
//   consensus-trending             — composed ranking
//   consensus-verdicts             — Kimi/NanoGPT LLM verdicts
//   mentions-ledger                — lifetime mentions snapshot
//
// CRON: run hourly via the host scheduler or pair with watch(1) for
// continuous observation: `watch -n 600 node scripts/probe-slug-coverage.mjs`.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const SLUGS = [
  'trending',
  'recent-repos',
  'repo-registry',
  'repo-metadata',
  'repo-profiles',
  'repo-mentions-detail-rollup',
  'consensus-trending',
  'consensus-verdicts',
  'mentions-ledger',
];

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const appendIdx = args.indexOf('--append');
const appendPath = appendIdx >= 0 ? args[appendIdx + 1] : null;

// Build the probe script. It runs INSIDE the worker container via
// `docker exec ... bash -c "node -e ..."`. We pass the script via
// stdin to avoid the multi-layer shell-quote nightmare that Windows
// adds (single-quotes around JSON.stringify'd JS gets mangled).
const PROBE_JS = `
const { readDataStore } = require('/app/dist/lib/redis.js');
const slugs = ${JSON.stringify(SLUGS)};
(async () => {
  const out = {};
  for (const s of slugs) {
    try {
      const d = await readDataStore(s);
      const n =
        d?.items?.length ??
        d?.count ??
        (d?.repos ? Object.keys(d.repos).length : 0) ??
        d?.entries?.length ??
        0;
      out[s] = n;
    } catch (e) {
      out[s] = null;
    }
  }
  console.log(JSON.stringify(out));
})();
`;

// Workaround for Windows spawnSync stdin-piping flakiness: write the
// probe to a temp file, then shell out to bash to ssh+exec with stdin
// redirection. This is robust on both Windows and Unix.
const tmpFile = join(tmpdir(), `probe-slug-coverage-${process.pid}.js`);
writeFileSync(tmpFile, PROBE_JS);

const result = spawnSync(
  'bash',
  [
    '-c',
    `ssh -o ConnectTimeout=10 toolbox 'docker exec -i toolbox-trendingrepo-worker-1 node' < "${tmpFile}"`,
  ],
  {
    encoding: 'utf8',
    timeout: 60_000,
  },
);

try {
  unlinkSync(tmpFile);
} catch {
  // best-effort cleanup
}

if (result.error || result.status !== 0) {
  console.error(
    `[probe-slug-coverage] SSH probe failed (status=${result.status}): ${
      result.stderr?.slice(0, 200) ?? result.error?.message ?? 'unknown'
    }`,
  );
  process.exit(1);
}

let counts;
try {
  const stdout = result.stdout?.trim() ?? '';
  // The worker container may print extra stderr lines via stdout in some
  // shells; isolate the last JSON line.
  const lastLine = stdout.split('\n').filter((l) => l.startsWith('{')).pop() ?? stdout;
  counts = JSON.parse(lastLine);
} catch (err) {
  console.error(
    `[probe-slug-coverage] failed to parse stdout: ${err.message}\nraw: ${result.stdout?.slice(0, 300)}`,
  );
  process.exit(2);
}

const probedAt = new Date().toISOString();
const record = { probedAt, counts };

if (asJson || appendPath) {
  const line = JSON.stringify(record);
  if (appendPath) {
    if (!existsSync(dirname(appendPath))) mkdirSync(dirname(appendPath), { recursive: true });
    appendFileSync(appendPath, line + '\n');
  }
  if (asJson) console.log(line);
} else {
  console.log(`[probe-slug-coverage] ${probedAt}`);
  for (const slug of SLUGS) {
    const n = counts[slug];
    const label = n === null ? 'ERR' : String(n);
    console.log(`  ${slug.padEnd(34)} ${label}`);
  }
}
