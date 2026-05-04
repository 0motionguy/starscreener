import {
  ApifyQuotaError,
  GithubPoolExhaustedError,
  GithubRecoverableError,
  type EngineError,
  engineErrorTags,
} from "@/lib/errors";

export type VerificationKind = "recoverable" | "quarantine" | "fatal";

export function sentryDsnConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_DSN?.trim() ||
      process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
  );
}

export function syntheticEngineError(kind: VerificationKind): EngineError {
  switch (kind) {
    case "recoverable":
      return new GithubRecoverableError(
        "sentry verification recoverable error",
        { verification: true },
      );
    case "quarantine":
      return new ApifyQuotaError(
        "sentry verification quarantine error",
        { verification: true },
      );
    case "fatal":
      return new GithubPoolExhaustedError("sentry verification fatal error", {
        verification: true,
      });
  }
}

export function verificationTags(kind: VerificationKind): Record<string, string> {
  return {
    ...engineErrorTags(syntheticEngineError(kind)),
    verification: "true",
    verification_kind: kind,
  };
}
