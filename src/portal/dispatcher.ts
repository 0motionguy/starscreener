// StarScreener — Portal /portal/call dispatcher.
//
// Maps a { tool, params } request to one of the registered tool handlers
// and wraps the result in the v0.1 envelope. ParamError -> INVALID_PARAMS,
// NotFoundError -> NOT_FOUND, AuthError -> UNAUTHORIZED, any other throw
// -> INTERNAL, unknown tool -> NOT_FOUND. The route handler enforces
// rate limits before calling here and resolves the caller's auth
// principal (from x-api-key / INTERNAL_AGENT_TOKENS_JSON) via the
// `ctx.principal` pass-through — write tools throw AuthError when it's
// absent.

import {
  AuthError,
  NotFoundError,
  ParamError,
  TOOLS_BY_NAME,
  type ToolCallContext,
} from "../tools";

export interface CallSuccess<T = unknown> {
  ok: true;
  result: T;
}

export interface CallFailure {
  ok: false;
  error: string;
  code: "NOT_FOUND" | "INVALID_PARAMS" | "INTERNAL" | "UNAUTHORIZED";
}

export type CallEnvelope = CallSuccess | CallFailure;

export async function dispatchCall(
  body: unknown,
  ctx: ToolCallContext = {},
): Promise<CallEnvelope> {
  // Body shape: { tool: string, params?: object }
  if (body === null || typeof body !== "object") {
    return {
      ok: false,
      error: "request body must be a JSON object with { tool, params }",
      code: "INVALID_PARAMS",
    };
  }
  const b = body as Record<string, unknown>;
  const toolName = b.tool;
  if (typeof toolName !== "string" || toolName.length === 0) {
    return {
      ok: false,
      error: "'tool' must be a non-empty string",
      code: "INVALID_PARAMS",
    };
  }

  const tool = TOOLS_BY_NAME.get(toolName);
  if (!tool) {
    return {
      ok: false,
      error: `tool '${toolName}' not in manifest`,
      code: "NOT_FOUND",
    };
  }

  const params = b.params ?? {};

  try {
    const result = await Promise.resolve(tool.handler(params, ctx));
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ParamError) {
      return { ok: false, error: err.message, code: "INVALID_PARAMS" };
    }
    if (err instanceof NotFoundError) {
      return { ok: false, error: err.message, code: "NOT_FOUND" };
    }
    if (err instanceof AuthError) {
      return { ok: false, error: err.message, code: "UNAUTHORIZED" };
    }
    const message =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    // Log the raw error server-side so operators can debug; envelope stays
    // clean so we don't leak stack traces to visitors.
    console.error(
      `[starscreener/portal] ${toolName} threw:`,
      err,
    );
    return { ok: false, error: message, code: "INTERNAL" };
  }
}
