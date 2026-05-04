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

export type EngineErrorCategory = "recoverable" | "quarantine" | "fatal";

export type EngineErrorSource =
  | "rate-limit"
  | "auth"
  | "admin"
  | "ops-alert"
  | "data-store"
  | "github"
  | "reddit"
  | "twitter"
  | "twitter-apify"
  | "twitter-nitter"
  | "hackernews"
  | "bluesky"
  | "devto"
  | "lobsters"
  | "producthunt"
  | "huggingface"
  | "npm"
  | "arxiv"
  | "sentry-canary";

export class AuthRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "auth" as const;
}

export class AuthQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "auth" as const;
}

export class AuthFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "auth" as const;
}

export class RateLimitRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "rate-limit" as const;
}

export class AdminRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "admin" as const;
}

export class AdminQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "admin" as const;
}

export class AdminFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "admin" as const;
}

export class OpsAlertFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "ops-alert" as const;
}

export class OpsAlertRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "ops-alert" as const;
}

export class DataStoreFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "data-store" as const;
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

export class RedditRateLimitError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "reddit";
}

export class RedditBlockedError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "reddit";
}

export class RedditPoolExhaustedError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "reddit";
}

export class RedditRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "reddit";
}

export class ApifyQuotaError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "twitter-apify";
}

export class ApifyTokenInvalidError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "twitter-apify";
}

export class NitterInstanceDownError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "twitter-nitter";
}

export class NitterAllInstancesDownError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "twitter-nitter";
}

export class TwitterAllSourcesFailedError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "twitter";
}

export function engineErrorTags(error: unknown): Record<string, string> {
  if (!(error instanceof EngineError)) return {};
  return {
    source: error.source,
    category: error.category,
  };
}
