// Thin wrapper around @mendable/firecrawl-js for the skills.sh fetcher.
//
// Hides the SDK types behind two narrow methods so the rest of the fetcher
// never touches Firecrawl-shaped objects directly. If the SDK changes shape
// or we swap to a self-hosted Firecrawl / direct Playwright scrape, only
// this file needs editing.
//
//   scrapeJson  - structured /v1/scrape with formats:['json'] + zod schema.
//                 Primary path - LLM extraction is robust to UI churn.
//   scrapeHtml  - raw rendered HTML fallback (formats:['html']) for the
//                 cheerio path. Used when scrapeJson returns < 10 rows.
//
// Both apply waitFor=5000 by default so the skills.sh client-side leaderboard
// hydrates before the snapshot is taken.
//
// We also expose `FirecrawlClient.fromEnv()` so callers don't have to know
// where the API key comes from. Returns null if FIRECRAWL_API_KEY is unset;
// the fetcher's `run()` should check for the key first and skip cleanly.

import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';
import { loadEnv } from '../../lib/env.js';

const DEFAULT_WAIT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface ScrapeJsonResult<T> {
  data: T | null;
  statusCode: number | null;
  warning: string | null;
}

export interface ScrapeHtmlResult {
  html: string | null;
  statusCode: number | null;
  warning: string | null;
}

export interface FirecrawlClientOptions {
  apiKey: string;
  apiUrl?: string;
}

/**
 * The minimal surface our scraper needs. Lets tests stub Firecrawl without
 * mocking the whole SDK.
 */
export interface FirecrawlLike {
  scrapeJson<T>(
    url: string,
    schema: z.ZodSchema<T>,
    prompt: string,
    waitMs?: number,
  ): Promise<ScrapeJsonResult<T>>;
  scrapeHtml(url: string, waitMs?: number): Promise<ScrapeHtmlResult>;
}

export class FirecrawlClient implements FirecrawlLike {
  private readonly app: FirecrawlApp;

  constructor(opts: FirecrawlClientOptions) {
    const ctorArg: { apiKey: string; apiUrl: string | null } = {
      apiKey: opts.apiKey,
      apiUrl: opts.apiUrl ?? null,
    };
    this.app = new FirecrawlApp(ctorArg);
  }

  static fromEnv(): FirecrawlClient | null {
    const env = loadEnv();
    if (!env.FIRECRAWL_API_KEY) return null;
    return new FirecrawlClient({ apiKey: env.FIRECRAWL_API_KEY });
  }

  async scrapeJson<T>(
    url: string,
    schema: z.ZodSchema<T>,
    prompt: string,
    waitMs: number = DEFAULT_WAIT_MS,
  ): Promise<ScrapeJsonResult<T>> {
    // Firecrawl SDK pins its own zod@3 install; our project ships zod@4.
    // The schema is structurally identical at runtime (we only use object/
    // array/string/number/union) but the v3/v4 type-tag mismatch makes TS
    // refuse the assignment. Cast to `any` at the SDK boundary and let
    // Firecrawl serialise via its bundled zod-to-json-schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkSchema = schema as unknown as any;
    const res = await this.app.scrapeUrl(url, {
      formats: ['json'],
      onlyMainContent: false,
      waitFor: waitMs,
      timeout: DEFAULT_TIMEOUT_MS,
      jsonOptions: { schema: sdkSchema, prompt },
    });
    if (!res.success) {
      return { data: null, statusCode: null, warning: res.error ?? 'firecrawl error' };
    }
    const json = (res as { json?: unknown }).json;
    return {
      data: (json ?? null) as T | null,
      statusCode: res.metadata?.statusCode ?? null,
      warning: res.warning ?? null,
    };
  }

  async scrapeHtml(url: string, waitMs: number = DEFAULT_WAIT_MS): Promise<ScrapeHtmlResult> {
    const res = await this.app.scrapeUrl(url, {
      formats: ['html'],
      onlyMainContent: false,
      waitFor: waitMs,
      timeout: DEFAULT_TIMEOUT_MS,
    });
    if (!res.success) {
      return { html: null, statusCode: null, warning: res.error ?? 'firecrawl error' };
    }
    return {
      html: res.html ?? null,
      statusCode: res.metadata?.statusCode ?? null,
      warning: res.warning ?? null,
    };
  }
}

/**
 * Zod schema for the leaderboard JSON shape we ask Firecrawl to extract.
 * Accepting `installs` as string or number because the LLM occasionally
 * returns one or the other depending on the column wording. The shape is
 * passed straight to Firecrawl's jsonOptions.schema and parsed downstream
 * by parseFromExtract.
 */
export const SKILLS_LEADERBOARD_SCHEMA = z.object({
  skills: z.array(
    z.object({
      rank: z.number().int().optional(),
      skill_name: z.string(),
      owner: z.string(),
      repo: z.string(),
      installs: z.union([z.string(), z.number()]).optional(),
      agents: z.array(z.string()).default([]),
      url: z.string().optional(),
    }),
  ),
});

export type SkillsLeaderboardExtract = z.infer<typeof SKILLS_LEADERBOARD_SCHEMA>;

export const SKILLS_LEADERBOARD_PROMPT =
  'Extract every leaderboard row visible on this skills.sh page. For each row, capture: rank (integer position from the top), skill_name (the skill identifier shown in the row, NOT the path), owner (GitHub org/user from the URL), repo (GitHub repo from the URL), installs (the count shown, e.g. "1.2M"), agents (the list of compatibility-icon slugs in that row, matching the skills.sh /agents/<slug>.svg URL pattern), and url (the absolute href). Skip header rows and pagination controls. Return all visible rows.';
