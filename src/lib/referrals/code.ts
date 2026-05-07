// Referral code derivation.
//
// Two-step preference:
//   1. If the profile's handle already matches the URL-safe pattern
//      `/^[a-z0-9_-]{3,32}$/`, use it directly (lowercased). Lets users
//      share `?ref=mirko` instead of `?ref=8jq2hk7p`.
//   2. Otherwise (handle has unicode, dots, etc.) derive a stable 8-char
//      base32 prefix from `sha256(profileId)`. The prefix is opaque but
//      deterministic — the same profile always gets the same code.
//
// Case-insensitive uniqueness is enforced at the DB level by the
// `referral_codes_code_lower_uniq` index. We always emit lowercase here
// so collisions across `Mirko` / `mirko` / `MIRKO` resolve to one row.
//
// Pure module — no DB calls, no I/O. The webhook caller is responsible
// for inserting the code with `ON CONFLICT DO NOTHING`.

import "server-only";

import { createHash } from "node:crypto";

const HANDLE_PATTERN = /^[a-z0-9_-]{3,32}$/i;

// RFC 4648 base32 alphabet (no padding). 32 chars → 5 bits per char.
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function bytesToBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/**
 * Derive a stable, URL-safe referral code for a profile.
 *
 * Always returns lowercase. Caller inserts with `ON CONFLICT DO NOTHING`
 * since the same profile may race for code creation across the Clerk
 * webhook + lazy-create paths.
 */
export function deriveCode(handle: string, profileId: string): string {
  if (HANDLE_PATTERN.test(handle)) return handle.toLowerCase();
  const hash = createHash("sha256").update(profileId).digest();
  return bytesToBase32(hash).slice(0, 8).toLowerCase();
}
