// Minimal GitHub PAT pool for worker fetchers.
//
// Reads GH_TOKEN_POOL (comma-separated, preferred — that's the env var
// surface in CI) plus GITHUB_TOKEN (single, legacy fallback). De-dupes,
// trims, drops empties. Round-robin pick on each call.
//
// This is intentionally simpler than src/lib/github-token-pool.ts (the
// app-side pool with rate-limit accounting). Worker fetchers run on cron,
// not on user request, so per-token quota tracking is overkill: a 403
// from one token surfaces as a fetcher error and the next tick will pick
// a different token via round-robin.

let cachedTokens: string[] | null = null;
let cursor = 0;

function loadTokens(env: NodeJS.ProcessEnv = process.env): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushIfNew = (raw: string | undefined): void => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  pushIfNew(env.GITHUB_TOKEN);
  for (const name of ['GH_TOKEN_POOL', 'GITHUB_TOKEN_POOL'] as const) {
    const pool = env[name];
    if (typeof pool === 'string' && pool.trim().length > 0) {
      for (const raw of pool.split(',')) pushIfNew(raw);
    }
  }
  return out;
}

export function getGithubTokens(): string[] {
  if (cachedTokens === null) {
    cachedTokens = loadTokens();
  }
  return cachedTokens;
}

export function pickGithubToken(): string | null {
  const tokens = getGithubTokens();
  if (tokens.length === 0) return null;
  const token = tokens[cursor % tokens.length] ?? null;
  cursor = (cursor + 1) % Math.max(tokens.length, 1);
  return token;
}

/** Test-only: drop the cached pool so each test starts fresh. */
export function _resetGithubTokenPoolForTests(): void {
  cachedTokens = null;
  cursor = 0;
}
