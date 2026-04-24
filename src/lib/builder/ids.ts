// TrendingRepo — Builder-layer ID + slug helpers.

import { randomBytes } from "node:crypto";

/** Short prefixed id: `<prefix>_<10-char base36>`. Cryptographically random. */
export function shortId(prefix: string): string {
  // 8 bytes → 13 chars base36 (64 bits). Truncate to 10.
  const n = BigInt("0x" + randomBytes(8).toString("hex"));
  const raw = n.toString(36).padStart(13, "0").slice(0, 10);
  return `${prefix}_${raw}`;
}

/** Slugify a thesis into a URL-safe stub (no uniqueness guarantee — caller must check). */
export function slugify(input: string, maxLen = 60): string {
  const base = input
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return base || shortId("idea").slice(5);
}

/**
 * Deterministic idea id from a slug: `idea_<slug>`. Lets us look up ideas by
 * either id or slug without a separate index on slug.
 */
export function ideaIdFromSlug(slug: string): string {
  return `idea_${slug}`;
}
