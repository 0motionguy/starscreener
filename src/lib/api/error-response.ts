// Centralized server-error response builder for API route handlers.
//
// Replaces the pattern:
//   const message = err instanceof Error ? err.message : String(err);
//   return NextResponse.json({ error: message }, { status: 500 });
//
// which leaked stack-trace prefixes / DB error strings to clients (audit
// finding APP-03). Now: raw error stays server-side via console.error,
// the response carries a generic public message + optional stable code.

import { NextResponse } from "next/server";

export interface ServerErrorBody {
  ok: false;
  error: string;
  code?: string;
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
export function serverError<T = ServerErrorBody>(
  err: unknown,
  opts: ServerErrorOptions,
): NextResponse<T> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${opts.scope} handler failed`, { message });
  const body: ServerErrorBody = {
    ok: false,
    error: opts.publicMessage ?? "server error",
    ...(opts.code ? { code: opts.code } : {}),
  };
  return NextResponse.json(body, { status: opts.status ?? 500 }) as NextResponse<T>;
}
