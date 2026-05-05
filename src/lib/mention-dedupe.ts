import { normalizeUrl } from "@/lib/pipeline/adapters/normalizer";

/**
 * Canonical URL form used for cross-source mention dedupe.
 *
 * Normalization behavior is delegated to `normalizeUrl`:
 * - strip tracking params (utm_*, ref, etc.)
 * - drop fragments
 * - normalize host + trailing slash
 */
export function canonicalizeUrl(url: string): string {
  return normalizeUrl(url) ?? url.trim().toLowerCase();
}

