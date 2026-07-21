// X engagement — the arming gate. SEPARATE from TWITTER_OUTBOUND_MODE so the
// reply engine arms independently of the 7x/day broadcast autopilot.
//
//   TWITTER_ENGAGEMENT_MODE = off | dry | live
//
//   off  (default / unset / any unknown value) — HARD KILL. The runner does
//        nothing, posts nothing, touches no Redis, calls no LLM.
//   dry  — full pipeline + composed drafts written to the audit trail, but
//        NOTHING is posted and no cap/cooldown is consumed.
//   live — replies are actually posted and caps/cooldowns are recorded.
//
// Defaulting to `off` everywhere is the whole safety story: this posts to a
// LIVE brand account, so arming is strictly opt-in.

import type { EngagementMode } from "./types";

/**
 * Resolve the engagement mode from env. Unknown / unset values collapse to
 * `off` — fail safe, never fail open.
 */
export function resolveEngagementMode(
  env: Record<string, string | undefined> = process.env,
): EngagementMode {
  const raw = (env.TWITTER_ENGAGEMENT_MODE ?? "").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "dry") return "dry";
  return "off";
}
