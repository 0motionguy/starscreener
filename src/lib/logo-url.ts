// Shared domain-logo URL helper.
//
// Google's favicon service is the only free, unauthenticated, unrate-limited
// option that reliably returns an image for arbitrary domains. Clearbit's
// logo API was retired in late 2023 (now returns connection errors), and
// unavatar.io rate-limits aggressively under any real page load (429s above
// ~20 concurrent requests).
//
// This is the one place to change if we ever move to a different service —
// every component that renders a company/product logo calls through here.

const BASE = "https://www.google.com/s2/favicons";
const DEFAULT_SIZE = 128;

/**
 * Normalize free-form input (bare domain, full URL, or a legacy Clearbit
 * URL stored in old data files) into a plain hostname suitable for the
 * favicon service.
 */
export function extractDomain(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Unwrap common legacy logo URLs that have the domain in the path.
  // e.g. https://logo.clearbit.com/openai.com → openai.com
  const clearbit = trimmed.match(
    /^https?:\/\/logo\.clearbit\.com\/([^/?#\s]+)/i,
  );
  if (clearbit) return clearbit[1].toLowerCase();
  // Plain domain with no scheme (openai.com / www.openai.com/)
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }
  try {
    const u = new URL(trimmed);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Build a logo URL for a bare domain. Returns null on empty / unparsable
 * input so callers can fall back to initials cleanly.
 */
export function logoFromDomain(
  domain: string | null | undefined,
  size: number = DEFAULT_SIZE,
): string | null {
  const d = extractDomain(domain);
  if (!d) return null;
  const sz = Math.max(16, Math.min(256, Math.round(size)));
  return `${BASE}?domain=${encodeURIComponent(d)}&sz=${sz}`;
}
