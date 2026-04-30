// StarScreener — compare-share shortlinks generator
//
// 8-char Crockford base32 (no I/L/O/U). At 32^8 ≈ 1.1T IDs the birthday-bound
// collision is negligible at any realistic save volume. Server-side only.

import { randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford
const SHORT_ID_LENGTH = 8;
const SHORT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Generate a fresh random short ID. Always SHORT_ID_LENGTH chars. */
export function generateShortId(): string {
  const bytes = randomBytes(SHORT_ID_LENGTH);
  let out = "";
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Validate that a path/query param is a well-formed short ID. */
export function isShortId(value: string): boolean {
  return SHORT_ID_PATTERN.test(value);
}
