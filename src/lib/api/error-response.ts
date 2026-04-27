// Centralized server-error response builder for API route handlers.
//
// CANONICAL ERROR ENVELOPE (APP-10):
//
//   { ok: false, error: string, code?: string }
//
// Every route should return this shape on 4xx/5xx. The audit flagged
// envelope drift across 80+ routes — bare `{error}`, mixed
// `{ok:false, error}`, and the verbose `{ok:false, error:{code,message,
// retryable}}`. The simpler {ok, error, code?} shape is the project
// standard now: easy to type-narrow on the client, the optional `code`
// covers stable machine-readable cases (BAD_SIGNATURE, RATE_LIMITED,
// etc.) without forcing every error into a sub-object.
//
// New routes should route through `serverError(err, { scope })` for
// 5xx and explicit `errorEnvelope(...)` literals for 4xx.
//
// The lint:err-envelope guard (scripts/check-error-envelope.mjs)
// catches `NextResponse.json({ error: ... })` patterns that drop the
// `ok: false` discriminator.

import { NextResponse } from "next/server";

/**
 * Canonical 4xx/5xx body shape for the StarScreener REST API.
 * @public
 */
export interface ApiErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

/**
 * Backwards-compatible alias preserved while existing callers migrate.
 * @deprecated use ApiErrorEnvelope.
 */
export type ServerErrorBody = ApiErrorEnvelope;

/**
 * Build a canonical error envelope with optional code. Use for explicit
 * 4xx returns (validation, not-found, etc.); for 5xx wraps prefer
 * `serverError(err, { scope })` so the raw error gets logged.
 */
export function errorEnvelope(
  error: string,
  code?: string,
): ApiErrorEnvelope {
  return code ? { ok: false, error, code } : { ok: false, error };
}

export interface ServerErrorOptions {
  /** Operator log scope — usually "[<route-name>]". */
  scope: string;
  /** Optional stable code echoed in the response body. */
  code?: string;
  /** Public error message. Default: "server error". */
  publicMessage?: string;
  /** HTTP status. Default: 500. */
  status?: number;
}

/**
 * Generic so callers can pass their route's response union type
 * (e.g. `serverError<MyErrorResponse>(...)`) without the route's
 * declared return type widening to `NextResponse<unknown>`.
 */
export function serverError<T = ApiErrorEnvelope>(
  err: unknown,
  opts: ServerErrorOptions,
): NextResponse<T> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${opts.scope} handler failed`, { message });
  const body = errorEnvelope(
    opts.publicMessage ?? "server error",
    opts.code,
  );
  return NextResponse.json(body, { status: opts.status ?? 500 }) as NextResponse<T>;
}
