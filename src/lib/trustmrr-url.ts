// Single source of truth for TrustMRR slug/URL handling.
//
// TrustMRR's canonical public URL is `https://trustmrr.com/startup/<slug>`
// (verified against the cached catalog — every row in data/trustmrr-startups.json
// uses /startup/). Earlier code emitted `/s/<slug>` — that path does exist as
// a short alias but is not the canonical target and is not the shape users
// typically paste from the browser.
//
// To stop the intake + admin + overlay paths from drifting again, all slug
// normalization and URL emission goes through this module.

const SLUG_CHAR_PATTERN = /^[a-z0-9_-]+$/;
const MAX_SLUG_LENGTH = 120;

/**
 * Normalize a user- or catalog-provided identifier to a bare slug.
 *
 * Accepts:
 *   - bare slug        ("gumroad")
 *   - canonical URL    ("https://trustmrr.com/startup/gumroad")
 *   - short alias URL  ("https://trustmrr.com/s/gumroad")
 *   - trailing slashes, query strings, mixed case
 *
 * Returns `null` if the input does not contain a valid slug.
 */
export function normalizeTrustmrrSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Strip protocol + host + leading path prefix if present. We match both
  // the canonical `/startup/<slug>` and the short `/s/<slug>` forms.
  const urlMatch = trimmed.match(
    /trustmrr\.com\/(?:startup|s)\/([a-z0-9_-]+)/i,
  );
  const candidate = urlMatch ? urlMatch[1] : trimmed;

  if (!SLUG_CHAR_PATTERN.test(candidate)) return null;
  if (candidate.length > MAX_SLUG_LENGTH) return null;
  return candidate;
}

/**
 * Build the canonical outbound URL for a TrustMRR slug. Always uses the
 * `/startup/` form — that is what the catalog emits and what the TrustMRR
 * site treats as the primary target.
 *
 * Callers may pass a raw slug or a pre-validated one; we normalize defensively
 * so no call site can accidentally emit a URL with an empty or malformed slug.
 */
export function trustmrrProfileUrl(slug: string): string {
  const normalized = normalizeTrustmrrSlug(slug);
  if (!normalized) {
    throw new Error(`invalid trustmrr slug: ${JSON.stringify(slug)}`);
  }
  return `https://trustmrr.com/startup/${normalized}`;
}
