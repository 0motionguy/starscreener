// Shared API route helpers.
//
// Today this module only exposes `withBodySizeLimit`, the Content-Length
// guard previously inlined into individual cron routes. Centralising it
// here keeps the 2MB ceiling in one place — bump it once and every cron
// inherits the new bound on the next deploy.

import { NextResponse } from "next/server";

/**
 * Default body-size ceiling for cron / internal routes. 2 MiB is generous
 * for JSON triggers (Vercel Cron POSTs `{}` and our biggest cron payload —
 * aiso-drain — caps at ~16 KB). Larger payloads are almost certainly hostile.
 */
export const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

/**
 * Reject the request with HTTP 413 when its `Content-Length` header exceeds
 * `maxBytes`. Returns `null` to let the caller continue handling normally.
 *
 * Mirrors the inline pattern from
 * `src/app/api/internal/signals/twitter/v1/ingest/route.ts` so cron + agent
 * surfaces stay shaped the same way; the helper standardises the error body
 * shape (`{ ok: false, error: "payload_too_large", maxBytes }`).
 *
 * Note: the Content-Length header is the only cheap pre-stream check we
 * have. A hostile caller can still send a chunked body without a header —
 * downstream `request.json()` will still allocate it. Pair with router-
 * level limits (Vercel's `bodyParser.sizeLimit`) for hard enforcement.
 */
export function withBodySizeLimit(
  request: Request,
  maxBytes: number = DEFAULT_BODY_LIMIT_BYTES,
): NextResponse | null {
  const header = request.headers.get("content-length");
  if (!header) return null;
  const len = Number.parseInt(header, 10);
  if (!Number.isFinite(len) || len <= maxBytes) return null;
  return NextResponse.json(
    {
      ok: false,
      error: "payload_too_large",
      maxBytes,
    },
    { status: 413 },
  );
}
