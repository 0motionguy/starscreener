// TOOLBOX Twitter provider — X search through OUR engine on the VPS
// instead of Apify.
//
// Calls the toolbox skill runtime:
//
//   POST ${TOOLBOX_API_URL}/v1/skills/twitter.nitter_search/run
//   Authorization: Bearer ${TOOLBOX_API_KEY}
//   { "input": { "query": "<search>", "limit": <1..50> } }
//
// and maps the returned `signals[]` (type "social.x.post") into the
// collector's TwitterWebPost shape. This is the READ twin of the outbound
// toolbox adapter (src/lib/twitter/outbound/adapters/toolbox.ts) — same
// engine, opposite direction.
//
// Known trade-off, inherited from the engine's nitter-RSS source: NO
// engagement metrics (likes/reposts/views). Mention counting, repo
// matching, and the cross-signal twitter channel all work on post
// presence, so they light up fully; engagement-ranked surfaces treat
// these rows as zero-engagement (same degraded contract as the Wave-4
// reddit RSS path). The engine can upgrade its source later without any
// change here.

import type { TwitterWebPost } from "./_twitter-web-provider";

const RUN_PATH = "/v1/skills/twitter.nitter_search/run";
const MAX_LIMIT = 50; // skill input schema cap

export interface ToolboxSearchOptions {
  query: string;
  limit?: number;
  /** ISO floor — posts older than this are dropped client-side. */
  sinceISO?: string;
}

export interface ToolboxProviderStats {
  requests: number;
  errors: number;
  lastError: string | null;
}

/** One signal from the engine's twitter.nitter_search skill. */
interface ToolboxXSignal {
  type?: string;
  subject?: { kind?: string; id?: string; url?: string };
  value?: {
    text?: string;
    author_handle?: string;
    posted_at?: string | null;
  };
}

export class ToolboxTwitterProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly stats: ToolboxProviderStats = {
    requests: 0,
    errors: 0,
    lastError: null,
  };

  constructor(opts?: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) {
    // GitHub Actions `${{ vars.FOO }}` substitutes an empty string when the
    // var is unset — treat empty/whitespace as missing (same guard as the
    // Apify provider).
    const rawBase = opts?.baseUrl ?? process.env.TOOLBOX_API_URL ?? "";
    const base = rawBase.trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error(
        "TOOLBOX_API_URL unset — point it at the engine (e.g. https://api.aiso.tools) to enable the toolbox Twitter provider",
      );
    }
    const rawKey = opts?.apiKey ?? process.env.TOOLBOX_API_KEY ?? "";
    const apiKey = rawKey.trim();
    if (!apiKey) {
      throw new Error(
        "TOOLBOX_API_KEY unset — set the engine API key to enable the toolbox Twitter provider",
      );
    }
    this.baseUrl = base;
    this.apiKey = apiKey;
    this.timeoutMs = opts?.timeoutMs ?? 30_000;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  getStats(): ToolboxProviderStats {
    return { ...this.stats };
  }

  async search(opts: ToolboxSearchOptions): Promise<TwitterWebPost[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 25), MAX_LIMIT);
    const url = `${this.baseUrl}${RUN_PATH}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    this.stats.requests += 1;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ input: { query: opts.query, limit } }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.stats.errors += 1;
        const text = await res.text().catch(() => "");
        const msg = `toolbox twitter.nitter_search HTTP ${res.status}: ${text.slice(0, 200)}`;
        this.stats.lastError = msg;
        throw new Error(msg);
      }
      const body = (await res.json().catch(() => null)) as
        | { signals?: unknown }
        | unknown[]
        | null;
      // The run route returns an envelope carrying `signals[]`; tolerate a
      // bare array too (older engine builds returned the skill output raw).
      const signals: unknown[] = Array.isArray(body)
        ? body
        : Array.isArray((body as { signals?: unknown })?.signals)
          ? ((body as { signals: unknown[] }).signals)
          : [];

      const sinceMs = opts.sinceISO ? Date.parse(opts.sinceISO) : Number.NaN;
      const out: TwitterWebPost[] = [];
      for (const raw of signals) {
        const post = mapToolboxSignalToWebPost(raw as ToolboxXSignal, opts.query);
        if (!post) continue;
        if (Number.isFinite(sinceMs)) {
          const postedMs = Date.parse(post.postedAt);
          if (Number.isFinite(postedMs) && postedMs < sinceMs) continue;
        }
        out.push(post);
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Map one engine signal to the collector's TwitterWebPost shape. Returns
 * null for rows without an id/url (nothing downstream can key on them).
 * Engagement fields are 0/null by contract — see the header note.
 */
export function mapToolboxSignalToWebPost(
  signal: ToolboxXSignal,
  matchedQuery: string,
): TwitterWebPost | null {
  if (signal?.type !== "social.x.post") return null;
  const id = signal.subject?.id?.trim() ?? "";
  const url = signal.subject?.url?.trim() ?? "";
  if (!id || !url) return null;
  const handle = signal.value?.author_handle?.trim() ?? "";
  return {
    id,
    url,
    authorHandle: handle,
    authorName: null,
    content: signal.value?.text ?? "",
    postedAt: signal.value?.posted_at ?? new Date(0).toISOString(),
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    quoteCount: 0,
    viewCount: null,
    matchedQuery,
    // expandedUrls intentionally omitted — nitter RSS text carries full
    // URLs (no t.co shortening), so there is nothing extra to resolve.
  };
}
