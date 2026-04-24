// Adapter factory — picks an outbound adapter based on env. Cron
// endpoints call `selectOutboundAdapter()` once and use whatever
// they get back; they don't condition behaviour on which adapter is
// returned.
//
// Selection rules (highest priority first):
//   1. TWITTER_OUTBOUND_MODE=null     → NullOutboundAdapter (force no-op)
//   2. TWITTER_OUTBOUND_MODE=console  → ConsoleOutboundAdapter (log only)
//   3. TWITTER_OAUTH2_USER_TOKEN set  → ApiV2OutboundAdapter (publish)
//   4. NODE_ENV=development           → ConsoleOutboundAdapter (safe default)
//   5. otherwise                      → NullOutboundAdapter (no-op + warn)
//
// In rule 5 we emit a one-shot console.warn so a misconfigured prod
// deploy is visible in the logs without blowing up cron runs.

import { ApiV2OutboundAdapter } from "./api-v2";
import { ConsoleOutboundAdapter } from "./console";
import { NullOutboundAdapter } from "./null";
import type { OutboundAdapter } from "../types";

let prodMissingTokenWarned = false;

export function selectOutboundAdapter(): OutboundAdapter {
  const mode = process.env.TWITTER_OUTBOUND_MODE?.toLowerCase();
  if (mode === "null") return new NullOutboundAdapter();
  if (mode === "console") return new ConsoleOutboundAdapter();

  const token = process.env.TWITTER_OAUTH2_USER_TOKEN;
  if (token && token.trim()) {
    return new ApiV2OutboundAdapter({
      bearerToken: token.trim(),
      username: process.env.TWITTER_USERNAME?.trim() || undefined,
    });
  }

  if (process.env.NODE_ENV === "development") {
    return new ConsoleOutboundAdapter();
  }

  if (!prodMissingTokenWarned) {
    prodMissingTokenWarned = true;
    console.warn(
      "[twitter:outbound] TWITTER_OAUTH2_USER_TOKEN is not set. Cron " +
        "endpoints will run as no-ops. Set the token (and TWITTER_USERNAME " +
        "for nice URLs) to enable publishing, or TWITTER_OUTBOUND_MODE=console " +
        "to log composed threads without publishing.",
    );
  }
  return new NullOutboundAdapter();
}

export { ApiV2OutboundAdapter, ConsoleOutboundAdapter, NullOutboundAdapter };
