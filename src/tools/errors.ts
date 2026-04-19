// StarScreener — Agent-tool error types.
//
// These classes let tool handlers throw typed failures that the Portal
// dispatcher (and the MCP adapter) map to the correct error envelope. The
// Portal v0.1 spec's ErrorCode set is: NOT_FOUND, INVALID_PARAMS,
// UNAUTHORIZED, RATE_LIMITED, INTERNAL. We cover the first two here; the
// latter three are produced at the transport layer, not inside handlers.

export class ParamError extends Error {
  readonly code = "INVALID_PARAMS" as const;
  constructor(message: string) {
    super(message);
    this.name = "ParamError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export type ToolErrorCode =
  | "NOT_FOUND"
  | "INVALID_PARAMS"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";
