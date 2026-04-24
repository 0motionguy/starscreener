// StarScreener — Extended social-adapter factory.
//
// Composes the default HN/Reddit/GitHub adapter set with the two newer live
// adapters (Dev.to, Bluesky) that previously only existed as static-JSON
// scrapers. The ingest route (src/app/api/pipeline/ingest/route.ts) uses
// this factory so every fetched mention — regardless of source — round-trips
// through MentionStore for dedup, URL normalisation, and jsonl persistence.
//
// This file is intentionally thin. Default-adapter tweaks live in
// social-adapters.ts; Dev.to / Bluesky implementations live in their own
// modules. Adding a new adapter = add a class + append to the array below.

import { BlueskyAdapter } from "./bluesky-adapter";
import { DevtoAdapter } from "./devto-adapter";
import { getDefaultSocialAdapters } from "./social-adapters";
import type { SocialAdapter } from "../types";

// Re-export the canonical SocialAdapter type so callers can import this
// module without also reaching into ../types.
export type { SocialAdapter };

/**
 * Full adapter set including the Dev.to + Bluesky live adapters. Ordering
 * matters only for debug logs — MentionStore dedups across sources.
 */
export function getExtendedSocialAdapters(): SocialAdapter[] {
  return [
    ...getDefaultSocialAdapters(),
    new DevtoAdapter(),
    new BlueskyAdapter(),
  ];
}
