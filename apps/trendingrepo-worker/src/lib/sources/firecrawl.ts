// Firecrawl API key pool helpers.
//
// Mirrors the devto pattern (DEVTO_API_KEYS + DEVTO_API_KEY) so the worker
// can rotate Firecrawl keys when scraping at scale. Reads
// FIRECRAWL_API_KEYS (comma-separated) and falls back to / merges with
// FIRECRAWL_API_KEY (singular). Round-robin cursor is per-process.
//
// Active callers:
//   - lib/sources/firecrawl-client (skills-sh, etc) via FirecrawlClient.fromEnv()
//   - fetchers/lobehub-skills (Bearer header on /v1/scrape)
//   - run.ts gate (requiresFirecrawl)

function loadFirecrawlKeys(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string | undefined): void => {
    const v = (k ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const pool = process.env.FIRECRAWL_API_KEYS;
  if (typeof pool === 'string' && pool.length > 0) {
    for (const raw of pool.split(',')) push(raw);
  }
  push(process.env.FIRECRAWL_API_KEY);
  return out;
}

const FIRECRAWL_KEYS = loadFirecrawlKeys();
let firecrawlCursor = 0;

/**
 * Returns the next Firecrawl API key in round-robin order, or undefined
 * when neither FIRECRAWL_API_KEYS nor FIRECRAWL_API_KEY is set.
 */
export function nextFirecrawlKey(): string | undefined {
  if (FIRECRAWL_KEYS.length === 0) return undefined;
  const key = FIRECRAWL_KEYS[firecrawlCursor % FIRECRAWL_KEYS.length];
  firecrawlCursor += 1;
  return key;
}

/**
 * True when at least one Firecrawl key is configured (pool or single).
 * Use this in place of `process.env.FIRECRAWL_API_KEY` checks so the pool
 * variant counts as "configured".
 */
export function hasFirecrawlKey(): boolean {
  return FIRECRAWL_KEYS.length > 0;
}

export function firecrawlKeyPoolSize(): number {
  return FIRECRAWL_KEYS.length;
}
