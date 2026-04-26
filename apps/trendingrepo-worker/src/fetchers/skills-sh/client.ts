// Thin Firecrawl /v1/scrape wrapper. Two modes used by the skills.sh fetcher:
//
//   1. JSON-structured extract (primary): formats=[{type:'json',schema,prompt}]
//      with waitFor=5000 to let the JS leaderboard hydrate. Returns
//      data.json shaped to our schema.
//   2. Raw HTML (fallback): formats=['html'] with the same waitFor. Used by
//      parser.parseFromHtml when the structured extract returns no rows.
//
// We use the worker's HttpClient (undici + ETag cache + 429/5xx retries)
// rather than a dedicated Firecrawl SDK so the resilience layer is shared
// with every other fetcher.

import type { HttpClient } from '../../lib/types.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
// skills.sh defers leaderboard data behind XHR fetched after initial render.
// 12s waitFor reliably captures it; lower values return chrome-only HTML.
const DEFAULT_WAIT_MS = 12_000;

export interface FirecrawlScrapeRequest {
  url: string;
  formats: ReadonlyArray<unknown>; // 'html' | 'markdown' | { type: 'json', ... }
  waitFor?: number;
  onlyMainContent?: boolean;
  headers?: Record<string, string>;
}

export interface FirecrawlScrapeResponse<T = unknown> {
  success: boolean;
  data?: {
    html?: string;
    markdown?: string;
    json?: T;
    metadata?: {
      title?: string;
      statusCode?: number;
      sourceURL?: string;
    };
  };
}

export interface FirecrawlClientDeps {
  http: HttpClient;
  apiKey: string;
}

export class FirecrawlClient {
  private readonly http: HttpClient;
  private readonly apiKey: string;

  constructor(deps: FirecrawlClientDeps) {
    this.http = deps.http;
    this.apiKey = deps.apiKey;
  }

  async scrapeJson<T>(
    url: string,
    schema: Record<string, unknown>,
    prompt: string,
    waitMs: number = DEFAULT_WAIT_MS,
  ): Promise<{ data: T | null; statusCode: number | null }> {
    const body = {
      url,
      formats: [
        {
          type: 'json',
          prompt,
          schema,
        },
      ],
      waitFor: waitMs,
      onlyMainContent: false,
    };
    const res = await this.post<FirecrawlScrapeResponse<T>>('/v1/scrape', body);
    return {
      data: (res.data?.json ?? null) as T | null,
      statusCode: res.data?.metadata?.statusCode ?? null,
    };
  }

  async scrapeHtml(
    url: string,
    waitMs: number = DEFAULT_WAIT_MS,
  ): Promise<{ html: string | null; statusCode: number | null }> {
    const body = {
      url,
      formats: ['html'],
      waitFor: waitMs,
      onlyMainContent: false,
    };
    const res = await this.post<FirecrawlScrapeResponse>('/v1/scrape', body);
    return {
      html: res.data?.html ?? null,
      statusCode: res.data?.metadata?.statusCode ?? null,
    };
  }

  async scrapeMarkdown(
    url: string,
    waitMs: number = DEFAULT_WAIT_MS,
  ): Promise<{ markdown: string | null; html: string | null; statusCode: number | null }> {
    const body = {
      url,
      formats: ['markdown', 'html'],
      waitFor: waitMs,
      onlyMainContent: false,
    };
    const res = await this.post<FirecrawlScrapeResponse>('/v1/scrape', body);
    return {
      markdown: res.data?.markdown ?? null,
      html: res.data?.html ?? null,
      statusCode: res.data?.metadata?.statusCode ?? null,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const { data } = await this.http.json<T>(`${FIRECRAWL_BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: body as Record<string, unknown>,
      timeoutMs: 60_000,
      maxRetries: 2,
      useEtagCache: false,
    });
    return data;
  }
}

/** Skills.sh leaderboard JSON schema for Firecrawl's LLM extract. */
export const SKILLS_LEADERBOARD_SCHEMA = {
  type: 'object',
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rank: { type: 'integer' },
          skill_name: { type: 'string' },
          owner: { type: 'string' },
          repo: { type: 'string' },
          installs: {
            type: 'string',
            description: 'Install count as shown on the page (e.g. "1.2M", "350.0K", "42").',
          },
          agents: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Agent compatibility slugs from the per-row icons. Slugs match the skills.sh /agents/<slug>.svg URL pattern.',
          },
          url: {
            type: 'string',
            description: 'Absolute URL to the skill detail page on skills.sh.',
          },
        },
        required: ['rank', 'skill_name', 'owner', 'repo', 'installs', 'agents'],
      },
    },
  },
  required: ['skills'],
} as const;

export const SKILLS_LEADERBOARD_PROMPT =
  'Extract every leaderboard row visible on this skills.sh page. For each row, capture: rank (integer position from the top), skill_name (the skill identifier shown in the row, NOT the path), owner (GitHub org/user from the URL), repo (GitHub repo from the URL), installs (the count shown, e.g. "1.2M"), agents (the list of compatibility-icon slugs in that row), and url (the absolute href). Skip header rows and pagination controls. Return all visible rows.';
