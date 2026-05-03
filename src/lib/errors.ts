export abstract class EngineError extends Error {
  abstract readonly category: "recoverable" | "quarantine" | "fatal";
  abstract readonly source: string;

  constructor(
    message: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class GithubRateLimitError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "github";
}

export class GithubInvalidTokenError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "github";
}

export class GithubPoolExhaustedError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "github";
}

export class GithubRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "github";
}
