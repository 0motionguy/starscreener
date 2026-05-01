// Tiny round-robin GitHub token pool for the heaviest cron scripts.
//
// Cron scripts intentionally run in a separate quota lane from the runtime
// pool (src/lib/github-token-pool.ts) — they use GitHub Actions secrets, not
// the on-demand pool. But a hot script that hits multiple endpoints per repo
// (enrich-repo-profiles, fetch-repo-metadata, append-star-activity) caps at
// 5K/hr per single PAT. CSV `GH_TOKEN_POOL` rotation lets one script use
// several PATs in series and clears the cap N×.
//
// Reads CSV `GH_TOKEN_POOL` + single `GITHUB_TOKEN` fallback. Dedupes,
// trims, drops empties. Pure round-robin — no quota accounting. A 403 on
// one token surfaces as a fetcher error and the next call rotates anyway.
//
// USAGE
//   import { loadGithubPool, pickToken } from "./_github-token-pool-mini.mjs";
//   const state = loadGithubPool();
//   const token = pickToken(state);  // null if no PATs configured
//
// State is per-script (one closure per run). Helpers don't share state across
// scripts — each cron script has its own cursor.

/**
 * Build a fresh pool state from the environment.
 * @param {NodeJS.ProcessEnv} [env] — process.env by default; injectable for tests.
 * @returns {{ tokens: string[], cursor: number }}
 */
export function loadGithubPool(env = process.env) {
  const seen = new Set();
  const tokens = [];
  const pushIfNew = (raw) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    tokens.push(trimmed);
  };
  pushIfNew(env.GITHUB_TOKEN);
  for (const name of ["GH_TOKEN_POOL", "GITHUB_TOKEN_POOL"]) {
    const csv = env[name];
    if (typeof csv === "string" && csv.trim().length > 0) {
      for (const raw of csv.split(",")) pushIfNew(raw);
    }
  }
  return { tokens, cursor: 0 };
}

/**
 * Round-robin pick. Returns null when no PATs are configured (callers may
 * still proceed unauthenticated at 60/hr, e.g. append-star-activity).
 * @param {{ tokens: string[], cursor: number }} state
 * @returns {string | null}
 */
export function pickToken(state) {
  if (!state || !Array.isArray(state.tokens) || state.tokens.length === 0) {
    return null;
  }
  const token = state.tokens[state.cursor % state.tokens.length] ?? null;
  state.cursor = (state.cursor + 1) % state.tokens.length;
  return token;
}
