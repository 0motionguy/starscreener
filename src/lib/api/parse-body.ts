// Zod-backed JSON body parser for API route handlers.
//
// Replaces the pattern:
//   let body; try { body = await req.json() } catch { return 400 }
//   if (typeof body.x !== "string") return 400
//   if (!body.x.trim()) return 400
//   ...
//
// with:
//   const parsed = await parseBody(req, MySchema);
//   if (!parsed.ok) return parsed.response;
//   const data = parsed.data;
//
// Audit finding APP-02: only 2 of 82 API routes used Zod despite CLAUDE.md
// claiming "Zod on all API boundaries". This helper unblocks migration of
// the typeof-ladder routes without per-call boilerplate.

import { NextResponse } from "next/server";
import type { ZodIssue, ZodSchema } from "zod";

export interface ParseBodySuccess<T> {
  ok: true;
  data: T;
}

export interface ParseBodyFailure {
  ok: false;
  response: NextResponse;
}

export type ParseBodyResult<T> = ParseBodySuccess<T> | ParseBodyFailure;

export interface ParseBodyOptions {
  /**
   * Override the public error message on validation failure. Default
   * formats the first Zod issue's message + path.
   */
  publicMessage?: string;
  /** Whether to include `details: ZodIssue[]` in the 400 body. Default: true. */
  includeDetails?: boolean;
  /**
   * Treat an empty / non-JSON body as `{}` and run schema validation
   * against the empty object. Default false. Cron routes that may
   * receive `Content-Length: 0` should set this so they don't 400 on
   * the trigger's no-body POST.
   */
  allowEmpty?: boolean;
}

/**
 * Parse + validate `request.json()` against a Zod schema. Returns either
 * `{ ok: true, data }` or `{ ok: false, response }` — callers `if (!parsed.ok) return parsed.response`.
 *
 * Failure modes:
 *   - body not JSON           → 400 { ok: false, error: "invalid_json" }
 *                                 (suppressed when `opts.allowEmpty` is true;
 *                                 empty body becomes `{}` then runs schema)
 *   - body fails validation   → 400 { ok: false, error: "validation", details? }
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
  opts: ParseBodyOptions = {},
): Promise<ParseBodyResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    if (opts.allowEmpty) {
      raw = {};
    } else {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "request body is not valid JSON" },
          { status: 400 },
        ),
      };
    }
  }

  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const message = opts.publicMessage ?? formatFirstIssue(parsed.error.issues);
  const includeDetails = opts.includeDetails !== false;
  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error: message,
        ...(includeDetails ? { details: parsed.error.issues } : {}),
      },
      { status: 400 },
    ),
  };
}

function formatFirstIssue(issues: readonly ZodIssue[]): string {
  const first = issues[0];
  if (!first) return "validation failed";
  const path = first.path.length > 0 ? first.path.join(".") : "(root)";
  return `${path}: ${first.message}`;
}
