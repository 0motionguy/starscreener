// ESM mirror of `apps/trendingrepo-worker/src/lib/secret-scrubber.ts`.
//
// Used by `_cross-source-search.mjs` and `sweep-cross-source-mentions.ts`
// at runtime (no compile step). Patterns are identical to the TS source —
// if you change one, change the other and re-run the worker's vitest suite.
//
// Per migrate-rotate-leaked-secrets.md: a third-party AWS STS key leaked
// via this code path in 2026-05; this scrubber prevents recurrence.

const PATTERNS = [
  { name: "aws-akia", rx: /\bAKIA[A-Z0-9]{16}\b/g },
  { name: "aws-asia", rx: /\bASIA[A-Z0-9]{16}\b/g },
  { name: "stripe-whsec", rx: /\bwhsec_[A-Za-z0-9]{32,}\b/g },
  { name: "stripe-sk-live", rx: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "gh-pat", rx: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: "gh-server", rx: /\bghs_[A-Za-z0-9]{36}\b/g },
  { name: "gh-fine", rx: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name: "google-api", rx: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: "sentry-token", rx: /\bsntrys_[A-Za-z0-9_=]{50,}\b/g },
];

/**
 * Redact any of the 9 known secret shapes in `text`. Returns the cleaned
 * string and a per-hit audit trail (`<name>:<first4>…<last4>`) suitable
 * for structured logs.
 *
 * Idempotent — re-scrubbing already-redacted text is a no-op.
 */
export function redactSecrets(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { clean: text ?? "", hits: [] };
  }
  const hits = [];
  let clean = text;
  for (const { name, rx } of PATTERNS) {
    clean = clean.replace(rx, (match) => {
      hits.push(`${name}:${match.slice(0, 4)}…${match.slice(-4)}`);
      return `[REDACTED:${name}]`;
    });
  }
  return { clean, hits };
}

/** Convenience: returns the cleaned string only. */
export function scrub(text) {
  return redactSecrets(text).clean;
}

/** Read-only handle on the pattern set — used by tooling + manual audits. */
export function listPatterns() {
  return PATTERNS.map((p) => ({ name: p.name }));
}
