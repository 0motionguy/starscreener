// Adapter factory — picks an outbound adapter based on env. Cron
// endpoints call `selectOutboundAdapter()` once and use whatever
// they get back; they don't condition behaviour on which adapter is
// returned.
//
// Selection rules (highest priority first):
//   1. TWITTER_OUTBOUND_MODE=null     → NullOutboundAdapter (force no-op)
//   2. TWITTER_OUTBOUND_MODE=console  → ConsoleOutboundAdapter (log only)
//   2b. TWITTER_OUTBOUND_MODE=bluesky → BlueskyOutboundAdapter (posts the
//      same composed thread to Bluesky instead of X; throws FatalConfigError
//      when BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD are missing). A second
//      free transport for the same thread — simultaneous X+Bluesky fan-out
//      is a separate follow-up (the cron posts through one adapter per run).
//   3. TWITTER_OUTBOUND_MODE=toolbox  → ToolboxOutboundAdapter (throws
//      FatalConfigError when TOOLBOX_REACH_URL / TOOLBOX_REACH_API_KEY
//      are missing — an explicit mode misconfig should be loud)
//   4. TOOLBOX_REACH_URL + _API_KEY   → ToolboxOutboundAdapter. The VPS
//      Twitter engine is the declared end-state transport, so when its
//      env is present it wins over direct X-API credentials.
//   5. OAuth2 rotation trio set       → ApiV2OutboundAdapter with a
//      refresh-capable token provider (TWITTER_OAUTH2_CLIENT_ID +
//      TWITTER_OAUTH2_CLIENT_SECRET + TWITTER_OAUTH2_REFRESH_TOKEN).
//      Tokens self-renew, so posting doesn't silently die when the ~2h
//      access-token expiry hits.
//   6. TWITTER_OAUTH2_USER_TOKEN set  → ApiV2OutboundAdapter (static token)
//   7. NODE_ENV=development           → ConsoleOutboundAdapter (safe default)
//   8. otherwise                      → NullOutboundAdapter (no-op + warn)
//
// In rule 8 we emit a one-shot console.warn so a misconfigured prod
// deploy is visible in the logs without blowing up cron runs.

import { FatalConfigError } from "@/lib/errors";
import { ApiV2OutboundAdapter } from "./api-v2";
import {
  BlueskyOutboundAdapter,
  readBlueskyConfigFromEnv,
} from "./bluesky";
import { ConsoleOutboundAdapter } from "./console";
import { NullOutboundAdapter } from "./null";
import {
  readToolboxReachConfigFromEnv,
  ToolboxOutboundAdapter,
} from "./toolbox";
import { getSharedTwitterOAuthManager } from "../oauth";
import type { OutboundAdapter } from "../types";

let prodMissingTokenWarned = false;

export function selectOutboundAdapter(): OutboundAdapter {
  const mode = process.env.TWITTER_OUTBOUND_MODE?.toLowerCase();
  if (mode === "null") return new NullOutboundAdapter();
  if (mode === "console") return new ConsoleOutboundAdapter();

  if (mode === "bluesky") {
    const blueskyConfig = readBlueskyConfigFromEnv();
    if (!blueskyConfig) {
      throw new FatalConfigError(
        "TWITTER_OUTBOUND_MODE=bluesky requires BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD",
      );
    }
    return new BlueskyOutboundAdapter(blueskyConfig);
  }

  const toolboxConfig = readToolboxReachConfigFromEnv();
  if (mode === "toolbox") {
    if (!toolboxConfig) {
      throw new FatalConfigError(
        "TWITTER_OUTBOUND_MODE=toolbox requires TOOLBOX_REACH_URL and TOOLBOX_REACH_API_KEY",
      );
    }
    return new ToolboxOutboundAdapter(toolboxConfig);
  }
  if (toolboxConfig) {
    return new ToolboxOutboundAdapter(toolboxConfig);
  }

  const username = process.env.TWITTER_USERNAME?.trim() || undefined;

  const oauthManager = getSharedTwitterOAuthManager();
  if (oauthManager) {
    return new ApiV2OutboundAdapter({
      tokenProvider: oauthManager,
      username,
    });
  }

  const token = process.env.TWITTER_OAUTH2_USER_TOKEN;
  if (token && token.trim()) {
    return new ApiV2OutboundAdapter({
      bearerToken: token.trim(),
      username,
    });
  }

  if (process.env.NODE_ENV === "development") {
    return new ConsoleOutboundAdapter();
  }

  if (!prodMissingTokenWarned) {
    prodMissingTokenWarned = true;
    console.warn(
      "[twitter:outbound] no Twitter credentials configured. Cron " +
        "endpoints will run as no-ops. Set TOOLBOX_REACH_URL + " +
        "TOOLBOX_REACH_API_KEY (VPS engine, preferred), the OAuth2 rotation " +
        "trio (TWITTER_OAUTH2_CLIENT_ID/SECRET/REFRESH_TOKEN), or a static " +
        "TWITTER_OAUTH2_USER_TOKEN (plus TWITTER_USERNAME for nice URLs) " +
        "to enable publishing, or TWITTER_OUTBOUND_MODE=console to log " +
        "composed threads without publishing.",
    );
  }
  return new NullOutboundAdapter();
}

export {
  ApiV2OutboundAdapter,
  BlueskyOutboundAdapter,
  ConsoleOutboundAdapter,
  NullOutboundAdapter,
  ToolboxOutboundAdapter,
};
