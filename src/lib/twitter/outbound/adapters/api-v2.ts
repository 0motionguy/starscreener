// Twitter API v2 adapter — posts via direct fetch() calls so the
// project doesn't take a hard dep on a third-party SDK.
//
// Auth model: OAuth 2.0 user-context. Two modes:
//   - tokenProvider (preferred): refresh-token rotation via
//     ../oauth.ts — tokens self-renew, 401s trigger one refresh+retry.
//   - bearerToken: static TWITTER_OAUTH2_USER_TOKEN. Kept for simple
//     setups, but X expires these (~2h) so posting decays until the
//     operator regenerates the token manually.
//
// Rate limits (as of 2026): Twitter's free tier caps at ~17 posts/day.
// Our cron schedule (1 daily thread of up to 12 posts = 1 intro + 10
// items + 1 idea, + 1 weekly recap of up to ~5 posts on Fridays, +
// per-published-idea posts at 1/account/day) can reach ~17 on a Friday —
// right at the ceiling. A mid-thread 429 is therefore realistic, which is
// why postThread attaches partialPosts to the thrown error (see below) so
// already-posted repos still enter the cooldown.

import { FatalConfigError, TransientHttpError } from "@/lib/errors";
import type {
  AdapterPostResult,
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
  OutboundTokenProvider,
} from "../types";

const API_BASE = "https://api.twitter.com/2";

interface TwitterTweetResponse {
  data?: { id: string; text: string };
  errors?: { message: string }[];
}

export interface ApiV2AdapterOptions {
  /**
   * Static access token. Simple but decays — X user-context tokens
   * expire (~2h), after which every post 401s until the operator
   * regenerates it. Prefer `tokenProvider`.
   */
  bearerToken?: string;
  /**
   * Refresh-capable token source (OAuth2 rotation). When set it wins
   * over `bearerToken`, and a 401 mid-thread triggers one
   * invalidate-and-refresh retry before the error surfaces.
   */
  tokenProvider?: OutboundTokenProvider;
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

  private readonly bearerToken: string | null;
  private readonly tokenProvider: OutboundTokenProvider | null;
  private readonly username: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiV2AdapterOptions) {
    if (!opts.bearerToken && !opts.tokenProvider) {
      throw new FatalConfigError(
        "ApiV2OutboundAdapter: either bearerToken or tokenProvider is required",
      );
    }
    this.bearerToken = opts.bearerToken ?? null;
    this.tokenProvider = opts.tokenProvider ?? null;
    this.username = opts.username ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async currentToken(): Promise<string> {
    if (this.tokenProvider) return this.tokenProvider.getAccessToken();
    return this.bearerToken as string;
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

      const send = (token: string) =>
        this.fetchImpl(`${API_BASE}/tweets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

      let res = await send(await this.currentToken());
      if (res.status === 401 && this.tokenProvider) {
        // Token died between the provider's expiry estimate and now —
        // force a rotation and retry this post once before giving up.
        res = await send(await this.tokenProvider.invalidateAndRefresh());
      }

      if (!res.ok) {
        // Throw so the cron route records the run as `error`. Attach the
        // posts published SO FAR (`results`) as partialPosts — the route's
        // catch reads them to still cool-down the repos that DID post, so
        // a mid-thread failure can't re-feature them tomorrow.
        const text = await res.text();
        throw new TransientHttpError(
          `Twitter API ${res.status} on post "${post.kind}": ${text.slice(0, 200)}`,
          res.status,
          { kind: post.kind, partialPosts: [...results] },
        );
      }

      const payload = (await res.json()) as TwitterTweetResponse;
      const id = payload.data?.id;
      if (!id) {
        throw new TransientHttpError(
          `Twitter API returned no id for post "${post.kind}": ${JSON.stringify(payload).slice(0, 200)}`,
          0,
          { kind: post.kind, partialPosts: [...results] },
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
      throw new FatalConfigError(
        `composed post "${post.kind}" is ${effectiveLength} chars after shortening — over Twitter's 280 cap`,
        { kind: post.kind, length: effectiveLength },
      );
    }
    return `${post.text}${url}`;
  }

  private buildTweetUrl(id: string): string | null {
    if (!this.username) return null;
    return `https://twitter.com/${this.username}/status/${id}`;
  }
}
