import * as Sentry from "@sentry/nextjs";

import {
  ApifyQuotaError,
  ApifyTokenInvalidError,
  TwitterAllSourcesFailedError,
  engineErrorTags,
} from "@/lib/errors";

import {
  tryApifyScrape,
  type ApifyScrapeOptions,
  type TwitterSignal,
} from "./apify-twitter";
import { tryNitterScrape } from "./nitter-twitter";
import { recordDegradation, recordTwitterCall } from "./twitter-telemetry";

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
let sentryCaptureMessage = Sentry.captureMessage;
let sentryCaptureException = Sentry.captureException;

export type TwitterFallbackOptions = ApifyScrapeOptions;

export async function scrapeTwitterFor(
  repoFullName: string,
  options: TwitterFallbackOptions = {},
): Promise<TwitterSignal[]> {
  const startedApify = Date.now();
  try {
    const apifySignals = await runWithRetry(
      () => tryApifyScrape(repoFullName, options),
      (error) => isApifyRecoverable(error),
    );
    await recordTwitterCall({
      source: "apify",
      success: true,
      statusCode: 200,
      responseTimeMs: Date.now() - startedApify,
    });
    return apifySignals;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordTwitterCall({
      source: "apify",
      success: false,
      statusCode: extractStatusCode(message),
      responseTimeMs: Date.now() - startedApify,
    });
    await recordDegradation({ from: "apify", error: message });
    sentryCaptureMessage("twitter source degraded: apify -> nitter fallback", {
      level: "warning",
      tags: { pool: "twitter", alert: "twitter-degraded", source: "apify" },
      extra: { repoFullName, error: message },
    });

    const startedNitter = Date.now();
    try {
      const nitterSignals = await runWithRetry(
        () => tryNitterScrape(repoFullName, options),
        (nitterError) => isRecoverableTransportError(nitterError),
      );
      await recordTwitterCall({
        source: "nitter",
        success: true,
        statusCode: 200,
        responseTimeMs: Date.now() - startedNitter,
      });
      return nitterSignals;
    } catch (nitterError) {
      const nitterMessage =
        nitterError instanceof Error ? nitterError.message : String(nitterError);
      await recordTwitterCall({
        source: "nitter",
        success: false,
        statusCode: extractStatusCode(nitterMessage),
        responseTimeMs: Date.now() - startedNitter,
      });
      await recordDegradation({ from: "nitter", error: nitterMessage });
      const fatal = new TwitterAllSourcesFailedError(
        `Apify failed: ${message}; Nitter failed: ${nitterMessage}`,
        { repoFullName },
      );
      sentryCaptureException(fatal, {
        level: "fatal",
        tags: {
          pool: "twitter",
          alert: "twitter-all-sources-failed",
          ...engineErrorTags(fatal),
        },
      });
      await alertOps("twitter-all-sources-failed", {
        repoFullName,
        apifyError: message,
        nitterError: nitterMessage,
      });
      throw fatal;
    }
  }
}

async function runWithRetry<T>(
  task: () => Promise<T>,
  isRecoverable: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!isRecoverable(error) || attempt >= RETRY_DELAYS_MS.length) {
        throw error;
      }
      await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
    }
  }
  throw new Error("unreachable retry state");
}

function isApifyRecoverable(error: unknown): boolean {
  if (error instanceof ApifyTokenInvalidError) return false;
  if (error instanceof ApifyQuotaError) return false;
  return isRecoverableTransportError(error);
}

function isRecoverableTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message) return true;
  if (message.includes("timeout")) return true;
  if (message.includes("network")) return true;
  if (message.includes("fetch failed")) return true;
  const statusCode = extractStatusCode(message);
  return statusCode !== null && statusCode >= 500;
}

function extractStatusCode(message: string): number | null {
  const match = message.match(/\bhttp\s+(\d{3})\b/i);
  if (!match) return null;
  const status = Number.parseInt(match[1], 10);
  if (!Number.isFinite(status)) return null;
  return status;
}

async function alertOps(
  event: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "twitter-fallback",
        event,
        ts: new Date().toISOString(),
        metadata,
      }),
    });
  } catch {
    // best-effort alert only
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function _setTwitterFallbackSentryForTests(deps: {
  captureMessage: typeof Sentry.captureMessage;
  captureException: typeof Sentry.captureException;
}): void {
  sentryCaptureMessage = deps.captureMessage;
  sentryCaptureException = deps.captureException;
}

export function _resetTwitterFallbackSentryForTests(): void {
  sentryCaptureMessage = Sentry.captureMessage;
  sentryCaptureException = Sentry.captureException;
}
