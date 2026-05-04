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
  | "arxiv";

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

export class HackerNewsRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "hackernews" as const;
}

export class HackerNewsQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "hackernews" as const;
}

export class HackerNewsFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "hackernews" as const;
}

export class BlueskyRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "bluesky" as const;
}

export class BlueskyQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "bluesky" as const;
}

export class BlueskyFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "bluesky" as const;
}

export class DevtoRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "devto" as const;
}

export class DevtoQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "devto" as const;
}

export class DevtoFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "devto" as const;
}

export class LobstersRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "lobsters" as const;
}

export class LobstersQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "lobsters" as const;
}

export class LobstersFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "lobsters" as const;
}

export class ProductHuntRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "producthunt" as const;
}

export class ProductHuntQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "producthunt" as const;
}

export class ProductHuntFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "producthunt" as const;
}

export class HuggingFaceRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "huggingface" as const;
}

export class HuggingFaceQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "huggingface" as const;
}

export class HuggingFaceFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "huggingface" as const;
}

export class NpmRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "npm" as const;
}

export class NpmQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "npm" as const;
}

export class NpmFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "npm" as const;
}

export class ArxivRecoverableError extends EngineError {
  readonly category = "recoverable" as const;
  readonly source = "arxiv" as const;
}

export class ArxivQuarantineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "arxiv" as const;
}

export class ArxivFatalError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "arxiv" as const;
}

export function engineErrorTags(error: unknown): Record<string, string> {
  if (!(error instanceof EngineError)) return {};
  return {
    source: error.source,
    category: error.category,
  };
}
