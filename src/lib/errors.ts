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
