// Hydrate every per-source mention cache + the cross-source detail rollup from
// the data-store, so the mentions-rollup decorator (and MentionSourcePips)
// surface the LIVE redis data instead of a cold cache.
//
// Why this exists: the per-source getters (getHnMentions, getBlueskyMentions,
// …) and getCrossSourceDetail are sync and only return data after their
// `refreshXxxFromStore()` has hydrated the in-memory cache. Before 2026-05-27
// those refreshes ran only in source-health.ts — never in the page render
// path — so profiles + list rows showed almost no mentions even though the
// data was fresh in redis. Call this in the Promise.all on any surface that
// renders mentions (home page, repo profile). Each refresh is 30s
// rate-limited + in-flight-deduped, so calling per-render is cheap.

import { refreshHackernewsMentionsFromStore } from "./hackernews";
import { refreshBlueskyMentionsFromStore } from "./bluesky";
import { refreshDevtoMentionsFromStore } from "./devto";
import { refreshLobstersMentionsFromStore } from "./lobsters";
import { refreshRedditMentionsFromStore } from "./reddit-data";
import { refreshNpmFromStore } from "./npm";
import { refreshProducthuntLaunchesFromStore } from "./producthunt";
import { refreshArxivFromStore } from "./arxiv";
import { refreshCrossSourceMentionsFromStore } from "./cross-source-mentions";
import { refreshMentionsLedgerFromStore } from "./mentions-ledger";

/**
 * Refresh all mention/cross-source stores in parallel. Never throws — each
 * refresh swallows its own error (the data-store reader already preserves the
 * last-known cache on a miss). Twitter is intentionally absent: it reads its
 * bundled signal file synchronously and needs no async refresh.
 */
export async function refreshAllMentionStores(): Promise<void> {
  await Promise.all([
    refreshHackernewsMentionsFromStore().catch(() => undefined),
    refreshBlueskyMentionsFromStore().catch(() => undefined),
    refreshDevtoMentionsFromStore().catch(() => undefined),
    refreshLobstersMentionsFromStore().catch(() => undefined),
    refreshRedditMentionsFromStore().catch(() => undefined),
    refreshNpmFromStore().catch(() => undefined),
    refreshProducthuntLaunchesFromStore().catch(() => undefined),
    refreshArxivFromStore().catch(() => undefined),
    refreshCrossSourceMentionsFromStore().catch(() => undefined),
    // Lifetime cumulative per-source counts (worker mentions-ledger snapshot).
    refreshMentionsLedgerFromStore().catch(() => undefined),
  ]);
}
