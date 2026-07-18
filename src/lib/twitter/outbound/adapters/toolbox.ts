// Toolbox-engine adapter — forwards the composed thread to the Twitter
// engine running on the VPS (toolbox box) instead of calling the X API
// directly. The engine owns credentials, rate budgets, and the actual
// publish; this app stays responsible for WHAT gets posted (selection,
// composition, dedupe, freshness) and the audit trail.
//
// Wire contract (deliberately minimal so the engine side can evolve):
//   POST ${TOOLBOX_REACH_URL}
//   Authorization: Bearer ${TOOLBOX_REACH_API_KEY}
//   { "kind": "thread", "posts": [{ "kind", "text", "url" }] }
// Expected response:
//   { "ok": true, "threadUrl"?: string|null,
//     "posts"?: [{ "remoteId"?, "url"?, "status"? }] }
// A bare `{ "ok": true }` is accepted — every post is then recorded as
// published with null URLs. Non-2xx or `ok:false` throws so the cron
// route records the run as `error`, mirroring the api-v2 adapter.

import { FatalConfigError, TransientHttpError } from "@/lib/errors";
import type {
  AdapterPostResult,
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../types";

export interface ToolboxAdapterOptions {
  /** Full URL of the engine's publish endpoint (TOOLBOX_REACH_URL). */
  endpointUrl: string;
  /** Bearer credential for the endpoint (TOOLBOX_REACH_API_KEY). */
  apiKey: string;
  /** Override for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface ToolboxPublishResponse {
  ok?: boolean;
  threadUrl?: string | null;
  posts?: Array<{
    remoteId?: string | null;
    url?: string | null;
    status?: AdapterPostResult["status"];
  }>;
  error?: string;
}

export class ToolboxOutboundAdapter implements OutboundAdapter {
  readonly name = "toolbox_reach";
  readonly publishes = true;

  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ToolboxAdapterOptions) {
    if (!opts.endpointUrl || !opts.apiKey) {
      throw new FatalConfigError(
        "ToolboxOutboundAdapter: endpointUrl and apiKey are both required",
      );
    }
    this.endpointUrl = opts.endpointUrl;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
    const res = await this.fetchImpl(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        kind: "thread",
        posts: thread.map((post) => ({
          kind: post.kind,
          text: post.text,
          url: post.url ?? null,
        })),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new TransientHttpError(
        `Toolbox reach endpoint ${res.status}: ${text.slice(0, 200)}`,
        res.status,
        { postCount: thread.length },
      );
    }

    let payload: ToolboxPublishResponse;
    try {
      payload = (await res.json()) as ToolboxPublishResponse;
    } catch {
      throw new TransientHttpError(
        "Toolbox reach endpoint returned non-JSON body on a 2xx response",
        res.status,
      );
    }
    if (payload.ok === false) {
      throw new TransientHttpError(
        `Toolbox reach endpoint reported failure: ${payload.error ?? "no error message"}`,
        res.status,
      );
    }

    const posts: AdapterPostResult[] = thread.map((_, i) => {
      const remote = payload.posts?.[i];
      return {
        remoteId: remote?.remoteId ?? null,
        url: remote?.url ?? null,
        status: remote?.status ?? "published",
      };
    });

    return {
      posts,
      threadUrl: payload.threadUrl ?? posts[0]?.url ?? null,
    };
  }
}

export function readToolboxReachConfigFromEnv(): {
  endpointUrl: string;
  apiKey: string;
} | null {
  const endpointUrl = process.env.TOOLBOX_REACH_URL?.trim();
  const apiKey = process.env.TOOLBOX_REACH_API_KEY?.trim();
  if (!endpointUrl || !apiKey) return null;
  return { endpointUrl, apiKey };
}
