// No-op adapter. Returned by the factory when no Twitter credentials
// are configured AND we're not in dev. Lets the cron endpoints run end-
// to-end without producing side effects, so a misconfigured production
// deploy fails loud (status: "skipped" on every run) instead of silent.

import type {
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../types";

export class NullOutboundAdapter implements OutboundAdapter {
  readonly name = "null";
  readonly publishes = false;

  async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
    return {
      posts: thread.map(() => ({
        remoteId: null,
        url: null,
        status: "skipped" as const,
      })),
      threadUrl: null,
    };
  }
}
