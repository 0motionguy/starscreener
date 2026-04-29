#!/usr/bin/env node
// Synthetic verifier — confirms the GitHub token pool actually distributes
// load across the configured PATs.
//
// Fires N concurrent requests through `githubFetch`, then reads the pool
// snapshot and asserts that ≥ THRESHOLD distinct tokens recorded a
// `lastObservedMs` within the run window. If only one token shows activity,
// rotation isn't happening — the pool either has 1 token configured or the
// callsite is bypassing it.
//
// Run via:
//   npm run verify:pool-throughput
//   node scripts/verify-pool-throughput.mjs --requests=200 --threshold=5
//
// Exit codes:
//   0 — pool distributing load across ≥ THRESHOLD tokens
//   1 — fewer than THRESHOLD tokens observed (pool not rotating, or too few PATs)
//   2 — pool empty / configuration error
//
// This script imports the compiled TS via tsx, so it reflects what the
// production runtime would do. Run after deploys to confirm the pool wiring
// survived the build. Costs ~N GitHub API calls against the cheap
// /rate_limit endpoint.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const eq = a.indexOf("=");
      return eq === -1
        ? [a.slice(2), "true"]
        : [a.slice(2, eq), a.slice(eq + 1)];
    }),
);

const REQUESTS = Number(args.get("requests") ?? "100");
const THRESHOLD = Number(args.get("threshold") ?? "5");

if (!Number.isFinite(REQUESTS) || REQUESTS < 1) {
  console.error("--requests must be a positive integer");
  process.exit(2);
}
if (!Number.isFinite(THRESHOLD) || THRESHOLD < 1) {
  console.error("--threshold must be a positive integer");
  process.exit(2);
}

// Inline TS payload — tsx compiles it on the fly. Keeps the verifier as one
// file rather than a script + a compiled helper.
const ts = `
  import { getGitHubTokenPool } from "${posixPath(resolve(ROOT, "src/lib/github-token-pool.ts"))}";
  import { githubFetch } from "${posixPath(resolve(ROOT, "src/lib/github-fetch.ts"))}";

  const pool = getGitHubTokenPool();
  const size = pool.size();

  if (size === 0) {
    console.error("[verify-pool-throughput] pool is empty — set GITHUB_TOKEN and/or GH_TOKEN_POOL");
    process.exit(2);
  }

  const start = Date.now();
  const before = new Set(
    pool
      .snapshot()
      .filter((s) => s.lastObservedMs !== null)
      .map((s) => s.token),
  );

  // Fire all requests concurrently. The /rate_limit endpoint is cheap
  // (1 unit per call) and the response carries the rate-limit headers we
  // need to populate per-token state.
  const results = await Promise.allSettled(
    Array.from({ length: ${REQUESTS} }, () => githubFetch("/rate_limit")),
  );

  const ok = results.filter(
    (r) => r.status === "fulfilled" && r.value && r.value.response.ok,
  ).length;

  const after = pool.snapshot();
  const observedSinceStart = after.filter(
    (s) =>
      s.lastObservedMs !== null && s.lastObservedMs >= start,
  );
  const distinctTokensUsed = new Set(observedSinceStart.map((s) => s.token));

  const ms = Date.now() - start;

  console.log(\`[verify-pool-throughput] pool size: \${size}\`);
  console.log(\`[verify-pool-throughput] requests issued: ${REQUESTS}\`);
  console.log(\`[verify-pool-throughput] requests OK: \${ok} / ${REQUESTS}\`);
  console.log(\`[verify-pool-throughput] distinct tokens observed: \${distinctTokensUsed.size} / \${size}\`);
  console.log(\`[verify-pool-throughput] elapsed: \${ms}ms\`);

  for (const s of observedSinceStart) {
    const left = s.remaining === null ? "?" : String(s.remaining);
    const reset = s.resetUnixSec === null ? "?" : new Date(s.resetUnixSec * 1000).toISOString();
    console.log(\`  - tok=\${redactToken(s.token)} remaining=\${left} reset=\${reset}\`);
  }

  function redactToken(t) {
    return t.length <= 12 ? "***" : t.slice(0, 6) + "…" + t.slice(-4);
  }

  if (distinctTokensUsed.size < ${THRESHOLD}) {
    console.error(
      \`[verify-pool-throughput] FAIL — only \${distinctTokensUsed.size} token(s) saw load (want >= ${THRESHOLD}).\`,
    );
    console.error(
      "If the pool has fewer than the threshold tokens, configure more or lower --threshold.",
    );
    console.error(
      "If the pool has enough tokens but rotation isn't happening, check that callers route through githubFetch / the adapter.",
    );
    process.exit(1);
  }

  console.log("[verify-pool-throughput] OK");
  process.exit(0);
`;

function posixPath(p) {
  return p.replaceAll("\\", "/");
}

const result = spawnSync(
  "npx",
  ["tsx", "--eval", ts],
  { cwd: ROOT, stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
