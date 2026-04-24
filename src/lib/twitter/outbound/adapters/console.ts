// Dry-run adapter for local development and CI smoke tests. Logs each
// composed post with its kind + length to stdout so an operator running
// the cron locally can inspect what would have been posted.
//
// Use:
//   TWITTER_OUTBOUND_MODE=console
// or
//   leave TWITTER_OAUTH2_USER_TOKEN unset in NODE_ENV=development.

import type {
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../types";

export class ConsoleOutboundAdapter implements OutboundAdapter {
  readonly name = "console";
  readonly publishes = false;

  async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
    const lines: string[] = [];
    lines.push(`[twitter:console] thread of ${thread.length} post(s):`);
    for (let i = 0; i < thread.length; i++) {
      const post = thread[i]!;
      const lengthHint = post.text.length + (post.url ? 24 : 0);
      lines.push(
        `  ${i + 1}. [${post.kind}] (${lengthHint} chars) ${post.text}${post.url ? `\n     ${post.url}` : ""}`,
      );
    }
    console.log(lines.join("\n"));
    return {
      posts: thread.map(() => ({
        remoteId: null,
        url: null,
        status: "logged" as const,
      })),
      threadUrl: null,
    };
  }
}
