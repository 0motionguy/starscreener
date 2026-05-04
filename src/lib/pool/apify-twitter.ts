import {
  ApifyTwitterProvider,
  type ApifySearchOptions,
} from "../../../scripts/_apify-twitter-provider";
import type { TwitterWebPost } from "../../../scripts/_twitter-web-provider";

import { ApifyQuotaError, ApifyTokenInvalidError } from "@/lib/errors";

export type TwitterSignal = TwitterWebPost;

export interface ApifyScrapeOptions {
  query?: string;
  limit?: number;
  sinceISO?: string;
  timeoutMs?: number;
  provider?: ApifyTwitterProvider;
}

const STATUS_RE = /\bHTTP\s+(\d{3})\b/i;

export async function tryApifyScrape(
  repoFullName: string,
  options: ApifyScrapeOptions = {},
): Promise<TwitterSignal[]> {
  const provider =
    options.provider ??
    new ApifyTwitterProvider({
      timeoutMs: options.timeoutMs ?? 30_000,
    });

  const query = options.query?.trim() || `"${repoFullName}"`;
  const searchOptions: ApifySearchOptions = {
    query,
    limit: options.limit ?? 25,
    sinceISO: options.sinceISO,
  };

  try {
    return await provider.search(searchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractStatusCode(message);
    if (statusCode === 401 || statusCode === 403 || /unauthorized|invalid/i.test(message)) {
      throw new ApifyTokenInvalidError("Apify token invalid or unauthorized", {
        repoFullName,
        statusCode,
        message,
      });
    }
    if (statusCode === 402 || statusCode === 429 || /quota|rate limit/i.test(message)) {
      throw new ApifyQuotaError("Apify quota exhausted or rate-limited", {
        repoFullName,
        statusCode,
        message,
      });
    }
    throw error;
  }
}

function extractStatusCode(message: string): number | null {
  const match = message.match(STATUS_RE);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) return null;
  return value;
}
