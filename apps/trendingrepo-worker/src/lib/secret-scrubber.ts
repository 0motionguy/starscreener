// Secret scrubber for scraped third-party text.
//
// Mentions adapters pull text/HTML from public sources (HN, Reddit, Bluesky,
// Twitter, dev.to, Lobsters, Tavily). Some of that content
// contains live API keys committed by upstream authors. We must not store
// those keys in `data/repo-mentions-detail.jsonl` or anywhere we publish.
//
// Per migrate-rotate-leaked-secrets.md: a third-party AWS STS key
// (ASIA…3FUC) leaked into our `main` HEAD via the daily mentions cron.
// This scrubber prevents recurrence and is wired into every adapter that
// returns user-supplied text.
//
// Conservative-by-design: false positives (over-redaction) are cheap; false
// negatives (key leaks into git) are not.

export interface ScrubResult {
  /** Input with every matched secret replaced by `[REDACTED:<name>]`. */
  clean: string;
  /** Per-hit audit trail of form `<name>:<first4>…<last4>` (safe to log). */
  hits: string[];
}

interface Pattern {
  name: string;
  rx: RegExp;
}

// Patterns are evaluated in declaration order. Keep specific tokens (e.g.
// `sk-ant-`) before their parent shapes (`sk-`) so the narrower label wins.
//
// Validated against the 9-pattern set in
// .audits/migrate-rotate-leaked-secrets.md §3 plus 2026-05 sweeps that
// surfaced GitHub server tokens (`ghs_`), fine-grained PATs (`github_pat_`),
// Sentry DSN tokens (`sntrys_`), and Google API keys (`AIza`).
const PATTERNS: Pattern[] = [
  // AWS — long-lived access key
  { name: 'aws-akia', rx: /\bAKIA[A-Z0-9]{16}\b/g },
  // AWS — STS temporary credential (max 36h TTL but billable while live)
  { name: 'aws-asia', rx: /\bASIA[A-Z0-9]{16}\b/g },
  // Stripe — webhook signing secret (rotate-only, not API auth)
  { name: 'stripe-whsec', rx: /\bwhsec_[A-Za-z0-9]{32,}\b/g },
  // Stripe — live secret API key (live charges)
  { name: 'stripe-sk-live', rx: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  // GitHub — classic personal access token
  { name: 'gh-pat', rx: /\bghp_[A-Za-z0-9]{36}\b/g },
  // GitHub — server / app installation token
  { name: 'gh-server', rx: /\bghs_[A-Za-z0-9]{36}\b/g },
  // GitHub — fine-grained PAT (`github_pat_` prefix, underscore-tolerant tail)
  { name: 'gh-fine', rx: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  // Google API key
  { name: 'google-api', rx: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  // Sentry auth token
  { name: 'sentry-token', rx: /\bsntrys_[A-Za-z0-9_=]{50,}\b/g },
];

/**
 * Redact any of the 9 known secret shapes in `text`. Returns the cleaned
 * string and a per-hit audit trail (`<name>:<first4>…<last4>`) suitable for
 * structured logs — the audit trail itself does not contain the full secret.
 *
 * Idempotent: re-scrubbing already-redacted text is a no-op.
 */
export function redactSecrets(text: string): ScrubResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { clean: text ?? '', hits: [] };
  }
  const hits: string[] = [];
  let clean = text;
  for (const { name, rx } of PATTERNS) {
    clean = clean.replace(rx, (match) => {
      const head = match.slice(0, 4);
      const tail = match.slice(-4);
      hits.push(`${name}:${head}…${tail}`);
      return `[REDACTED:${name}]`;
    });
  }
  return { clean, hits };
}

/**
 * Backwards-compatible alias used by `scripts/_cross-source-search.mjs` and
 * any future caller that prefers the verb shape. Returns the cleaned string
 * only — drop the hits trail if you don't need it.
 */
export function scrub(text: string): string {
  return redactSecrets(text).clean;
}

/**
 * Read-only handle on the pattern set — exposed for tests + manual audits.
 * Mutating the returned array does not affect the scrubber.
 */
export function listPatterns(): ReadonlyArray<{ name: string }> {
  return PATTERNS.map((p) => ({ name: p.name }));
}
