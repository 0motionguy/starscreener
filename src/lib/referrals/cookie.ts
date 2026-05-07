// Signed referral-attribution cookie.
//
// Stores `{ code, url, ts, ipHash, uaHash }` in a single cookie value
// signed with HMAC-SHA256 using SESSION_SECRET. The signature lets the
// Clerk webhook trust the cookie payload at signup time — without it,
// any client could spoof a referrer.
//
// Encoding: base64url(JSON(payload)) + "." + base64url(hmac).
// Same shape as `src/lib/api/admin-session.ts` so the verifier code reads
// the same on both surfaces. We hash IP + UA on write so the raw values
// never leave middleware (privacy + cookie-size win — full UAs are long).

import "server-only";

// Use the platform-global WebCrypto API (`globalThis.crypto.subtle`).
// Available in Node 19+ AND in the Edge runtime; importing from
// `node:crypto` breaks the webpack bundle for any Edge route that
// transitively pulls this file (next.js Edge routes don't honour the
// `node:` URI scheme — see Vercel docs on supported APIs).
const subtle = globalThis.crypto.subtle;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

interface RefCookiePayloadIn {
  code: string;
  url: string;
  ts: number;
  ipRaw: string;
  ua: string;
}

export interface RefCookiePayload {
  code: string;
  url: string;
  ts: number;
  ipHash: string;
  uaHash: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not set or too short (need ≥ 16 chars)");
  }
  return secret;
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const filled = pad ? padded + "=".repeat(4 - pad) : padded;
  const raw = atob(filled);
  // Allocate a fresh ArrayBuffer (not SharedArrayBuffer) so the resulting
  // Uint8Array is a valid `BufferSource` for `subtle.verify` under strict
  // typings. Without the explicit `<ArrayBuffer>` parameter, TypeScript
  // widens to `ArrayBufferLike` which excludes the ArrayBuffer-required APIs.
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await subtle.digest("SHA-256", ENCODER.encode(input));
  return toBase64Url(digest).slice(0, 22); // truncate; collisions are fine for fraud signal
}

/**
 * Sign + serialise a referral cookie.
 */
export async function signRefCookie(input: RefCookiePayloadIn): Promise<string> {
  const ipHash = await sha256Base64Url(input.ipRaw);
  const uaHash = await sha256Base64Url(input.ua);
  const payload: RefCookiePayload = {
    code: input.code,
    url: input.url,
    ts: input.ts,
    ipHash,
    uaHash,
  };
  const body = toBase64Url(ENCODER.encode(JSON.stringify(payload)));
  const key = await importHmacKey(getSecret());
  const sig = await subtle.sign("HMAC", key, ENCODER.encode(body));
  return `${body}.${toBase64Url(sig)}`;
}

/**
 * Verify + parse a referral cookie. Returns `null` for any invalid input —
 * caller should treat null as "no referral". NEVER throw; signature
 * failures are normal-path during fraud probes.
 */
export async function verifyRefCookie(
  raw: string | undefined,
): Promise<RefCookiePayload | null> {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let key: CryptoKey;
  try {
    key = await importHmacKey(getSecret());
  } catch {
    return null;
  }
  // `fromBase64Url` returns a Uint8Array<ArrayBufferLike>. Newer
  // TS lib types want a `BufferSource` whose underlying buffer is a
  // plain ArrayBuffer, not the broader ArrayBufferLike. The slice below
  // gives us a fresh ArrayBuffer copy with no SharedArrayBuffer
  // implication, which the WebCrypto API will accept everywhere.
  const sigBytes = fromBase64Url(sig);
  const sigBuf = sigBytes.buffer.slice(
    sigBytes.byteOffset,
    sigBytes.byteOffset + sigBytes.byteLength,
  ) as ArrayBuffer;
  const ok = await subtle.verify(
    "HMAC",
    key,
    sigBuf,
    ENCODER.encode(body),
  );
  if (!ok) return null;
  try {
    const json = DECODER.decode(fromBase64Url(body));
    const payload = JSON.parse(json) as RefCookiePayload;
    if (
      typeof payload?.code !== "string" ||
      typeof payload?.ts !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
