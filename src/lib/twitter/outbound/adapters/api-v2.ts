// Twitter API v2 adapter — posts via direct fetch() calls so the
// project doesn't take a hard dep on a third-party SDK.
//
// Auth model: OAuth 2.0 user-context bearer token. The operator
// generates a long-lived token via the Twitter developer console for
// the TrendingRepo posting account and puts it in TWITTER_OAUTH2_USER_TOKEN.
// Refresh-token rotation is a P1 follow-up — for v1, when the token
// expires the operator regenerates it manually.
//
// Rate limits (as of 2026): Twitter's free tier caps at ~17 posts/day.
// Our cron schedule (1 daily thread of ~5 posts + 1 weekly recap of
// ~5 posts + per-published-idea posts at 1/account/day) sits well
// under that ceiling.

import type {
  AdapterPostResult,
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../types";

const API_BASE = "https://api.twitter.com/2";

interface TwitterTweetResponse {
  data?: { id: string; text: string };
  errors?: { message: string }[];
}

export interface ApiV2AdapterOptions {
  bearerToken: string;
  /**
   * Username for building shareable URLs. Optional — when missing we
   * still publish, we just can't construct a public URL for the audit
   * row. The cron caller sets `TWITTER_USERNAME` for this.
   */
  username?: string;
  /** Override for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class ApiV2OutboundAdapter implements OutboundAdapter {
  readonly name = "twitter_api_v2";
  readonly publishes = true;

  private readonly bearerToken: string;
  private readonly username: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiV2AdapterOptions) {
    if (!opts.bearerToken) {
      throw new Error("ApiV2OutboundAdapter: bearerToken is required");
    }
    this.bearerToken = opts.bearerToken;
    this.username = opts.username ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
    const results: AdapterPostResult[] = [];
    let previousId: string | null = null;
    let firstId: string | null = null;

    for (const post of thread) {
      const body: Record<string, unknown> = {
        text: this.formatBody(post),
      };
      if (previousId) {
        body.reply = { in_reply_to_tweet_id: previousId };
      }
      const res = await this.fetchImpl(`${API_BASE}/tweets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Throw so the cron route records the run as `error` with the
        // failing message. Partial-thread state is recorded too — the
        // results list gets appended for every post we attempted.
        const text = await res.text();
        throw new Error(
          `Twitter API ${res.status} on post "${post.kind}": ${text.slice(0, 200)}`,
        );
      }

      const payload = (await res.json()) as TwitterTweetResponse;
      const id = payload.data?.id;
      if (!id) {
        throw new Error(
          `Twitter API returned no id for post "${post.kind}": ${JSON.stringify(payload).slice(0, 200)}`,
        );
      }
      if (!previousId) firstId = id;
      previousId = id;
      results.push({
        remoteId: id,
        url: this.buildTweetUrl(id),
        status: "published",
      });
    }

    return {
      posts: results,
      threadUrl: firstId ? this.buildTweetUrl(firstId) : null,
    };
  }

  /**
   * Concatenate text + url, respecting Twitter's URL shortening (any
   * URL counts as 23 chars regardless of length). Throws if the post
   * exceeds 280 chars after shortening — the composer's job is to keep
   * within budget but we backstop here too.
   */
  private formatBody(post: ComposedPost): string {
    const url = post.url ? ` ${post.url}` : "";
    const effectiveLength = post.text.length + (post.url ? 24 : 0);
    if (effectiveLength > 280) {
      throw new Error(
        `composed post "${post.kind}" is ${effectiveLength} chars after shortening — over Twitter's 280 cap`,
      );
    }
    return `${post.text}${url}`;
  }

  private buildTweetUrl(id: string): string | null {
    if (!this.username) return null;
    return `https://twitter.com/${this.username}/status/${id}`;
  }
}
