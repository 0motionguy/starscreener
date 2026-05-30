/**
 * Local error taxonomy for trendingrepo-worker.
 *
 * Sprint 5.6 — mirrors src/lib/errors.ts shape from the main app.
 * Pending publication of `@0motionguy/toolbox-errors` (Sprint 5.5);
 * swap imports here when that lands.
 */

export type EngineErrorCategory = "recoverable" | "quarantine" | "fatal";

export type EngineErrorSource =
  | "rate-limit"
  | "auth"
  | "data-store"
  | "http-transient"
  | "fatal-config"
  | "github"
  | "reddit"
  | "bluesky"
  | "hackernews"
  | "devto"
  | "lobsters"
  | "huggingface"
  | "npm"
  | "arxiv";

export abstract class EngineError extends Error {
  abstract readonly category: EngineErrorCategory;
  abstract readonly source: EngineErrorSource;

  constructor(
    message: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// ── HTTP transient ─────────────────────────────────────────────────────

export class TransientHttpError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "http-transient" as const;
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.httpStatus = httpStatus;
  }
}

// ── Rate-limit ─────────────────────────────────────────────────────────

export class RateLimitQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "rate-limit" as const;
}

// ── Data store ─────────────────────────────────────────────────────────

export class DataStoreFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "data-store" as const;
}

// ── Fatal config ───────────────────────────────────────────────────────

export class FatalConfigError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "fatal-config" as const;
}

// ── Auth ───────────────────────────────────────────────────────────────

export class AuthQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "auth" as const;
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}
