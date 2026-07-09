// Bluesky (AT Protocol) adapter — publishes the composed thread to a
// Bluesky account as a reply-chained thread. A second, free distribution
// channel that reuses the exact same composed threads + audit trail as the
// X path; selection/composition/freshness all stay upstream.
//
// Auth: app-password. `com.atproto.server.createSession` with
// BLUESKY_IDENTIFIER (handle or DID) + BLUESKY_APP_PASSWORD returns an
// accessJwt + did, cached for the run and refreshed once on a 401.
//
// Posting: `com.atproto.repo.createRecord` into `app.bsky.feed.post`, one
// record per ComposedPost. The first record is the thread root; each
// subsequent record replies to the previous (root + parent refs). The
// post URL is appended to the text AND given a richtext link facet
// (UTF-8 byte offsets) so it renders clickable rather than as bare text.
//
// Budget: Bluesky allows 300 graphemes; the composer already fits X's 280,
// so every post is safely under. Non-2xx throws so the cron route records
// the run as `error`; partialPosts are attached for the cooldown, mirroring
// the api-v2 adapter.

import { FatalConfigError, TransientHttpError } from "@/lib/errors";
import type {
  AdapterPostResult,
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../types";

const DEFAULT_SERVICE = "https://bsky.social";
const POST_COLLECTION = "app.bsky.feed.post";

export interface BlueskyAdapterOptions {
  /** Handle (e.g. `trendingrepo.bsky.social`) or DID. */
  identifier: string;
  /** App password from Bluesky settings (NOT the account password). */
  appPassword: string;
  /** Service base URL. Defaults to https://bsky.social. */
  service?: string;
  /** Override for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface CreateSessionResponse {
  accessJwt?: string;
  did?: string;
}

interface CreateRecordResponse {
  uri?: string;
  cid?: string;
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface LinkFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: "app.bsky.richtext.facet#link"; uri: string }>;
}

export class BlueskyOutboundAdapter implements OutboundAdapter {
  readonly name = "bluesky";
  readonly publishes = true;

  private readonly identifier: string;
  private readonly appPassword: string;
  private readonly service: string;
  private readonly fetchImpl: typeof fetch;

  private session: { accessJwt: string; did: string } | null = null;

  constructor(opts: BlueskyAdapterOptions) {
    if (!opts.identifier || !opts.appPassword) {
      throw new FatalConfigError(
        "BlueskyOutboundAdapter: identifier and appPassword are both required",
      );
    }
    this.identifier = opts.identifier;
    this.appPassword = opts.appPassword;
    this.service = (opts.service ?? DEFAULT_SERVICE).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
    await this.ensureSession();

    const results: AdapterPostResult[] = [];
    let root: StrongRef | null = null;
    let parent: StrongRef | null = null;

    for (const post of thread) {
      const record = this.buildRecord(post, root, parent);
      let ref: StrongRef;
      try {
        ref = await this.createRecord(record);
      } catch (err) {
        // Attach the posts published so far so the cron route can still
        // cool-down the repos that DID post (mirrors api-v2).
        if (err instanceof TransientHttpError) {
          (err.metadata as Record<string, unknown>).partialPosts = [...results];
        }
        throw err;
      }
      if (!root) root = ref;
      parent = ref;
      results.push({
        remoteId: ref.uri,
        url: this.buildPostUrl(ref.uri),
        status: "published",
      });
    }

    return {
      posts: results,
      threadUrl: results[0]?.url ?? null,
    };
  }

  private async ensureSession(): Promise<void> {
    if (this.session) return;
    const res = await this.fetchImpl(
      `${this.service}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: this.identifier,
          password: this.appPassword,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      // Bad handle/app-password is permanent operator config, not transient.
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
      const message = `Bluesky createSession failed with ${res.status}: ${text.slice(0, 200)}`;
      throw permanent
        ? new FatalConfigError(message, { status: res.status })
        : new TransientHttpError(message, res.status);
    }
    const payload = (await res.json()) as CreateSessionResponse;
    if (!payload.accessJwt || !payload.did) {
      throw new TransientHttpError(
        `Bluesky createSession returned no accessJwt/did: ${JSON.stringify(payload).slice(0, 200)}`,
        res.status,
      );
    }
    this.session = { accessJwt: payload.accessJwt, did: payload.did };
  }

  private async createRecord(record: Record<string, unknown>): Promise<StrongRef> {
    const send = () =>
      this.fetchImpl(`${this.service}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.session!.accessJwt}`,
        },
        body: JSON.stringify({
          repo: this.session!.did,
          collection: POST_COLLECTION,
          record,
        }),
      });

    let res = await send();
    if (res.status === 401) {
      // Access JWT expired mid-thread — re-auth once and retry this record.
      this.session = null;
      await this.ensureSession();
      res = await send();
    }

    if (!res.ok) {
      const text = await res.text();
      throw new TransientHttpError(
        `Bluesky createRecord failed with ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    const payload = (await res.json()) as CreateRecordResponse;
    if (!payload.uri || !payload.cid) {
      throw new TransientHttpError(
        `Bluesky createRecord returned no uri/cid: ${JSON.stringify(payload).slice(0, 200)}`,
        res.status,
      );
    }
    return { uri: payload.uri, cid: payload.cid };
  }

  private buildRecord(
    post: ComposedPost,
    root: StrongRef | null,
    parent: StrongRef | null,
  ): Record<string, unknown> {
    const url = post.url?.trim();
    const text = url ? `${post.text}\n${url}` : post.text;
    const record: Record<string, unknown> = {
      $type: POST_COLLECTION,
      text,
      createdAt: new Date().toISOString(),
    };

    if (url) {
      const facet = linkFacet(text, url);
      if (facet) record.facets = [facet];
    }
    if (root && parent) {
      record.reply = { root, parent };
    }
    return record;
  }

  /** Public web URL for an at:// post uri (`at://did/collection/rkey`). */
  private buildPostUrl(atUri: string): string | null {
    const match = atUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
    if (!match) return null;
    return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
  }
}

/**
 * Build an `app.bsky.richtext.facet#link` for the LAST occurrence of `url`
 * in `text`, using UTF-8 byte offsets (AT Proto facet indices are byte-based,
 * not JS string indices). Returns null if the url isn't found.
 */
export function linkFacet(text: string, url: string): LinkFacet | null {
  const charIdx = text.lastIndexOf(url);
  if (charIdx < 0) return null;
  const encoder = new TextEncoder();
  const byteStart = encoder.encode(text.slice(0, charIdx)).length;
  const byteEnd = byteStart + encoder.encode(url).length;
  return {
    index: { byteStart, byteEnd },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
  };
}

export function readBlueskyConfigFromEnv(): {
  identifier: string;
  appPassword: string;
  service?: string;
} | null {
  const identifier = process.env.BLUESKY_IDENTIFIER?.trim();
  const appPassword = process.env.BLUESKY_APP_PASSWORD?.trim();
  if (!identifier || !appPassword) return null;
  const service = process.env.BLUESKY_SERVICE?.trim() || undefined;
  return { identifier, appPassword, service };
}
